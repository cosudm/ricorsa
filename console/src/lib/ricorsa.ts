import { and, desc, eq, gte, inArray, like, or, sql, count } from 'drizzle-orm';
import { rdb, ricorsa, db, schema } from './db';
import { isPlanKey, normalizePlanKey, planFor, mrrCentsFor, PAID_PLAN_KEYS, BILLING_CYCLES, type PlanKey, type BillingCycle } from './plans';
import type { RAllowance } from './db/ricorsa';
import { HttpError } from './http';

/**
 * The product side: Ricorsa accounts as the console sees them. Reads come straight from the product database;
 * the writes are plan grants (a license or a trial) and allowances raised above a plan, which set the same
 * columns the product itself uses.
 */
export type AccountRow = {
  id: string; email: string | null; name: string | null; picture: string | null; plan: string; subscriptionStatus: string | null; planRenewsAt: number | null;
  paypalSubscriptionId: string | null; billingCycle: BillingCycle | null; createdAt: number; lastSeenAt: number;
  questionsMonth: number; researchMonth: number; buildsMonth: number; ideasMonth: number; costMonthMicros: number;
  /** Model cost over the trailing thirty days and the account's monthly worth, so the grid can show margin per account. */
  cost30Micros: number; mrrCents: number; marginCents: number | null;
  allowance: RAllowance | null; customerId: string | null;
};

export const PAYING = ['ACTIVE', 'APPROVAL_PENDING'];
function monthPeriod(d = new Date()): string { return 'm:' + d.toISOString().slice(0, 7); }
function dayPeriod(d = new Date()): string { return 'd:' + d.toISOString().slice(0, 10); }
/** The `d:` periods of the trailing `days` days, today included. */
function dayPeriods(days: number): string[] { const out: string[] = []; for (let i = 0; i < days; i++) out.push(dayPeriod(new Date(Date.now() - i * 86400e3))); return out; }
export function isPaying(u: { plan: string; subscriptionStatus: string | null; paypalSubscriptionId?: string | null }): boolean { return normalizePlanKey(u.plan) !== 'free' && PAYING.includes(u.subscriptionStatus || ''); }
/** The cycle a paying account bills on: the row says, or every subscription from before the annual option was monthly. */
export function cycleOf(u: { billingCycle?: string | null }): BillingCycle { return u.billingCycle === 'annual' ? 'annual' : 'monthly'; }

/** Trailing thirty-day model cost per account, in micro-dollars, from the daily usage rows. */
async function cost30ByUser(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await rdb().select({ userId: ricorsa.rUsage.userId, cost: sql<number>`sum(${ricorsa.rUsage.costMicros})` }).from(ricorsa.rUsage).where(and(inArray(ricorsa.rUsage.userId, ids), inArray(ricorsa.rUsage.period, dayPeriods(30)))).groupBy(ricorsa.rUsage.userId);
  return new Map(rows.map(r => [r.userId, Number(r.cost || 0)]));
}

/** Accounts newest first, with this month's usage, margin and whether a customer record is linked. `q` matches email or name. */
export async function listAccounts(opts: { q?: string; limit?: number; offset?: number; plan?: string; since?: number } = {}): Promise<{ rows: AccountRow[]; total: number }> {
  const r = rdb();
  const u = ricorsa.rUsers;
  const conds = [];
  if (opts.q) { const p = `%${opts.q.replace(/[%_]/g, m => '\\' + m)}%`; conds.push(or(like(u.email, p), like(u.name, p))); }
  if (opts.plan && isPlanKey(opts.plan)) conds.push(eq(u.plan, normalizePlanKey(opts.plan)));
  if (opts.since) conds.push(sql`${u.createdAt} >= ${opts.since}`);
  const where = conds.length ? and(...conds) : undefined;
  const limit = Math.min(500, Math.max(1, opts.limit || 100)), offset = Math.max(0, opts.offset || 0);
  const [users, totalRow] = await Promise.all([
    r.select().from(u).where(where).orderBy(desc(u.createdAt)).limit(limit).offset(offset),
    r.select({ n: count() }).from(u).where(where),
  ]);
  const ids = users.map(x => x.id);
  const [usage, cost30, links] = await Promise.all([
    ids.length ? r.select().from(ricorsa.rUsage).where(and(inArray(ricorsa.rUsage.userId, ids), eq(ricorsa.rUsage.period, monthPeriod()))) : Promise.resolve([]),
    cost30ByUser(ids),
    ids.length ? db().select({ id: schema.customers.id, ricorsaUserId: schema.customers.ricorsaUserId }).from(schema.customers).where(inArray(schema.customers.ricorsaUserId, ids)) : Promise.resolve([]),
  ]);
  const rows: AccountRow[] = users.map(x => {
    const us = usage.find(y => y.userId === x.id);
    const paying = isPaying(x); const cycle = paying ? cycleOf(x) : null;
    const mrrCents = paying ? mrrCentsFor(x.plan, cycle) : 0;
    const c30 = cost30.get(x.id) || 0;
    return {
      id: x.id, email: x.email, name: x.name, picture: x.picture, plan: normalizePlanKey(x.plan), subscriptionStatus: x.subscriptionStatus, planRenewsAt: x.planRenewsAt ? x.planRenewsAt.getTime() : null,
      paypalSubscriptionId: x.paypalSubscriptionId, billingCycle: cycle, createdAt: x.createdAt.getTime(), lastSeenAt: x.lastSeenAt.getTime(),
      questionsMonth: us?.questions || 0, researchMonth: us?.research || 0, buildsMonth: us?.builds || 0, ideasMonth: us?.ideas || 0, costMonthMicros: us?.costMicros || 0,
      cost30Micros: c30, mrrCents, marginCents: paying ? mrrCents - Math.round(c30 / 10000) : null,
      allowance: x.allowance || null,
      customerId: links.find(l => l.ricorsaUserId === x.id)?.id || null,
    };
  });
  return { rows, total: totalRow[0]?.n || 0 };
}

