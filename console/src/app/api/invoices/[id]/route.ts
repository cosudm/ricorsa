import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { InvoicePatch } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { invoiceView, paymentView } from '@/lib/views';
import { computeTotals } from '@/lib/invoices';
import { cancelPaypalInvoice, deletePaypalDraft, paypalConfigured } from '@/lib/paypal';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const d = db();
  const r = (await d.select({ i: schema.invoices, name: schema.customers.name, company: schema.customers.company, email: schema.customers.email }).from(schema.invoices).leftJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId)).where(eq(schema.invoices.id, id)).limit(1))[0];
  return r ? { row: r.i, customer: { name: r.name || '', company: r.company, email: r.email } } : null;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await currentStaff();
  const { id } = await ctx.params;
  const hit = await load(id); if (!hit) return fail(404, 'No such invoice', 'not_found');
  const payments = await db().select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.receivedAt));
  return json({ invoice: invoiceView(hit.row, hit.customer), payments: payments.map(paymentView) });
});

/** PATCH /api/invoices/:id — edit a draft, or void any invoice (a sent PayPal invoice is cancelled there too). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const hit = await load(id); if (!hit) return fail(404, 'No such invoice', 'not_found');
  const row = hit.row;
  const b = parse(InvoicePatch, await readJson(req));
  const d = db();
  if (b.status === 'void') {
    if (row.status === 'void') return json({ invoice: invoiceView(row, hit.customer) });
    if (row.status === 'paid') return fail(409, 'A paid invoice cannot be voided; refund it instead', 'paid');
    if (row.paypalInvoiceId && paypalConfigured()) {
      try { if (row.paypalStatus === 'DRAFT') await deletePaypalDraft(row.paypalInvoiceId); else await cancelPaypalInvoice(row.paypalInvoiceId, b.voidReason || 'Invoice voided'); }
      catch (e) { console.warn('[invoice] paypal cancel failed', String((e as Error)?.message || e)); }
    }
    await d.update(schema.invoices).set({ status: 'void', paypalStatus: row.paypalInvoiceId ? 'CANCELLED' : row.paypalStatus, updatedAt: new Date() }).where(eq(schema.invoices.id, id));
    await logActivity(me, 'invoice.void', 'invoice', id, `Voided invoice ${row.number}${b.voidReason ? ': ' + b.voidReason : ''}`, { customerId: row.customerId });
    return json({ invoice: invoiceView((await load(id))!.row, hit.customer) });
  }
  if (row.status !== 'draft') return fail(409, 'Only drafts can be edited. Void it and draft a new one to make changes.', 'not_draft');
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (b.items) { const items = b.items.map(it => ({ description: it.description, qty: it.qty, unitCents: it.unitCents, taxRate: it.taxRate })); Object.assign(set, { items }, computeTotals(items)); }
  if (b.currency) set.currency = b.currency.toUpperCase();
  if (b.issuedAt !== undefined) set.issuedAt = new Date(b.issuedAt);
  if (b.dueAt !== undefined) set.dueAt = b.dueAt ? new Date(b.dueAt) : null;
  if (b.notes !== undefined) set.notes = b.notes; if (b.terms !== undefined) set.terms = b.terms;
  if (b.billTo) set.billTo = { ...(row.billTo || {}), ...b.billTo };
  await d.update(schema.invoices).set(set).where(eq(schema.invoices.id, id));
  await logActivity(me, 'invoice.update', 'invoice', id, `Edited draft invoice ${row.number}`, { customerId: row.customerId });
  return json({ invoice: invoiceView((await load(id))!.row, hit.customer) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const hit = await load(id); if (!hit) return fail(404, 'No such invoice', 'not_found');
  if (hit.row.status !== 'draft') return fail(409, 'Only drafts can be deleted; void the invoice instead', 'not_draft');
  await db().delete(schema.invoices).where(eq(schema.invoices.id, id));
  await logActivity(me, 'invoice.delete', 'invoice', id, `Deleted draft invoice ${hit.row.number} of ${await customerName(hit.row.customerId)}`, { customerId: hit.row.customerId });
  return json({ ok: true });
});
