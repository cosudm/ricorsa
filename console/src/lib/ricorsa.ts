import { and, desc, eq, inArray, like, or, sql, count } from 'drizzle-orm';
import { rdb, ricorsa, db, schema } from './db';
import { isPlanKey, type PlanKey } from './plans';
import { HttpError } from './http';

/**
 * The product side: Ricorsa accounts as the console sees them. Reads come straight from the product database;
 * the only writes are plan grants (a licence or a trial), which set the same columns PayPal would.
 */
export type AccountRow = {
  id: string; email: string | null; name: string | null; picture: string | null; plan: string; subscriptionStatus: string | null; planRenewsAt: number | null;
  paypalSubscriptionId: string | null; createdAt: number; lastSeenAt: number; questionsMonth: number; researchMonth: number; costMonthMicros: number; customerId: string | null;
};

function monthPeriod(d = new Date()): string { return 'm:' + d.toISOString().slice(0, 7); }
function dayPeriod(d = new Date()): string { return 'd:' + d.toISOString().slice(0, 10); }

/** Accounts newest first, with this month's usage and whether a customer record is linked. `q` matches email or name. */
export async function listAccounts(opts: { q?: string; limit?: number; offset?: number; plan?: string; since?: number } = {}): Promise<{ rows: AccountRow[]; total: number }> {
  const r = rdb();
  const u = ricorsa.rUsers;
  const conds = [];
  if (opts.q) { const p = `%${opts.q.replace(/[%_]/g, m => '\\' + m)}%`; conds.push(or(like(u.email, p), like(u.name, p))); }
  if (opts.plan && isPlanKey(opts.plan)) conds.push(eq(u.plan, opts.plan));
  if (opts.since) conds.push(sql`${u.createdAt} >= ${opts.since}`);
  const where = conds.length ? and(...conds) : undefined;
  const limit = Math.min(500, Math.max(1, opts.limit || 100)), offset = Math.max(0, opts.offset || 0);
  const [users, totalRow] = await Promise.all([
    r.select().from(u).where(where).orderBy(desc(u.createdAt)).limit(limit).offset(offset),
    r.select({ n: count() }).from(u).where(where),
  ]);
  const ids = users.map(x => x.id);
  const usage = ids.length ? await r.select().from(ricorsa.rUsage).where(and(inArray(ricorsa.rUsage.userId, ids), eq(ricorsa.rUsage.period, monthPeriod()))) : [];
  const links = ids.length ? await db().select({ id: schema.customers.id, ricorsaUserId: schema.customers.ricorsaUserId }).from(schema.customers).where(inArray(schema.customers.ricorsaUserId, ids)) : [];
  const rows: AccountRow[] = users.map(x => {
    const us = usage.find(y => y.userId === x.id);
    return {
      id: x.id, email: x.email, name: x.name, picture: x.picture, plan: x.plan, subscriptionStatus: x.subscriptionStatus, planRenewsAt: x.planRenewsAt ? x.planRenewsAt.getTime() : null,
      paypalSubscriptionId: x.paypalSubscriptionId, createdAt: x.createdAt.getTime(), lastSeenAt: x.lastSeenAt.getTime(),
      questionsMonth: us?.questions || 0, researchMonth: us?.research || 0, costMonthMicros: us?.costMicros || 0,
      customerId: links.find(l => l.ricorsaUserId === x.id)?.id || null,
    };
  });
  return { rows, total: totalRow[0]?.n || 0 };
}

export async function findAccountByEmail(email: string) {
  const rows = await rdb().select().from(ricorsa.rUsers).where(sql`lower(${ricorsa.rUsers.email}) = ${email.toLowerCase()}`).limit(1);
  return rows[0] || null;
}

/** One account with its subscriptions, usage today and this month, and how much it has made in the product. */
export async function accountDetail(userId: string) {
  const r = rdb();
  const user = (await r.select().from(ricorsa.rUsers).where(eq(ricorsa.rUsers.id, userId)).limit(1))[0];
  if (!user) return null;
  const [subs, usage, threads, builds, spaces] = await Promise.all([
    r.select().from(ricorsa.rSubscriptions).where(eq(ricorsa.rSubscriptions.userId, userId)).orderBy(desc(ricorsa.rSubscriptions.updatedAt)),
    r.select().from(ricorsa.rUsage).where(and(eq(ricorsa.rUsage.userId, userId), inArray(ricorsa.rUsage.period, [dayPeriod(), monthPeriod()]))),
    r.select({ n: count() }).from(ricorsa.rThreads).where(eq(ricorsa.rThreads.userId, userId)),
    r.select({ n: count() }).from(ricorsa.rBuilds).where(eq(ricorsa.rBuilds.userId, userId)),
    r.select({ n: count() }).from(ricorsa.rSpaces).where(eq(ricorsa.rSpaces.userId, userId)),
  ]);
  const pick = (p: string) => usage.find(x => x.period === p) || { questions: 0, research: 0, tokensIn: 0, tokensOut: 0, searches: 0, costMicros: 0 };
  return {
    id: user.id, email: user.email, name: user.name, picture: user.picture, plan: user.plan, subscriptionStatus: user.subscriptionStatus,
    planRenewsAt: user.planRenewsAt ? user.planRenewsAt.getTime() : null, paypalSubscriptionId: user.paypalSubscriptionId,
    createdAt: user.createdAt.getTime(), lastSeenAt: user.lastSeenAt.getTime(),
    usage: { today: pick(dayPeriod()), month: pick(monthPeriod()) },
    counts: { threads: threads[0]?.n || 0, builds: builds[0]?.n || 0, spaces: spaces[0]?.n || 0 },
    subscriptions: subs.map(s => ({ id: s.id, plan: s.planKey, status: s.status, startedAt: s.startedAt?.getTime() ?? null, nextBillingAt: s.nextBillingAt?.getTime() ?? null, cancelledAt: s.cancelledAt?.getTime() ?? null, updatedAt: s.updatedAt.getTime() })),
  };
}

