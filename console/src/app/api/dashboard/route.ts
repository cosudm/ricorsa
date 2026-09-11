import { and, desc, eq, gte, inArray, sql, count, sum } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { accountStats, signupSeries } from '@/lib/ricorsa';
import { effectiveStatus } from '@/lib/invoices';
import { activityView } from '@/lib/views';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard — the numbers the front page shows, all computed live. */
export const GET = handle(async () => {
  await currentStaff();
  const d = db();
  const now = Date.now(), week = now + 7 * 86400e3, monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const [byStatus, mrr, trialsActive, trialsEnding, licensesActive, licensesEnding, invoices, paidMonth, recent, commsWeek] = await Promise.all([
    d.select({ status: schema.customers.status, n: count() }).from(schema.customers).groupBy(schema.customers.status),
    d.select({ total: sum(schema.customers.mrrCents) }).from(schema.customers).where(inArray(schema.customers.status, ['active', 'past_due'])),
    d.select({ n: count() }).from(schema.trials).where(and(eq(schema.trials.status, 'active'), gte(schema.trials.endsAt, new Date(now)))),
    d.select({ n: count() }).from(schema.trials).where(and(eq(schema.trials.status, 'active'), gte(schema.trials.endsAt, new Date(now)), sql`${schema.trials.endsAt} <= ${week}`)),
    d.select({ n: count() }).from(schema.licenses).where(eq(schema.licenses.status, 'active')),
    d.select({ n: count() }).from(schema.licenses).where(and(eq(schema.licenses.status, 'active'), sql`${schema.licenses.endsAt} is not null and ${schema.licenses.endsAt} <= ${now + 30 * 86400e3}`)),
    d.select({ status: schema.invoices.status, totalCents: schema.invoices.totalCents, paidCents: schema.invoices.paidCents, dueAt: schema.invoices.dueAt, currency: schema.invoices.currency }).from(schema.invoices),
    d.select({ total: sum(schema.payments.amountCents) }).from(schema.payments).where(gte(schema.payments.receivedAt, new Date(monthStart))),
    d.select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(12),
    d.select({ n: count() }).from(schema.communications).where(gte(schema.communications.at, new Date(now - 7 * 86400e3))),
  ]);
  let outstandingCents = 0, overdueCents = 0, overdueCount = 0, draftCount = 0;
  for (const i of invoices) {
    const s = effectiveStatus(i);
    if (s === 'draft') draftCount++;
    if (s === 'sent' || s === 'overdue') { const bal = Math.max(0, i.totalCents - i.paidCents); outstandingCents += bal; if (s === 'overdue') { overdueCents += bal; overdueCount++; } }
  }
  // Revenue received per month for the last twelve months
  const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1); since.setHours(0, 0, 0, 0);
  const paidRows = await d.select({ month: sql<string>`strftime('%Y-%m', ${schema.payments.receivedAt} / 1000, 'unixepoch')`, cents: sum(schema.payments.amountCents) }).from(schema.payments).where(gte(schema.payments.receivedAt, since)).groupBy(sql`strftime('%Y-%m', ${schema.payments.receivedAt} / 1000, 'unixepoch')`);
  const revenue: Array<{ month: string; cents: number }> = [];
  for (let i = 11; i >= 0; i--) { const dt = new Date(); dt.setMonth(dt.getMonth() - i); const key = dt.toISOString().slice(0, 7); revenue.push({ month: key, cents: Number(paidRows.find(r => r.month === key)?.cents || 0) }); }
  let ricorsa = null, signups: Array<{ day: string; n: number }> = [];
  try { [ricorsa, signups] = await Promise.all([accountStats(), signupSeries(42)]); } catch (e) { console.warn('[dashboard] product database unavailable', String((e as Error)?.message || e)); }
  return json({
    customers: { byStatus: Object.fromEntries(byStatus.map(b => [b.status, b.n])), total: byStatus.reduce((a, b) => a + b.n, 0), mrrCents: Number(mrr[0]?.total || 0) },
    trials: { active: trialsActive[0]?.n || 0, endingThisWeek: trialsEnding[0]?.n || 0 },
    licenses: { active: licensesActive[0]?.n || 0, endingThisMonth: licensesEnding[0]?.n || 0 },
    invoices: { outstandingCents, overdueCents, overdueCount, draftCount, paidThisMonthCents: Number(paidMonth[0]?.total || 0) },
    communications: { thisWeek: commsWeek[0]?.n || 0 },
    ricorsa, signups, revenue,
    recent: recent.map(activityView),
  });
});
