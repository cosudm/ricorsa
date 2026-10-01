/**
 * Metering. Everything that costs something to run is priced in gas (GAS in plans.ts): a question 1, a Research
 * report 10, a Discover idea set 25, an app version 250, a browser action 1. Each plan includes gas every month,
 * Pay-As-You-Go gas is bought in blocks and never expires, and the two are spent in that order: the month's
 * allowance first, then the bought balance. One gauge in the app shows what is left and what each thing costs.
 *
 * The checks here run before the work starts (the feature gates, then enough gas for the cheapest outcome) and the
 * charge lands when the work is done, with the real cost (a browsing answer costs its question plus its actions).
 * Admins skip the counted limits but not the feature gates, so a demo of the Free plan behaves like Free. The
 * messages name the plan, the amount and the reset, never a provider or a cost in dollars.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { planFor, statusGrants, nextPlan, capabilityPlanKey, GAS, PLANS, PAYG, gas as gasWord, type Plan } from './plans';
import type { CurrentUser } from './session';
import type { Allowance } from './db/schema';
import { HttpError } from './http';

/** The monthly gas that applies to an account: the plan's, or the number the console set above it. */
export type Limits = { gasPerMonth: number; raised: boolean };
export function limitsFor(plan: Plan, allowance?: Allowance | null): Limits {
  const mine = allowance?.gasPerMonth;
  const gasPerMonth = typeof mine === 'number' && mine >= 0 ? mine : plan.gasPerMonth;
  return { gasPerMonth, raised: gasPerMonth !== plan.gasPerMonth };
}

/** The plan whose capabilities apply to this account (Professional while bought gas remains on a lower plan). */
export function capabilityPlan(user: Pick<CurrentUser, 'plan' | 'gasBalance' | 'admin' | 'effectivePlan'>): Plan {
  if (user.admin) return planFor(user.effectivePlan || user.plan);
  return PLANS[capabilityPlanKey(user.plan, user.gasBalance)];
}

/** Whether the subscription behind a paid plan still grants it (Free, and the admin's demo, always do). */
export function subscriptionActive(user: Pick<CurrentUser, 'plan' | 'subscriptionStatus' | 'admin'>): boolean {
  return !!user.admin || planFor(user.plan).key === 'free' || statusGrants(user.subscriptionStatus);
}

export function periods(d = new Date()) {
  const day = d.toISOString().slice(0, 10);
  return { day: 'd:' + day, month: 'm:' + day.slice(0, 7) };
}
/** When this month's allowance refills: the first of next month, UTC. */
export function nextReset(d = new Date()): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }

const EMPTY = { questions: 0, research: 0, tokensIn: 0, tokensOut: 0, searches: 0, costMicros: 0, builds: 0, ideas: 0, browserActions: 0, gas: 0 };
export async function readUsage(userId: string) {
  const { day, month } = periods();
  const rows = await db().select().from(schema.usage).where(and(eq(schema.usage.userId, userId), sql`${schema.usage.period} in (${day}, ${month})`));
  const get = (p: string) => rows.find(r => r.period === p) || EMPTY;
  return { day: get(day), month: get(month) };
}

/** Where the gauge stands: the month's allowance, what is spent, what is bought, and what is left in all. */
export type GasState = {
  allowance: number; used: number; balance: number;
  /** Gas left this month from the allowance plus every bought gas. */
  remaining: number;
  /** Gas left from the allowance alone (what refills on the 1st). */
  planLeft: number;
  resetsAt: number;
  /** Whether the ceiling applies at all (admins: no). */
  unlimited: boolean;
};
export async function gasState(user: CurrentUser): Promise<GasState> {
  const plan = planFor(user.plan);
  const active = subscriptionActive(user);
  // A lapsed subscription keeps the Free allowance and any bought gas until it is set right.
  const lim = active ? limitsFor(plan, user.allowance) : limitsFor(PLANS.free, null);
  const u = await readUsage(user.id);
  const balance = Math.max(0, user.gasBalance || 0);
  const planLeft = Math.max(0, lim.gasPerMonth - u.month.gas);
  return { allowance: lim.gasPerMonth, used: u.month.gas, balance, planLeft, remaining: planLeft + balance, resetsAt: nextReset().getTime(), unlimited: !!user.admin };
}

