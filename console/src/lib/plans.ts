/** Ricorsa's plans as the console names and prices them (mirrors ricorsa/src/lib/plans.ts). */
export type PlanKey = 'free' | 'pro' | 'team';
export const PLANS: Record<PlanKey, { name: string; priceUsd: number }> = {
  free: { name: 'Free', priceUsd: 0 },
  pro: { name: 'Pro', priceUsd: 20 },
  team: { name: 'Team', priceUsd: 49 },
};
export const PLAN_KEYS: PlanKey[] = ['free', 'pro', 'team'];
export function isPlanKey(v: unknown): v is PlanKey { return typeof v === 'string' && (PLAN_KEYS as string[]).includes(v); }
