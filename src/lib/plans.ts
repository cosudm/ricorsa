/**
 * Plans, prices and quotas. Prices here are what the PayPal setup script creates;
 * change them before running `npm run paypal:setup` (PayPal plans are immutable once
 * created, so a price change means a new plan id).
 */
export type PlanKey = 'free' | 'pro' | 'team';

export type Caps = { graph: 'preview' | 'full'; discover: 'locked' | 'full'; connectors: number };

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsd: number;            // per month, 0 for free
  caps: Caps;                  // what the identity graph and Discover can do on this plan
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
    caps: { graph: 'preview', discover: 'locked', connectors: 0 },
    questionsPerDay: 10,
    questionsPerMonth: 150,
    researchPerMonth: 0,
    tiers: ['quick', 'default'],
    spaces: 1,
    blurb: 'Try it and let the graph start learning you.',
    features: ['10 questions a day', 'Live web citations', 'Identity graph preview: it learns you and suggests what to ask next', '1 Space'],
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    priceUsd: 20,
    paypalPlanEnv: 'PAYPAL_PLAN_PRO',
    caps: { graph: 'full', discover: 'locked', connectors: 3 },
    questionsPerDay: 300,
    questionsPerMonth: 1500,
    researchPerMonth: 40,
    tiers: ['quick', 'default', 'complex'],
    spaces: 25,
    blurb: 'The full identity graph, for people who ask all day.',
    features: ['Full Identity Graph: the living map, intents, connections and provenance of every node', 'Up to 1,500 questions a month', '40 Research reports a month', 'Reasoning model', '3 Connectors: outside apps and MCP servers the answers can use', 'Unlimited Library, 25 Spaces', 'Export everything, any time'],
  },
  team: {
    key: 'team',
    name: 'Team',
    priceUsd: 49,
    paypalPlanEnv: 'PAYPAL_PLAN_TEAM',
    caps: { graph: 'full', discover: 'full', connectors: 25 },
    questionsPerDay: 1000,
    questionsPerMonth: 5000,
    researchPerMonth: 150,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100,
    blurb: 'Everything in Pro, plus Discover.',
    features: ['Everything in Pro', 'Discover, fully unlocked: agents, apps, tools, credentials and data products drawn from your graph, each with a provenance id', 'Up to 5,000 questions a month', '150 Research reports a month', '25 Connectors', '100 Spaces', 'Priority support'],
  },
};

export function planFor(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : 'free'];
}

/** The PayPal plan id for a paid tier: an explicit env var wins, otherwise the id the app provisioned itself. */
export function paypalPlanId(key: PlanKey, provisioned?: Partial<Record<PlanKey, string>> | null): string | null {
  const env = PLANS[key].paypalPlanEnv;
  if (!env) return null;
  return process.env[env] || provisioned?.[key] || null;
}

/** Map a PayPal plan id back to our plan key. */
export function planKeyFromPaypalPlan(paypalPlanId: string | null | undefined, provisioned?: Partial<Record<PlanKey, string>> | null): PlanKey | null {
  if (!paypalPlanId) return null;
  for (const p of Object.values(PLANS)) if (p.paypalPlanEnv && (process.env[p.paypalPlanEnv] === paypalPlanId || provisioned?.[p.key] === paypalPlanId)) return p.key;
  return null;
}

/** Rough per-answer cost estimate in micro-dollars, for the usage table. Adjust to current list prices. */
export const PRICE_PER_MTOK_USD: Record<string, { in: number; out: number; cacheRead: number }> = {
  quick: { in: 0.6, out: 2.5, cacheRead: 0.15 },   // Kimi K3, low effort (list prices; adjust when Moonshot publishes K3 rates)
  default: { in: 0.6, out: 2.5, cacheRead: 0.15 }, // Kimi K3, medium effort
  complex: { in: 0.6, out: 2.5, cacheRead: 0.15 }, // Kimi K3, max effort
  build: { in: 0.6, out: 2.5, cacheRead: 0.15 },   // Kimi K2.7 code (high speed) for the Build studio
};
/** Web search (Brave) is billed per query on top of tokens once past the free allowance. */
export const WEB_SEARCH_USD = 0.005;

export function estimateCostMicros(tier: string, tokensIn: number, tokensOut: number, cacheRead = 0, searches = 0): number {
  const p = PRICE_PER_MTOK_USD[tier] || PRICE_PER_MTOK_USD.default;
  const usd = (tokensIn * p.in + tokensOut * p.out + cacheRead * p.cacheRead) / 1e6 + searches * WEB_SEARCH_USD;
  return Math.round(usd * 1e6);
}
