import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { planFor } from './plans';
import type { CurrentUser } from './session';
import { HttpError } from './http';

export function periods(d = new Date()) {
  const day = d.toISOString().slice(0, 10);
  return { day: 'd:' + day, month: 'm:' + day.slice(0, 7) };
}

export async function readUsage(userId: string) {
  const { day, month } = periods();
  const rows = await db().select().from(schema.usage).where(and(eq(schema.usage.userId, userId), sql`${schema.usage.period} in (${day}, ${month})`));
  const get = (p: string) => rows.find(r => r.period === p) || { questions: 0, research: 0, tokensIn: 0, tokensOut: 0, searches: 0, costMicros: 0 };
  return { day: get(day), month: get(month) };
}

/** Throws a 402/429 when the plan does not allow another answer of this kind. */
export async function assertQuota(user: CurrentUser, mode: 'search' | 'research', tier: string) {
  const plan = planFor(user.plan);
  if (!user.admin && user.plan !== 'free' && user.subscriptionStatus && !['ACTIVE', 'APPROVAL_PENDING'].includes(user.subscriptionStatus)) {
    throw new HttpError(402, 'Your subscription is not active. Update your payment method or resubscribe.', 'subscription_inactive');
  }
  // Feature gates follow the plan (for an admin, the plan they chose to demo); the counted limits never apply to an admin.
  if (!plan.tiers.includes(tier as never)) throw new HttpError(402, `The ${tier === 'complex' ? 'Reasoning' : tier} model needs a Pro plan.`, 'upgrade_required');
  if (mode === 'research' && plan.researchPerMonth === 0) throw new HttpError(402, 'Research mode needs a Pro plan.', 'upgrade_required');
  const u = await readUsage(user.id);
  if (user.admin) return { plan, usage: u };
  if (u.day.questions >= plan.questionsPerDay) throw new HttpError(429, `You have used today's ${plan.questionsPerDay} questions on the ${plan.name} plan.`, 'daily_limit');
  if (u.month.questions >= plan.questionsPerMonth) throw new HttpError(429, `You have used this month's ${plan.questionsPerMonth} questions on the ${plan.name} plan.`, 'monthly_limit');
  if (mode === 'research' && u.month.research >= plan.researchPerMonth) throw new HttpError(429, `You have used this month's ${plan.researchPerMonth} Research reports.`, 'research_limit');
  return { plan, usage: u };
}

export async function recordUsage(userId: string, delta: { questions?: number; research?: number; tokensIn?: number; tokensOut?: number; searches?: number; costMicros?: number }) {
  const { day, month } = periods();
  const d = db();
  for (const period of [day, month]) {
    await d.insert(schema.usage).values({ userId, period, questions: delta.questions || 0, research: delta.research || 0, tokensIn: delta.tokensIn || 0, tokensOut: delta.tokensOut || 0, searches: delta.searches || 0, costMicros: delta.costMicros || 0 })
      .onConflictDoUpdate({ target: [schema.usage.userId, schema.usage.period], set: {
        questions: sql`${schema.usage.questions} + ${delta.questions || 0}`,
        research: sql`${schema.usage.research} + ${delta.research || 0}`,
        tokensIn: sql`${schema.usage.tokensIn} + ${delta.tokensIn || 0}`,
        tokensOut: sql`${schema.usage.tokensOut} + ${delta.tokensOut || 0}`,
        searches: sql`${schema.usage.searches} + ${delta.searches || 0}`,
        costMicros: sql`${schema.usage.costMicros} + ${delta.costMicros || 0}`,
      } });
  }
}
