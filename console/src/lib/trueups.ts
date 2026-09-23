import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { getSetting, nextInvoiceNumber } from './settings';
import { computeTotals } from './invoices';
import { trueupCandidates, accountDetail, type TrueupCandidate } from './ricorsa';
import { planName } from './plans';
import { logActivity } from './activity';
import { uid, HttpError } from './http';
import type { Staff } from './session';
import type { InvoiceItem } from './db/schema';

/** The invoice notes carry this marker so a period is never drafted twice for the same account. */
export function trueupMarker(period: string): string { return `True-up ${period}`; }

/**
 * Draft a true-up invoice for one annual account's overage in a month: one line per unit kind used beyond the
 * plan's monthly allowance, at the unit prices in Settings. The customer record is created from the account when
 * there is none yet. The draft is then sent like any other invoice (PayPal Invoicing, email, or both).
 */
export async function draftTrueup(userId: string, period: string, me: Staff): Promise<{ invoiceId: string; number: string; customerId: string; totalCents: number; candidate: TrueupCandidate }> {
  const candidates = await trueupCandidates(period);
  const c = candidates.find(x => x.userId === userId);
  if (!c) throw new HttpError(404, 'That account has no overage to bill for this period', 'nothing_to_bill');
  if (c.invoiced) throw new HttpError(409, `A true-up for ${period} has already been drafted for this account`, 'already_drafted');
  const d = db();
  let customerId = c.customerId;
  if (!customerId) {
    const acc = await accountDetail(userId);
    if (!acc) throw new HttpError(404, 'No such Ricorsa account', 'not_found');
    customerId = uid();
    await d.insert(schema.customers).values({ id: customerId, kind: 'person', name: acc.name || acc.email || 'Ricorsa user', email: acc.email, status: 'active', plan: acc.plan, billingCycle: 'annual', mrrCents: acc.money.mrrCents, source: 'ricorsa', ownerId: me.id, ricorsaUserId: userId });
    await logActivity(me, 'customer.create', 'customer', customerId, `Added ${acc.email || userId} from the Ricorsa sign-ups (true-up)`, { customerId });
  }
  const customer = (await d.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1))[0];
  const [prices, inv] = await Promise.all([getSetting('trueup'), getSetting('invoice')]);
  const unit: Record<TrueupCandidate['overage'][number]['key'], number> = { builds: prices.buildCents, ideas: prices.ideaSetCents, questions: prices.questionCents, research: prices.researchCents };
  const monthName = new Date(period + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const items: InvoiceItem[] = c.overage.filter(o => unit[o.key] > 0).map(o => ({ description: `${planName(c.plan)} plan, ${monthName}: ${o.over.toLocaleString('en-US')} ${o.label} beyond the monthly allowance of ${o.allowance.toLocaleString('en-US')} (${o.used.toLocaleString('en-US')} used)`, qty: o.over, unitCents: unit[o.key], taxRate: inv.taxRate || undefined }));
  if (!items.length) throw new HttpError(409, 'Every unit price for true-ups is zero in Settings, so there is nothing to bill', 'no_prices');
  const totals = computeTotals(items);
  const issuedAt = new Date(); const dueAt = new Date(issuedAt.getTime() + (prices.dueDays ?? inv.dueDays) * 86400e3);
  const id = uid(), number = await nextInvoiceNumber();
  await d.insert(schema.invoices).values({
    id, number, customerId, status: 'draft', currency: (inv.currency || customer.currency || 'USD').toUpperCase(), items, ...totals, issuedAt, dueAt,
    billTo: { name: customer.name, company: customer.company ?? undefined, email: customer.email ?? undefined, address: customer.address ?? undefined },
    notes: `${trueupMarker(period)}: usage beyond the ${planName(c.plan)} plan's monthly allowance, billed at the unit prices agreed for annual accounts.`, terms: inv.terms, createdBy: me.id,
  });
  await logActivity(me, 'invoice.create', 'invoice', id, `Drafted true-up invoice ${number} for ${customer.name} (${monthName})`, { customerId });
  return { invoiceId: id, number, customerId, totalCents: totals.totalCents, candidate: c };
}
