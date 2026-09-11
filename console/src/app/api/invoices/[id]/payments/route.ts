import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { PaymentInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { invoiceView, paymentView } from '@/lib/views';
import { recordPaypalPayment, paypalConfigured } from '@/lib/paypal';
import { fmtMoney } from '@/lib/pdf';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/invoices/:id/payments — record money received; the invoice turns paid when the total is covered. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such invoice', 'not_found');
  if (row.status === 'void') return fail(409, 'This invoice is void', 'void');
  const b = parse(PaymentInput, await readJson(req));
  const pid = uid();
  await d.insert(schema.payments).values({ id: pid, invoiceId: id, customerId: row.customerId, amountCents: b.amountCents, currency: row.currency, method: b.method || 'other', reference: b.reference ?? null, receivedAt: b.receivedAt ? new Date(b.receivedAt) : new Date(), notes: b.notes || '', createdBy: me.id });
  const paidCents = row.paidCents + b.amountCents;
  const paid = paidCents >= row.totalCents;
  await d.update(schema.invoices).set({ paidCents, status: paid ? 'paid' : (row.status === 'draft' ? 'sent' : row.status), paidAt: paid ? new Date() : row.paidAt, updatedAt: new Date() }).where(eq(schema.invoices.id, id));
  let paypalNote: string | null = null;
  if (b.syncPaypal && row.paypalInvoiceId && paypalConfigured() && b.method !== 'paypal') {
    try { await recordPaypalPayment(row.paypalInvoiceId, b.amountCents, row.currency, b.method || 'other', b.notes || ''); paypalNote = 'Recorded on the PayPal invoice too'; }
    catch (e) { paypalNote = 'PayPal did not accept the payment record: ' + String((e as Error)?.message || e).slice(0, 160); }
  }
  await logActivity(me, 'payment.create', 'payment', pid, `Recorded ${fmtMoney(b.amountCents, row.currency)} against invoice ${row.number}${paid ? ' (paid in full)' : ''}`, { customerId: row.customerId });
  const after = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0];
  const payment = (await d.select().from(schema.payments).where(eq(schema.payments.id, pid)))[0];
  return json({ invoice: invoiceView(after), payment: paymentView(payment), paypalNote }, { status: 201 });
});
