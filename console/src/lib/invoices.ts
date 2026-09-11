import type { InvoiceItem } from './db/schema';

/** Line totals in integer cents; tax per line by its rate, rounded per line the way the PDF and PayPal show it. */
export function computeTotals(items: InvoiceItem[]): { subtotalCents: number; taxCents: number; totalCents: number } {
  let subtotal = 0, tax = 0;
  for (const it of items) {
    const line = Math.round((Number(it.qty) || 0) * (Number(it.unitCents) || 0));
    subtotal += line;
    if (it.taxRate) tax += Math.round(line * Number(it.taxRate) / 100);
  }
  return { subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
}

/** Sent invoices past their due date read as overdue; paid and void never change. */
export function effectiveStatus(inv: { status: string; dueAt: Date | null; paidCents: number; totalCents: number }): string {
  if (inv.status === 'paid' || inv.status === 'void' || inv.status === 'draft') return inv.status;
  if (inv.totalCents > 0 && inv.paidCents >= inv.totalCents) return 'paid';
  if (inv.dueAt && inv.dueAt.getTime() < Date.now()) return 'overdue';
  return inv.status;
}
