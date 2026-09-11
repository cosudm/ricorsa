import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { getSetting } from './settings';
import { invoicePdf } from './pdf';
import { getPaypalInvoice, statusFromPaypal } from './paypal';
import { logActivity } from './activity';
import type { Staff } from './session';

export type InvoiceRow = typeof schema.invoices.$inferSelect;

/** The PDF bytes for an invoice, with the company details from Settings. */
export async function renderInvoicePdf(row: InvoiceRow): Promise<Uint8Array> {
  const [company, inv] = await Promise.all([getSetting('company'), getSetting('invoice')]);
  return invoicePdf({ ...row, billTo: row.billTo || null, paypalLink: row.paypalLink }, { ...company, footer: inv.footer });
}

/** Pull the invoice's state from PayPal and apply it: status, amount paid, paid date. Returns what changed. */
export async function syncFromPaypal(row: InvoiceRow, actor: Staff | null): Promise<{ status: string; paidCents: number; changed: boolean }> {
  if (!row.paypalInvoiceId) return { status: row.status, paidCents: row.paidCents, changed: false };
  const pp = await getPaypalInvoice(row.paypalInvoiceId);
  const mapped = statusFromPaypal(pp.status);
  const paidCents = pp.payments?.paid_amount?.value ? Math.round(parseFloat(pp.payments.paid_amount.value) * 100) : (mapped === 'paid' ? row.totalCents : row.paidCents);
  const set: Partial<InvoiceRow> = { paypalStatus: pp.status, updatedAt: new Date() };
  if (pp.detail?.metadata?.recipient_view_url) set.paypalLink = pp.detail.metadata.recipient_view_url;
  const current: string = row.status;
  if (current !== 'void' && current !== 'draft' && mapped && mapped !== 'draft') {
    if (mapped === 'paid' && current !== 'paid') { set.status = 'paid'; set.paidAt = new Date(); }
    if (mapped === 'void') set.status = 'void';
    if (paidCents > row.paidCents) set.paidCents = paidCents;
  }
  const changed = Object.keys(set).some(k => k !== 'updatedAt' && (set as Record<string, unknown>)[k] !== (row as unknown as Record<string, unknown>)[k]);
  await db().update(schema.invoices).set(set).where(eq(schema.invoices.id, row.id));
  if (set.status && set.status !== row.status) await logActivity(actor, 'invoice.' + set.status, 'invoice', row.id, `Invoice ${row.number} is now ${set.status} (PayPal)`, { customerId: row.customerId });
  return { status: set.status || row.status, paidCents: set.paidCents ?? row.paidCents, changed };
}