export async function findAccountByEmail(email: string) {
  const rows = await rdb().select().from(ricorsa.rUsers).where(sql`lower(${ricorsa.rUsers.email}) = ${email.toLowerCase()}`).limit(1);
  return rows[0] || null;
}

/** One account with its subscriptions, usage today and this month, its allowances and how much it has made in the product. */
export async function accountDetail(userId: string) {
  const r = rdb();
  const user = (await r.select().from(ricorsa.rUsers).where(eq(ricorsa.rUsers.id, userId)).limit(1))[0];
  if (!user) return null;
  const [subs, usage, threads, builds, spaces, cost30] = await Promise.all([
    r.select().from(ricorsa.rSubscriptions).where(eq(ricorsa.rSubscriptions.userId, userId)).orderBy(desc(ricorsa.rSubscriptions.updatedAt)),
    r.select().from(ricorsa.rUsage).where(and(eq(ricorsa.rUsage.userId, userId), inArray(ricorsa.rUsage.period, [dayPeriod(), monthPeriod()]))),
    r.select({ n: count() }).from(ricorsa.rThreads).where(eq(ricorsa.rThreads.userId, userId)),
    r.select({ n: count() }).from(ricorsa.rBuilds).where(eq(ricorsa.rBuilds.userId, userId)),
    r.select({ n: count() }).from(ricorsa.rSpaces).where(eq(ricorsa.rSpaces.userId, userId)),
    cost30ByUser([userId]),
  ]);
  const pick = (p: string) => usage.find(x => x.period === p) || { questions: 0, research: 0, tokensIn: 0, tokensOut: 0, searches: 0, costMicros: 0, builds: 0, ideas: 0 };
  const plan = planFor(user.plan);
  const paying = isPaying(user); const cycle = paying ? cycleOf(user) : null;
  const mrrCents = paying ? mrrCentsFor(plan.key, cycle) : 0;
  const c30 = cost30.get(userId) || 0;
  return {
    id: user.id, email: user.email, name: user.name, picture: user.picture, plan: plan.key, subscriptionStatus: user.subscriptionStatus,
    planRenewsAt: user.planRenewsAt ? user.planRenewsAt.getTime() : null, paypalSubscriptionId: user.paypalSubscriptionId, billingCycle: cycle,
    createdAt: user.createdAt.getTime(), lastSeenAt: user.lastSeenAt.getTime(),
    usage: { today: pick(dayPeriod()), month: pick(monthPeriod()) },
    /** The plan's monthly ceilings and the account's effective ones (raised where the console said so). */
    limits: { plan: { questionsPerDay: plan.questionsPerDay, questionsPerMonth: plan.questionsPerMonth, researchPerMonth: plan.researchPerMonth, buildsPerMonth: plan.buildsPerMonth, ideaSetsPerMonth: plan.ideaSetsPerMonth }, effective: effectiveLimits(plan.key, user.allowance) },
    allowance: user.allowance || null,
    money: { mrrCents, cost30Micros: c30, marginCents: paying ? mrrCents - Math.round(c30 / 10000) : null },
    counts: { threads: threads[0]?.n || 0, builds: builds[0]?.n || 0, spaces: spaces[0]?.n || 0 },
    subscriptions: subs.map(s => ({ id: s.id, plan: normalizePlanKey(s.planKey), billingCycle: s.billingCycle || 'monthly', status: s.status, startedAt: s.startedAt?.getTime() ?? null, nextBillingAt: s.nextBillingAt?.getTime() ?? null, cancelledAt: s.cancelledAt?.getTime() ?? null, updatedAt: s.updatedAt.getTime() })),
  };
}

