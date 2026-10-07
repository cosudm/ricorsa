/**
 * Ricorsa's plans as the console names, prices and meters them. Mirrors ricorsa/src/lib/plans.ts; keep them in step.
 * Everything the product meters is priced in one unit, gas (a question 1, a Research report 10, a Discover idea set
 * 25, an app version 250, a browser action or a minute in control 1). Since October 7, 2026 accounts are prepaid:
 * every account starts with 500 gas and recharges at 40 gas per dollar ($20 to $5,000); Essentials and Professional are
 * no longer sold, and the subscriptions from before run until canceled (the annual ones at the yearly price they were
 * sold at, which `priceUsdYear` records). Enterprise stays a contract tier with an allowance set from this console.
 */
export type PlanKey = 'free' | 'essentials' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'annual'];

/** The keys in use before September 2026; rows and grants stored under them resolve to the plans that replaced them. */
export const LEGACY_PLAN_KEYS: Record<string, PlanKey> = { pro: 'essentials', team: 'professional' };

/** What each metered thing costs in gas; the same table as the product's. */
export const GAS = { question: 1, reasoning: 3, research: 10, browserAction: 1, takeoverMinute: 1, ideaSet: 25, build: 250, appQuestion: 1 } as const;
/** The recharge rate and bounds, as the product sells gas; mirrors RECHARGE in the product. */
export const RECHARGE = { gasPerUsd: 40, minUsd: 20, maxUsd: 5000, signupGas: 500 } as const;

export type Plan = {
  key: PlanKey; name: string;
  /** The monthly list price; 0 for Free and for Enterprise, which is priced per organization. */
  priceUsd: number;
  /** The yearly price of the annual plans sold before October 2026, for the accounts that still hold one. */
  priceUsdYear: number;
  /** The monthly price before October 2026, which accounts subscribed then still pay. */
  legacyPriceUsd: number;
  /** Gas included every month. */
  gasPerMonth: number;
  /** Priced per organization: no online price. */
  contactSales?: boolean;
};
export const PLANS: Record<PlanKey, Plan> = {
  free: { key: 'free', name: 'Free', priceUsd: 0, priceUsdYear: 0, legacyPriceUsd: 0, gasPerMonth: 0 },
  essentials: { key: 'essentials', name: 'Essentials', priceUsd: 60, priceUsdYear: 450, legacyPriceUsd: 45, gasPerMonth: 2500 },
  professional: { key: 'professional', name: 'Professional', priceUsd: 150, priceUsdYear: 790, legacyPriceUsd: 79, gasPerMonth: 8000 },
  enterprise: { key: 'enterprise', name: 'Enterprise', priceUsd: 0, priceUsdYear: 1290, legacyPriceUsd: 129, gasPerMonth: 30000, contactSales: true },
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
/** A gas amount for copy: "2,500 gas". */
export function gasWord(n: number): string { return `${Math.round(n).toLocaleString('en-US')} gas`; }

/**
 * What a paying account is worth a month, in cents: the monthly list price, or the annual price spread over twelve
 * months. Enterprise accounts paying through PayPal hold a subscription from before the plan went to per-organization
 * pricing, so they are worth the price they subscribed at. Every margin and LTV figure in the console is built on
 * this monthly unit, whatever the cycle.
 */
export function mrrCentsFor(key: string | null | undefined, cycle: BillingCycle | null | undefined): number {
  const p = planFor(key);
  if (p.key === 'free') return 0;
  if (cycle === 'annual') return Math.round((p.priceUsdYear * 100) / 12);
  return (p.priceUsd || p.legacyPriceUsd) * 100;
}
