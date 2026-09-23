import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { planFor, statusGrants, nextPlan } from './plans';
import type { CurrentUser } from './session';
import { HttpError } from './http';

export function periods(d = new Date()) {
  const day = d.toISOString().slice(0, 10);
  return { day: 'd:' + day, month: 'm:' + day.slice(0, 7) };
}

export async function readUsage(userId: string) {
  const { day, month } = periods();
  const rows = await db().select().from(schema.usage).where(and(eq(schema.usage.userId, userId), sql`${schema.usage.period} in (${day}, ${month})`));
  const get = (p: string) => rows.find(r => r.period === p) || { questions: 0, research: 0, tokensIn: 0, tokensOut: 0, searches: 0, costMicros: 0, builds: 0, ideas: 0 };
  return { day: get(day), month: get(month) };
}

/** Throws a 402/429 when the plan does not allow another answer of this kind. */
export async function assertQuota(user: CurrentUser, mode: 'search' | 'research', tier: string) {
  const plan = planFor(user.plan);
  if (!user.admin && user.plan !== 'free' && !statusGrants(user.subscriptionStatus)) {
    throw new HttpError(402, 'Your subscription is not active. Update your payment method or resubscribe.', 'subscription_inactive');
  }
  // Feature gates follow the plan (for an admin, the plan they chose to demo); the counted limits never apply to an admin.
  if (!plan.tiers.includes(tier as never)) throw new HttpError(402, `The ${tier === 'complex' ? 'Reasoning' : tier} model needs an Essentials plan or above.`, 'upgrade_required');
  if (mode === 'research' && plan.researchPerMonth === 0) throw new HttpError(402, 'Research mode needs an Essentials plan or above.', 'upgrade_required');
  const u = await readUsage(user.id);
  if (user.admin) return { plan, usage: u };
  if (u.day.questions >= plan.questionsPerDay) throw new HttpError(429, `You have used today's ${plan.questionsPerDay} questions on the ${plan.name} plan.`, 'daily_limit');
  if (u.month.questions >= plan.questionsPerMonth) throw new HttpError(429, `You have used this month's ${plan.questionsPerMonth} questions on the ${plan.name} plan.`, 'monthly_limit');
  if (mode === 'research' && u.month.research >= plan.researchPerMonth) throw new HttpError(429, `You have used this month's ${plan.researchPerMonth} Research reports.`, 'research_limit');
  return { plan, usage: u };
}

/**
 * Throws a 402/429 when the plan does not allow the Build studio to write another version this month. A version is
 * the studio's expensive act, so it has its own monthly ceiling apart from questions; the message names the ceiling
 * and the reset, never what a version costs to run.
 */
export async function assertBuildQuota(user: CurrentUser) {
  const plan = planFor(user.plan);
  if (plan.caps.discover !== 'full' || plan.buildsPerMonth <= 0) throw new HttpError(402, 'Building from Discover is part of the Professional and Enterprise plans.', 'upgrade_required');
  if (!user.admin && !statusGrants(user.subscriptionStatus)) throw new HttpError(402, 'Your subscription is not active. Update your payment method or resubscribe.', 'subscription_inactive');
  const u = await readUsage(user.id);
  if (user.admin) return { plan, usage: u };
  if (u.month.builds >= plan.buildsPerMonth) {
    const up = nextPlan(plan.key);
    throw new HttpError(429, `You have used this month's ${plan.buildsPerMonth} app versions on the ${plan.name} plan. The count resets on the 1st${up && up.buildsPerMonth > plan.buildsPerMonth ? `; ${up.name} includes ${up.buildsPerMonth} a month` : ''}.`, 'build_limit');
  }
  return { plan, usage: u };
}

/** Throws a 429 when the plan does not allow another Discover idea set this month (cached sets are served regardless). */
export async function assertIdeaQuota(user: CurrentUser) {
  const plan = planFor(user.plan);
  const u = await readUsage(user.id);
  if (user.admin || plan.ideaSetsPerMonth <= 0) return { plan, usage: u };
  if (u.month.ideas >= plan.ideaSetsPerMonth) {
    const up = nextPlan(plan.key);
    throw new HttpError(429, `You have used this month's ${plan.ideaSetsPerMonth} Discover idea sets on the ${plan.name} plan. The count resets on the 1st${up && up.ideaSetsPerMonth > plan.ideaSetsPerMonth ? `; ${up.name} includes ${up.ideaSetsPerMonth} a month` : ''}. The ideas already generated stay.`, 'idea_limit');
  }
  return { plan, usage: u };
}

export async function recordUsage(userId: string, delta: { questions?: number; research?: number; tokensIn?: number; tokensOut?: number; searches?: number; costMicros?: number; builds?: number; ideas?: number }) {
  const { day, month } = periods();
  const d = db();
  for (const period of [day, month]) {
    await d.insert(schema.usage).values({ userId, period, questions: delta.questions || 0, research: delta.research || 0, tokensIn: delta.tokensIn || 0, tokensOut: delta.tokensOut || 0, searches: delta.searches || 0, costMicros: delta.costMicros || 0, builds: delta.builds || 0, ideas: delta.ideas || 0 })
      .onConflictDoUpdate({ target: [schema.usage.userId, schema.usage.period], set: {
        questions: sql`${schema.usage.questions} + ${delta.questions || 0}`,
        research: sql`${schema.usage.research} + ${delta.research || 0}`,
        tokensIn: sql`${schema.usage.tokensIn} + ${delta.tokensIn || 0}`,
        tokensOut: sql`${schema.usage.tokensOut} + ${delta.tokensOut || 0}`,
        searches: sql`${schema.usage.searches} + ${delta.searches || 0}`,
        costMicros: sql`${schema.usage.costMicros} + ${delta.costMicros || 0}`,
        builds: sql`${schema.usage.builds} + ${delta.builds || 0}`,
        ideas: sql`${schema.usage.ideas} + ${delta.ideas || 0}`,
      } });
  }
}