/** The monthly ceilings that apply to an account: the plan's, or the allowance the console set for a key. */
export function effectiveLimits(plan: PlanKey, allowance: RAllowance | null | undefined) {
  const p = planFor(plan); const a = allowance || {};
  const pick = (mine: number | undefined, base: number) => (typeof mine === 'number' && mine >= 0 ? mine : base);
  return { questionsPerDay: pick(a.questionsPerDay, p.questionsPerDay), questionsPerMonth: pick(a.questionsPerMonth, p.questionsPerMonth), researchPerMonth: pick(a.researchPerMonth, p.researchPerMonth), buildsPerMonth: pick(a.buildsPerMonth, p.buildsPerMonth), ideaSetsPerMonth: pick(a.ideaSetsPerMonth, p.ideaSetsPerMonth) };
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
  if (user.paypalSubscriptionId && PAYING.includes(user.subscriptionStatus || '')) {
    throw new HttpError(409, 'This account pays through PayPal; its plan follows the subscription. Cancel the subscription in PayPal first if you want to grant a plan by hand.', 'has_subscription');
  }
  const set = plan === 'free' || kind === 'clear'
    ? { plan: 'free', subscriptionStatus: null as string | null, planRenewsAt: null as Date | null, billingCycle: null as null }
    : { plan, subscriptionStatus: kind === 'trial' ? 'TRIAL' : 'LICENSED', planRenewsAt: until, billingCycle: null as null };
  await r.update(ricorsa.rUsers).set(set).where(eq(ricorsa.rUsers.id, userId));
  return { plan: set.plan, subscriptionStatus: set.subscriptionStatus, planRenewsAt: set.planRenewsAt ? set.planRenewsAt.getTime() : null };
}

/**
 * Raise (or clear) an account's monthly allowances above its plan. Only the keys given are written; a key set to
 * the plan's own number is dropped, so an allowance row only ever carries what differs. `clear` removes them all.
 */
export async function setAllowance(userId: string, input: Partial<RAllowance> & { clear?: boolean }, by: string): Promise<RAllowance | null> {
  const r = rdb();
  const user = (await r.select().from(ricorsa.rUsers).where(eq(ricorsa.rUsers.id, userId)).limit(1))[0];
  if (!user) throw new HttpError(404, 'That Ricorsa account no longer exists', 'not_found');
  let next: RAllowance | null = null;
  if (!input.clear) {
    const p = planFor(user.plan);
    const merged: RAllowance = { ...(user.allowance || {}) };
    for (const k of ['buildsPerMonth', 'ideaSetsPerMonth', 'questionsPerMonth', 'questionsPerDay', 'researchPerMonth'] as const) {
      const v = input[k];
      if (typeof v === 'number') { if (v === p[k]) delete merged[k]; else merged[k] = v; }
    }
    if (input.note !== undefined) merged.note = input.note;
    const keys = Object.keys(merged).filter(k => !['note', 'setBy', 'setAt'].includes(k));
    next = keys.length ? { ...merged, setBy: by, setAt: Date.now() } : null;
  }
  await r.update(ricorsa.rUsers).set({ allowance: next }).where(eq(ricorsa.rUsers.id, userId));
  return next;
}

/** Counts for the dashboard: accounts in total, new this week and this month, and by plan. */
export async function accountStats(): Promise<{ total: number; week: number; month: number; byPlan: Record<string, number>; paying: number }> {
  const r = rdb(); const u = ricorsa.rUsers;
  const week = Date.now() - 7 * 86400e3, month = Date.now() - 30 * 86400e3;
  const [all, byPlan, paying] = await Promise.all([
    r.select({ n: count(), week: sql<number>`sum(case when ${u.createdAt} >= ${week} then 1 else 0 end)`, month: sql<number>`sum(case when ${u.createdAt} >= ${month} then 1 else 0 end)` }).from(u),
    r.select({ plan: u.plan, n: count() }).from(u).groupBy(u.plan),
    r.select({ n: count() }).from(u).where(and(sql`${u.plan} != 'free'`, inArray(u.subscriptionStatus, PAYING))),
  ]);
  const plans: Record<string, number> = {};
  for (const b of byPlan) { const k = normalizePlanKey(b.plan); plans[k] = (plans[k] || 0) + b.n; }
  return { total: all[0]?.n || 0, week: Number(all[0]?.week || 0), month: Number(all[0]?.month || 0), byPlan: plans, paying: paying[0]?.n || 0 };
}