/** Throws a 429 when the account cannot pay `cost` gas; returns the state otherwise. */
export async function assertGas(user: CurrentUser, cost: number, what: string): Promise<GasState> {
  const st = await gasState(user);
  if (st.unlimited || st.remaining >= cost) return st;
  const plan = planFor(user.plan);
  const active = subscriptionActive(user);
  if (!active && st.remaining === 0 && plan.key !== 'free') throw new HttpError(402, 'Your subscription is not active. Update your payment method or resubscribe; Pay-As-You-Go gas also works any time.', 'subscription_inactive');
  const up = nextPlan(active ? plan.key : 'free');
  const more = `Gas refills on the 1st${up && !up.contactSales ? `; ${up.name} includes ${gasWord(up.gasPerMonth)} a month` : ''}, and Pay-As-You-Go gas (${gasWord(PAYG.gas)} a block) is available any time.`;
  if (st.remaining <= 0) throw new HttpError(429, `You have used this month's ${gasWord(st.allowance)} on the ${active ? plan.name : 'Free'} plan. ${more}`, 'gas_limit');
  throw new HttpError(429, `${what[0].toUpperCase() + what.slice(1)} costs ${gasWord(cost)} and you have ${gasWord(st.remaining)} left. ${more}`, 'gas_limit');
}

/** Whether this account may use a feature at all, whatever its gas; the message names the plan that includes it. */
function assertFeature(ok: boolean, message: string) {
  if (!ok) throw new HttpError(402, message, 'upgrade_required');
}

/** The gas a question costs before it is asked: its mode and model; browser actions add theirs when they happen. */
export function questionCost(mode: 'search' | 'research', tier: string): number {
  if (mode === 'research') return GAS.research;
  return tier === 'complex' ? GAS.reasoning : GAS.question;
}

/** Before an answer: the tier and mode gates of the plan, then gas for the question itself. */
export async function assertQuota(user: CurrentUser, mode: 'search' | 'research', tier: string) {
  const plan = capabilityPlan(user);
  assertFeature(plan.tiers.includes(tier as never), `The ${tier === 'complex' ? 'Reasoning' : tier} model needs an Essentials plan or above.`);
  assertFeature(mode !== 'research' || plan.key !== 'free', 'Research mode needs an Essentials plan or above.');
  const gas = await assertGas(user, questionCost(mode, tier), mode === 'research' ? 'a Research report' : 'a question');
  return { plan, gas };
}

/** Before the Build studio writes a version: Discover on the plan, then 250 gas. */
export async function assertBuildQuota(user: CurrentUser) {
  const plan = capabilityPlan(user);
  assertFeature(plan.caps.discover === 'full', 'Building from Discover is part of the Professional and Enterprise plans, and of Pay-As-You-Go gas.');
  const gas = await assertGas(user, GAS.build, 'an app version');
  return { plan, gas };
}

/** Before Discover generates a new idea set (cached sets are served regardless): 25 gas. */
export async function assertIdeaQuota(user: CurrentUser) {
  const plan = capabilityPlan(user);
  const gas = await assertGas(user, GAS.ideaSet, 'a Discover idea set');
  return { plan, gas };
}

/** Before the browser opens a site: the browser on the plan, then at least one action's gas. Returns how many actions the gas allows. */
export async function assertBrowseQuota(user: CurrentUser) {
  const plan = capabilityPlan(user);
  assertFeature(plan.caps.browser === 'full', 'Sending Ricorsa to a website is part of the Professional and Enterprise plans, and of Pay-As-You-Go gas.');
  const gas = await assertGas(user, GAS.browserAction, 'a browser action');
  return { plan, gas, remaining: gas.unlimited ? Number.POSITIVE_INFINITY : Math.floor(gas.remaining / GAS.browserAction) };
}