/**
 * Grant a plan on the product: `kind` 'license' marks the account LICENSED (until `until`, or open-ended), 'trial'
 * marks it TRIAL until `until`. Granting Free, or `kind` 'clear', returns the account to Free with no status.
 * An account with a live PayPal subscription keeps it: the subscription already grants a paid plan.
 */
export async function grantPlan(userId: string, plan: PlanKey, kind: 'license' | 'trial' | 'clear', until: Date | null): Promise<{ plan: string; subscriptionStatus: string | null; planRenewsAt: number | null }> {
  const r = rdb();
  const user = (await r.select().from(ricorsa.rUsers).where(eq(ricorsa.rUsers.id, userId)).limit(1))[0];
  if (!user) throw new HttpError(404, 'That Ricorsa account no longer exists', 'not_found');
  if (user.paypalSubscriptionId && ['ACTIVE', 'APPROVAL_PENDING'].includes(user.subscriptionStatus || '')) {
    throw new HttpError(409, 'This account pays through PayPal; its plan follows the subscription. Cancel the subscription in PayPal first if you want to grant a plan by hand.', 'has_subscription');
  }
  const set = plan === 'free' || kind === 'clear'
    ? { plan: 'free', subscriptionStatus: null as string | null, planRenewsAt: null as Date | null }
    : { plan, subscriptionStatus: kind === 'trial' ? 'TRIAL' : 'LICENSED', planRenewsAt: until };
  await r.update(ricorsa.rUsers).set(set).where(eq(ricorsa.rUsers.id, userId));
  return { plan: set.plan, subscriptionStatus: set.subscriptionStatus, planRenewsAt: set.planRenewsAt ? set.planRenewsAt.getTime() : null };
}

/** Counts for the dashboard: accounts in total, new this week and this month, and by plan. */
export async function accountStats(): Promise<{ total: number; week: number; month: number; byPlan: Record<string, number>; paying: number }> {
  const r = rdb(); const u = ricorsa.rUsers;
  const week = Date.now() - 7 * 86400e3, month = Date.now() - 30 * 86400e3;
  const [all, byPlan, paying] = await Promise.all([
    r.select({ n: count(), week: sql<number>`sum(case when ${u.createdAt} >= ${week} then 1 else 0 end)`, month: sql<number>`sum(case when ${u.createdAt} >= ${month} then 1 else 0 end)` }).from(u),
    r.select({ plan: u.plan, n: count() }).from(u).groupBy(u.plan),
    r.select({ n: count() }).from(u).where(and(sql`${u.plan} != 'free'`, inArray(u.subscriptionStatus, ['ACTIVE', 'APPROVAL_PENDING']))),
  ]);
  return { total: all[0]?.n || 0, week: Number(all[0]?.week || 0), month: Number(all[0]?.month || 0), byPlan: Object.fromEntries(byPlan.map(b => [b.plan, b.n])), paying: paying[0]?.n || 0 };
}

/** Sign-ups per day for the last `days` days (oldest first), for the dashboard chart. */
export async function signupSeries(days = 42): Promise<Array<{ day: string; n: number }>> {
  const since = Date.now() - days * 86400e3;
  const rows = await rdb().select({ day: sql<string>`date(${ricorsa.rUsers.createdAt} / 1000, 'unixepoch')`, n: count() }).from(ricorsa.rUsers).where(sql`${ricorsa.rUsers.createdAt} >= ${since}`).groupBy(sql`date(${ricorsa.rUsers.createdAt} / 1000, 'unixepoch')`);
  const out: Array<{ day: string; n: number }> = [];
  for (let i = days - 1; i >= 0; i--) { const day = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); out.push({ day, n: rows.find(r => r.day === day)?.n || 0 }); }
  return out;
}