/** Sign-ups per day for the last `days` days (oldest first), for the dashboard chart. */
export async function signupSeries(days = 42): Promise<Array<{ day: string; n: number }>> {
  const since = Date.now() - days * 86400e3;
  const rows = await rdb().select({ day: sql<string>`date(${ricorsa.rUsers.createdAt} / 1000, 'unixepoch')`, n: count() }).from(ricorsa.rUsers).where(sql`${ricorsa.rUsers.createdAt} >= ${since}`).groupBy(sql`date(${ricorsa.rUsers.createdAt} / 1000, 'unixepoch')`);
  const out: Array<{ day: string; n: number }> = [];
  for (let i = days - 1; i >= 0; i--) { const day = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); out.push({ day, n: rows.find(r => r.day === day)?.n || 0 }); }
  return out;
}

/** When nobody in a cohort has left yet, its lifetime is projected at this monthly churn rather than reported as endless. */
export const ASSUMED_CHURN_MONTHLY = 0.02;
const CHURN_WINDOW_DAYS = 90;

export type Cohort = {
  plan: PlanKey; cycle: BillingCycle; accounts: number;
  /** Monthly recurring revenue at list price (annual spread over twelve months), in cents. */
  mrrCents: number; arpuCents: number;
  /** Model cost of these accounts over the trailing thirty days, in cents, and what is left of the MRR after it. */
  cost30Cents: number; grossMarginCents: number; grossMarginPct: number | null;
  /** Subscriptions of this cohort that ended in the trailing ninety days, and the monthly churn rate they imply. */
  churned90: number; churnMonthly: number | null; churnAssumed: boolean;
  /** ARPU × gross margin ÷ monthly churn: what an account in this cohort is worth over its life, in cents. */
  ltvCents: number | null;
};

/**
 * The paying base by plan and billing cycle, with revenue, cost, margin, churn and lifetime value in monthly units.
 * Revenue is list price (the annual price spread over twelve months); cost is the trailing thirty days of model cost
 * from the product's usage rows; churn counts subscriptions that ended in the trailing ninety days against the
 * cohort's size, as a monthly rate. A cohort with no churn yet is projected at ASSUMED_CHURN_MONTHLY and says so.
 */
export async function cohortStats(): Promise<{ cohorts: Cohort[]; totals: { accounts: number; mrrCents: number; cost30Cents: number; grossMarginCents: number; monthly: { accounts: number; mrrCents: number }; annual: { accounts: number; mrrCents: number } }; window: { costDays: number; churnDays: number } }> {
  const r = rdb(); const u = ricorsa.rUsers; const s = ricorsa.rSubscriptions;
  const paying = await r.select({ id: u.id, plan: u.plan, billingCycle: u.billingCycle }).from(u).where(and(sql`${u.plan} != 'free'`, inArray(u.subscriptionStatus, PAYING), sql`${u.paypalSubscriptionId} is not null`));
  const cost30 = await cost30ByUser(paying.map(p => p.id));
  const since = new Date(Date.now() - CHURN_WINDOW_DAYS * 86400e3);
  const ended = await r.select({ planKey: s.planKey, billingCycle: s.billingCycle, userId: s.userId }).from(s).where(and(inArray(s.status, ['CANCELLED', 'EXPIRED']), gte(s.updatedAt, since)));
  // A subscription that was replaced by a newer one on the same account is a switch, not a loss.
  const stillPaying = new Set(paying.map(p => p.id));
  const cohorts: Cohort[] = [];
  for (const plan of PAID_PLAN_KEYS) for (const cycle of BILLING_CYCLES) {
    const mine = paying.filter(p => normalizePlanKey(p.plan) === plan && cycleOf(p) === cycle);
    const churned90 = ended.filter(e => normalizePlanKey(e.planKey) === plan && cycleOf(e) === cycle && !stillPaying.has(e.userId)).length;
    if (!mine.length && !churned90) continue;
    const accounts = mine.length;
    const mrrCents = accounts * mrrCentsFor(plan, cycle);
    const cost30Cents = Math.round(mine.reduce((a, p) => a + (cost30.get(p.id) || 0), 0) / 10000);
    const grossMarginCents = mrrCents - cost30Cents;
    const grossMarginPct = mrrCents > 0 ? grossMarginCents / mrrCents : null;
    const arpuCents = accounts ? Math.round(mrrCents / accounts) : 0;
    const base = accounts + churned90;
    const measured = base > 0 ? churned90 / base / (CHURN_WINDOW_DAYS / 30) : null;
    const churnAssumed = !measured;
    const churnMonthly = accounts ? (measured || ASSUMED_CHURN_MONTHLY) : null;
    const ltvCents = accounts && churnMonthly && grossMarginPct !== null ? Math.round(arpuCents * Math.max(0, grossMarginPct) / churnMonthly) : null;
    cohorts.push({ plan, cycle, accounts, mrrCents, arpuCents, cost30Cents, grossMarginCents, grossMarginPct, churned90, churnMonthly, churnAssumed, ltvCents });
  }
  const sum = (list: Cohort[], k: 'accounts' | 'mrrCents' | 'cost30Cents' | 'grossMarginCents') => list.reduce((a, c) => a + c[k], 0);
  const byCycle = (cycle: BillingCycle) => ({ accounts: sum(cohorts.filter(c => c.cycle === cycle), 'accounts'), mrrCents: sum(cohorts.filter(c => c.cycle === cycle), 'mrrCents') });
  return { cohorts, totals: { accounts: sum(cohorts, 'accounts'), mrrCents: sum(cohorts, 'mrrCents'), cost30Cents: sum(cohorts, 'cost30Cents'), grossMarginCents: sum(cohorts, 'grossMarginCents'), monthly: byCycle('monthly'), annual: byCycle('annual') }, window: { costDays: 30, churnDays: CHURN_WINDOW_DAYS } };
}