/** Before a built app asks a question through its live line: 1 gas. */
export async function assertAppQuota(user: CurrentUser) {
  const gas = await assertGas(user, GAS.appQuestion, 'a question');
  return { plan: capabilityPlan(user), gas };
}

/** What the gauge shows after a charge: what it cost and what is left (Infinity for an admin). */
export type GasReceipt = { cost: number; remaining: number; fromPlan: number; fromBalance: number; unlimited: boolean };

/**
 * Charge gas for work that was done: the month's allowance first, then the bought balance. Returns the receipt the
 * gauge shows. Admins are counted for the record but never charged from a balance.
 */
export async function chargeGas(user: CurrentUser, cost: number): Promise<GasReceipt> {
  const c = Math.max(0, Math.round(cost));
  const st = await gasState(user);
  const fromPlan = Math.min(c, st.planLeft);
  const fromBalance = st.unlimited ? 0 : Math.min(c - fromPlan, st.balance);
  if (c > 0) {
    await recordUsage(user.id, { gas: c });
    if (fromBalance > 0) await db().update(schema.users).set({ gasBalance: sql`max(0, ${schema.users.gasBalance} - ${fromBalance})` }).where(eq(schema.users.id, user.id));
  }
  const remaining = st.unlimited ? Number.POSITIVE_INFINITY : Math.max(0, st.remaining - c);
  return { cost: c, remaining, fromPlan, fromBalance, unlimited: st.unlimited };
}

/** Credit bought gas to the account (a captured PayPal order), once per order. Returns the new balance, or null when the order was already credited. */
export async function creditGas(userId: string, orderId: string, usdCents: number, amount: number): Promise<number | null> {
  const d = db();
  const dup = await d.select({ id: schema.gasPurchases.id }).from(schema.gasPurchases).where(eq(schema.gasPurchases.orderId, orderId)).limit(1);
  if (dup[0]) return null;
  await d.insert(schema.gasPurchases).values({ id: crypto.randomUUID().replace(/-/g, '').slice(0, 20), userId, orderId, usdCents, gas: amount, status: 'completed' });
  const rows = await d.update(schema.users).set({ gasBalance: sql`${schema.users.gasBalance} + ${amount}` }).where(eq(schema.users.id, userId)).returning({ gasBalance: schema.users.gasBalance });
  return rows[0]?.gasBalance ?? amount;
}

export async function recordUsage(userId: string, delta: { questions?: number; research?: number; tokensIn?: number; tokensOut?: number; searches?: number; costMicros?: number; builds?: number; ideas?: number; browserActions?: number; gas?: number }) {
  const { day, month } = periods();
  const d = db();
  for (const period of [day, month]) {
    await d.insert(schema.usage).values({ userId, period, questions: delta.questions || 0, research: delta.research || 0, tokensIn: delta.tokensIn || 0, tokensOut: delta.tokensOut || 0, searches: delta.searches || 0, costMicros: delta.costMicros || 0, builds: delta.builds || 0, ideas: delta.ideas || 0, browserActions: delta.browserActions || 0, gas: delta.gas || 0 })
      .onConflictDoUpdate({ target: [schema.usage.userId, schema.usage.period], set: {
        questions: sql`${schema.usage.questions} + ${delta.questions || 0}`,
        research: sql`${schema.usage.research} + ${delta.research || 0}`,
        tokensIn: sql`${schema.usage.tokensIn} + ${delta.tokensIn || 0}`,
        tokensOut: sql`${schema.usage.tokensOut} + ${delta.tokensOut || 0}`,
        searches: sql`${schema.usage.searches} + ${delta.searches || 0}`,
        costMicros: sql`${schema.usage.costMicros} + ${delta.costMicros || 0}`,
        builds: sql`${schema.usage.builds} + ${delta.builds || 0}`,
        ideas: sql`${schema.usage.ideas} + ${delta.ideas || 0}`,
        browserActions: sql`${schema.usage.browserActions} + ${delta.browserActions || 0}`,
        gas: sql`${schema.usage.gas} + ${delta.gas || 0}`,
      } });
  }
}
