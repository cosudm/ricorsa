/**
 * Plans, prices and quotas. Prices here are what the PayPal setup script creates;
 * change them before running `npm run paypal:setup` (PayPal plans are immutable once
 * created, so a price change means a new plan id).
 */
export type PlanKey = 'free' | 'pro' | 'team';

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsd: number;            // per month, 0 for free
  paypalPlanEnv?: string;      // env var holding the PayPal plan id
  questionsPerDay: number;     // Search-mode answers per day
  questionsPerMonth: number;   // hard monthly ceiling on all answers
  researchPerMonth: number;    // Research-mode answers per month
  tiers: Array<'quick' | 'default' | 'complex'>; // model tiers this plan may use
  spaces: number;              // max Spaces
  blurb: string;
  features: string[];
};

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    priceUsd: 0,
    questionsPerDay: 10,
    questionsPerMonth: 150,
    researchPerMonth: 0,
    tiers: ['quick', 'default'],
    spaces: 1,
    blurb: 'Try it and let the graph start learning you.',
    features: ['10 questions a day', 'Live web citations', 'Your identity graph', '1 Space'],
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    priceUsd: 20,
    paypalPlanEnv: 'PAYPAL_PLAN_PRO',
    questionsPerDay: 300,
    questionsPerMonth: 1500,
    researchPerMonth: 40,
    tiers: ['quick', 'default', 'complex'],
    spaces: 25,
    blurb: 'For people who ask all day.',
    features: ['Up to 1,500 questions a month', '40 Research reports a month', 'Reasoning model', 'Unlimited Library, 25 Spaces', 'Export everything, any time'],
  },
  team: {
    key: 'team',
    name: 'Team',
    priceUsd: 49,
    paypalPlanEnv: 'PAYPAL_PLAN_TEAM',
    questionsPerDay: 1000,
    questionsPerMonth: 5000,
    researchPerMonth: 150,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100,
    blurb: 'Higher limits for heavy, daily use.',
    features: ['Up to 5,000 questions a month', '150 Research reports a month', 'Reasoning model', '100 Spaces', 'Priority support'],
  },
};

export function planFor(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : 'free'];
}

export function paypalPlanId(key: PlanKey): string | null {
  const env = PLANS[key].paypalPlanEnv;
  return env ? process.env[env] || null : null;
}

/** Map a PayPal plan id back to our plan key. */
export function planKeyFromPaypalPlan(paypalPlanId: string | null | undefined): PlanKey | null {
  if (!paypalPlanId) return null;
  for (const p of Object.values(PLANS)) if (p.paypalPlanEnv && process.env[p.paypalPlanEnv] === paypalPlanId) return p.key;
  return null;
}

/** Rough per-answer cost estimate in micro-dollars, for the usage table. Adjust to current list prices. */
export const PRICE_PER_MTOK_USD: Record<string, { in: number; out: number; cacheRead: number }> = {
  quick: { in: 1, out: 5, cacheRead: 0.1 },
  default: { in: 3, out: 15, cacheRead: 0.3 },
  complex: { in: 5, out: 25, cacheRead: 0.5 },
};
/** Anthropic web search is billed per search on top of tokens. */
export const WEB_SEARCH_USD = 0.01;

export function estimateCostMicros(tier: string, tokensIn: number, tokensOut: number, cacheRead = 0, searches = 0): number {
  const p = PRICE_PER_MTOK_USD[tier] || PRICE_PER_MTOK_USD.default;
  const usd = (tokensIn * p.in + tokensOut * p.out + cacheRead * p.cacheRead) / 1e6 + searches * WEB_SEARCH_USD;
  return Math.round(usd * 1e6);
}