export type TrueupCandidate = {
  userId: string; email: string | null; name: string | null; plan: PlanKey; billingCycle: BillingCycle; period: string; customerId: string | null;
  /** Each unit the account used beyond its plan's monthly allowance this period (allowances raised by the console count as the plan's for the true-up, since the raise is what is being paid for). */
  overage: Array<{ key: 'builds' | 'ideas' | 'questions' | 'research'; label: string; used: number; allowance: number; over: number }>;
  /** Whether a true-up invoice for this account and period has already been drafted. */
  invoiced: boolean;
};

/**
 * Annual accounts whose usage in a month went past the plan's monthly allowance: the ones a true-up invoice is for.
 * Monthly subscribers are asked to upgrade instead, so they are not listed. `period` is YYYY-MM, this month by default.
 */
export async function trueupCandidates(period = new Date().toISOString().slice(0, 7)): Promise<TrueupCandidate[]> {
  const r = rdb(); const u = ricorsa.rUsers;
  const annual = await r.select({ id: u.id, email: u.email, name: u.name, plan: u.plan }).from(u).where(and(sql`${u.plan} != 'free'`, inArray(u.subscriptionStatus, PAYING), eq(u.billingCycle, 'annual')));
  if (!annual.length) return [];
  const ids = annual.map(a => a.id);
  const [usage, links, drafted] = await Promise.all([
    r.select().from(ricorsa.rUsage).where(and(inArray(ricorsa.rUsage.userId, ids), eq(ricorsa.rUsage.period, 'm:' + period))),
    db().select({ id: schema.customers.id, ricorsaUserId: schema.customers.ricorsaUserId }).from(schema.customers).where(inArray(schema.customers.ricorsaUserId, ids)),
    db().select({ customerId: schema.invoices.customerId, notes: schema.invoices.notes }).from(schema.invoices).where(like(schema.invoices.notes, `%True-up ${period}%`)),
  ]);
  const out: TrueupCandidate[] = [];
  for (const a of annual) {
    const us = usage.find(x => x.userId === a.id); if (!us) continue;
    const plan = planFor(a.plan);
    const over: TrueupCandidate['overage'] = [];
    const add = (key: TrueupCandidate['overage'][number]['key'], label: string, used: number, allowance: number) => { if (allowance > 0 && used > allowance) over.push({ key, label, used, allowance, over: used - allowance }); };
    add('builds', 'app versions', us.builds, plan.buildsPerMonth);
    add('ideas', 'Discover idea sets', us.ideas, plan.ideaSetsPerMonth);
    add('questions', 'questions', us.questions, plan.questionsPerMonth);
    add('research', 'Research reports', us.research, plan.researchPerMonth);
    if (!over.length) continue;
    const customerId = links.find(l => l.ricorsaUserId === a.id)?.id || null;
    out.push({ userId: a.id, email: a.email, name: a.name, plan: plan.key, billingCycle: 'annual', period, customerId, overage: over, invoiced: !!customerId && drafted.some(d => d.customerId === customerId) });
  }
  return out;
}
