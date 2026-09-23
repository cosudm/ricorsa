/**
 * Ricorsa's plans as the console names, prices and meters them. Mirrors ricorsa/src/lib/plans.ts; keep them in step.
 * Prices are what PayPal bills: a month, or a year at ten months' price (two months free). The allowances are the
 * plan's monthly ceilings, which the true-up finder compares with an account's usage.
 */
export type PlanKey = 'free' | 'essentials' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'annual'];

/** The keys in use before September 2026; rows and grants stored under them resolve to the plans that replaced them. */
export const LEGACY_PLAN_KEYS: Record<string, PlanKey> = { pro: 'essentials', team: 'professional' };

export type Plan = { key: PlanKey; name: string; priceUsd: number; priceUsdYear: number; questionsPerDay: number; questionsPerMonth: number; researchPerMonth: number; buildsPerMonth: number; ideaSetsPerMonth: number };
export const PLANS: Record<PlanKey, Plan> = {
  free: { key: 'free', name: 'Free', priceUsd: 0, priceUsdYear: 0, questionsPerDay: 10, questionsPerMonth: 150, researchPerMonth: 0, buildsPerMonth: 0, ideaSetsPerMonth: 0 },
  essentials: { key: 'essentials', name: 'Essentials', priceUsd: 45, priceUsdYear: 450, questionsPerDay: 300, questionsPerMonth: 1500, researchPerMonth: 40, buildsPerMonth: 0, ideaSetsPerMonth: 0 },
  professional: { key: 'professional', name: 'Professional', priceUsd: 79, priceUsdYear: 790, questionsPerDay: 1000, questionsPerMonth: 5000, researchPerMonth: 150, buildsPerMonth: 30, ideaSetsPerMonth: 60 },
  enterprise: { key: 'enterprise', name: 'Enterprise', priceUsd: 129, priceUsdYear: 1290, questionsPerDay: 3000, questionsPerMonth: 15000, researchPerMonth: 500, buildsPerMonth: 100, ideaSetsPerMonth: 200 },
};
export const PLAN_KEYS: PlanKey[] = ['free', 'essentials', 'professional', 'enterprise'];
export const PAID_PLAN_KEYS: PlanKey[] = ['essentials', 'professional', 'enterprise'];

/** A stored plan key as a current one: today's keys pass through, the previous names map to their successors, anything else is Free. */
export function normalizePlanKey(key: string | null | undefined): PlanKey {
  if (key && key in PLANS) return key as PlanKey;
  if (key && key in LEGACY_PLAN_KEYS) return LEGACY_PLAN_KEYS[key];
  return 'free';
}
export function isPlanKey(v: unknown): v is PlanKey { return typeof v === 'string' && ((PLAN_KEYS as string[]).includes(v) || v in LEGACY_PLAN_KEYS); }
export function planFor(key: string | null | undefined): Plan { return PLANS[normalizePlanKey(key)]; }
export function planName(key: string | null | undefined): string { return key === 'custom' ? 'Custom' : planFor(key).name; }
export function isBillingCycle(v: unknown): v is BillingCycle { return v === 'monthly' || v === 'annual'; }

/**
 * What a paying account is worth a month, in cents: the monthly price, or the annual price spread over twelve
 * months. Every margin and LTV figure in the console is built on this monthly unit, whatever the cycle.
 */
export function mrrCentsFor(key: string | null | undefined, cycle: BillingCycle | null | undefined): number {
  const p = planFor(key);
  if (p.key === 'free') return 0;
  return cycle === 'annual' ? Math.round((p.priceUsdYear * 100) / 12) : p.priceUsd * 100;
}
