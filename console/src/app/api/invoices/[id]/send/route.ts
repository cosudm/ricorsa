import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { InvoiceSend } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { invoiceView } from '@/lib/views';
import { createPaypalInvoice, sendPaypalInvoice, paypalConfigured, ensureInvoiceWebhook } from '@/lib/paypal';
import { sendEmail, messageHtml, messageText, emailConfigured } from '@/lib/email';
import { getSetting, setSetting } from '@/lib/settings';
import { renderInvoicePdf } from '@/lib/invoice-ops';
import { fmtMoney } from '@/lib/pdf';
import { touchCustomer } from '@/lib/customers';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/:id/send — issue the invoice. `via` 'paypal' creates and sends a PayPal invoice (the customer
 * pays online), 'email' sends our own message with the PDF attached, 'both' does both (default: whatever is configured).
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such invoice', 'not_found');
  if (row.status === 'void') return fail(409, 'This invoice is void', 'void');
  if (row.status === 'paid') return fail(409, 'This invoice is already paid', 'paid');
  const b = parse(InvoiceSend, await readJson(req));
  const via = b.via || (paypalConfigured() && emailConfigured() ? 'both' : paypalConfigured() ? 'paypal' : 'email');
  const wantPaypal = via === 'paypal' || via === 'both', wantEmail = via === 'email' || via === 'both';
  if (wantPaypal && !paypalConfigured()) return fail(503, 'PayPal is not configured on the console (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)', 'paypal_unconfigured');
  if (wantEmail && !emailConfigured()) return fail(503, 'Email sending is not set up yet: add the RESEND_API_KEY secret to the console.', 'email_unconfigured');
  const to = b.to || row.billTo?.email || null;
  if (!to) return fail(400, 'The invoice has no email address to send to; add one to the customer or to the invoice', 'no_email');
  const [company, emailSettings] = await Promise.all([getSetting('company'), getSetting('email')]);
  const set: Partial<typeof row> = { status: 'sent', sentTo: to, sentAt: new Date(), issuedAt: row.issuedAt || new Date(), updatedAt: new Date() };
  const notes: string[] = [];

  if (wantPaypal) {
    let ppId = row.paypalInvoiceId, ppUrl = row.paypalLink;
    if (!ppId) {
      const created = await createPaypalInvoice({ number: row.number, currency: row.currency, items: row.items, issuedAt: set.issuedAt!, dueAt: row.dueAt, notes: row.notes, terms: row.terms, billTo: { ...(row.billTo || {}), email: to } }, company);
      ppId = created.id; ppUrl = created.url;
      await d.update(schema.invoices).set({ paypalInvoiceId: ppId, paypalLink: ppUrl, paypalStatus: 'DRAFT' }).where(eq(schema.invoices.id, id));
    }
    await sendPaypalInvoice(ppId);
    Object.assign(set, { paypalInvoiceId: ppId, paypalLink: ppUrl, paypalStatus: 'SENT' });
    notes.push('PayPal emailed the invoice with a Pay button');
    // First send registers the webhook that reports payments back (best effort; a manual refresh works without it).
    try {
      const saved = await getSetting('paypal');
      if (!saved.webhookId) await setSetting('paypal', { webhookId: await ensureInvoiceWebhook(`${process.env.APP_BASE_URL}/api/webhooks/paypal`) });
    } catch (e) { console.warn('[invoice] webhook registration failed', String((e as Error)?.message || e)); }
  }
  if (wantEmail) {
    const pdf = await renderInvoicePdf({ ...row, ...set } as typeof row);
    const b64 = btoa(Array.from(pdf, x => String.fromCharCode(x)).join(''));
    const body = (b.message?.trim() || `Please find invoice ${row.number} for ${fmtMoney(row.totalCents, row.currency)} attached${row.dueAt ? `, due ${new Date(row.dueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.`);
    const button = set.paypalLink ? { label: 'Pay online', url: set.paypalLink } : undefined;
    const r = await sendEmail({ from: emailSettings.from, to: [to], replyTo: emailSettings.replyTo || undefined, subject: `Invoice ${row.number} from ${company.name}`, html: messageHtml(body, emailSettings.signature, { button }), text: messageText(body, emailSettings.signature, { button }), attachments: [{ filename: `${row.number}.pdf`, content: b64 }] });
    await d.insert(schema.communications).values({ id: uid(), customerId: row.customerId, kind: 'email', direction: 'out', subject: `Invoice ${row.number} from ${company.name}`, body, toEmail: to, status: 'sent', provider: 'resend', providerId: r.id, invoiceId: id, byStaffId: me.id });
    notes.push(`Emailed to ${to} with the PDF attached`);
  }
  await d.update(schema.invoices).set(set).where(eq(schema.invoices.id, id));
  await touchCustomer(row.customerId, { lastContactAt: new Date() });
  await logActivity(me, 'invoice.send', 'invoice', id, `Sent invoice ${row.number} (${fmtMoney(row.totalCents, row.currency)}) to ${to}: ${notes.join('; ')}`, { customerId: row.customerId });
  const after = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0];
  return json({ invoice: invoiceView(after), notes });
});
