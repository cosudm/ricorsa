/**
 * Plans, prices and quotas. Free, then Essentials, Professional and Enterprise. Prices here are what the app
 * creates on PayPal for itself (src/lib/paypal-setup.ts): PayPal plans are immutable once created, so a price
 * change makes a new PayPal plan and the old one is kept as retired, so people already subscribed keep their
 * price and their access.
 */
export type PlanKey = 'free' | 'essentials' | 'professional' | 'enterprise';
/** The keys in use before September 2026. Rows and PayPal ids stored under them resolve to the plans that replaced them. */
export const LEGACY_PLAN_KEYS: Record<string, PlanKey> = { pro: 'essentials', team: 'professional' };
/** The plans in order of what they include, for "upgrade to" prompts. */
export const PLAN_ORDER: PlanKey[] = ['free', 'essentials', 'professional', 'enterprise'];
/** Every paid plan starts with a free trial of this many days through PayPal; billing begins when it ends. */
export const TRIAL_DAYS = 14;
/** The plans shown on the pricing page: the paid ones. Free is the state of an account with no subscription, not an offer. */
export const OFFERED_PLANS: PlanKey[] = ['essentials', 'professional', 'enterprise'];

/** `files`: how many files a question can carry and how large each may be. */
export type Caps = { graph: 'preview' | 'full'; discover: 'locked' | 'full'; connectors: number; files: { perQuestion: number; maxMb: number } };

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsd: number;            // per month, 0 for free
  caps: Caps;                  // what the identity graph and Discover can do on this plan
  paypalPlanEnv?: string;      // env var holding the PayPal plan id
  /** The env var the plan's PayPal id lived in under its previous name and price, for subscriptions taken out then. */
  legacyPaypalPlanEnv?: string;
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
    caps: { graph: 'preview', discover: 'locked', connectors: 0, files: { perQuestion: 2, maxMb: 10 } },
    questionsPerDay: 10,
    questionsPerMonth: 150,
    researchPerMonth: 0,
    tiers: ['quick', 'default'],
    spaces: 1,
    blurb: 'Try it and let the graph start learning you.',
    features: ['10 questions a day', 'Live web citations', 'Attach files to a question: PDFs, documents, spreadsheets, images', 'Identity graph preview: it learns you and suggests what to ask next', '1 Space'],
  },
  essentials: {
    key: 'essentials',
    name: 'Essentials',
    priceUsd: 25,
    paypalPlanEnv: 'PAYPAL_PLAN_ESSENTIALS',
    legacyPaypalPlanEnv: 'PAYPAL_PLAN_PRO',
    caps: { graph: 'full', discover: 'locked', connectors: 3, files: { perQuestion: 5, maxMb: 25 } },
    questionsPerDay: 300,
    questionsPerMonth: 1500,
    researchPerMonth: 40,
    tiers: ['quick', 'default', 'complex'],
    spaces: 25,
    blurb: 'The full identity graph, for people who research every day.',
    features: ['Full Identity Graph: the living map, intents, connections and provenance of every node', 'Up to 1,500 questions a month', '40 Research reports a month', 'Reasoning model', '3 Connectors: apps, MCP servers, websites and document vaults your answers can use', 'Unlimited Library, 25 Spaces', 'Export everything, any time'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    priceUsd: 55,
    paypalPlanEnv: 'PAYPAL_PLAN_PROFESSIONAL',
    legacyPaypalPlanEnv: 'PAYPAL_PLAN_TEAM',
    caps: { graph: 'full', discover: 'full', connectors: 25, files: { perQuestion: 10, maxMb: 40 } },
    questionsPerDay: 1000,
    questionsPerMonth: 5000,
    researchPerMonth: 150,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100,
    blurb: 'Everything in Essentials, plus Discover: turn your research into working tools.',
    features: ['Everything in Essentials', 'Discover, fully unlocked: apps, agents, tools, datasets and credentials built from your own asset, each checked in a real browser and stamped with a provenance id', 'Up to 5,000 questions a month', '150 Research reports a month', '25 Connectors, each usable everywhere or kept to one Space', '100 Spaces', 'Priority support'],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    priceUsd: 85,
    paypalPlanEnv: 'PAYPAL_PLAN_ENTERPRISE',
    caps: { graph: 'full', discover: 'full', connectors: 100, files: { perQuestion: 20, maxMb: 60 } },
    questionsPerDay: 3000,
    questionsPerMonth: 15000,
    researchPerMonth: 500,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100000,
    blurb: 'For firms that run on research: the highest limits, every connector, and a direct line to us.',
    features: ['Everything in Professional', 'Up to 15,000 questions a month', '500 Research reports a month', '100 Connectors', 'Unlimited Spaces', 'Larger files: 20 per question, up to 60 MB each', 'A direct line to us, with onboarding for your team', 'Deployment options on your own data and geography with the SMEPro Identity Graph'],
  },
};

/**
 * Subscription statuses that grant the paid plan on the row: PayPal's ACTIVE and APPROVAL_PENDING, plus TRIAL and
 * LICENSED, which the Manager Console sets by hand (with `planRenewsAt` as the end date, or null for open-ended).
 */
export const GRANTING_STATUSES = new Set(['ACTIVE', 'APPROVAL_PENDING', 'TRIAL', 'LICENSED']);
export function statusGrants(status: string | null | undefined): boolean { return !status || GRANTING_STATUSES.has(status); }
/** Console grants that have run past their end date no longer count. */
export function grantExpired(status: string | null | undefined, renewsAt: Date | number | null | undefined): boolean {
  if (status !== 'TRIAL' && status !== 'LICENSED') return false;
  if (!renewsAt) return false;
  return new Date(renewsAt).getTime() < Date.now();
}

/** A stored plan key as a current one: today's keys pass through, the previous names map to their successors, anything else is Free. */
export function normalizePlanKey(key: string | null | undefined): PlanKey {
  if (key && key in PLANS) return key as PlanKey;
  if (key && key in LEGACY_PLAN_KEYS) return LEGACY_PLAN_KEYS[key];
  return 'free';
}
export function planFor(key: string | null | undefined): Plan { return PLANS[normalizePlanKey(key)]; }
/** The plan above this one, or null at the top. */
export function nextPlan(key: string | null | undefined): Plan | null {
  const i = PLAN_ORDER.indexOf(normalizePlanKey(key));
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLANS[PLAN_ORDER[i + 1]] : null;
}

/** What the app keeps about the PayPal side: the current plan id per tier, and every earlier id (an old price, an old name) mapped to the tier it grants. */
export type ProvisionedPlans = { plans: Partial<Record<string, string>>; retired?: Record<string, string> };

/** The PayPal plan id for a paid tier: an explicit env var wins, otherwise the id the app provisioned itself. */
export function paypalPlanId(key: PlanKey, provisioned?: ProvisionedPlans | null): string | null {
  const env = PLANS[key].paypalPlanEnv;
  if (!env) return null;
  return process.env[env] || provisioned?.plans?.[key] || null;
}

/** Map a PayPal plan id back to our plan key, including ids from before a rename or a price change. */
export function planKeyFromPaypalPlan(paypalPlanId: string | null | undefined, provisioned?: ProvisionedPlans | null): PlanKey | null {
  if (!paypalPlanId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.paypalPlanEnv && process.env[p.paypalPlanEnv] === paypalPlanId) return p.key;
    if (p.legacyPaypalPlanEnv && process.env[p.legacyPaypalPlanEnv] === paypalPlanId) return p.key;
  }
  for (const [key, id] of Object.entries(provisioned?.plans || {})) if (id === paypalPlanId) return normalizePlanKey(key);
  const retired = provisioned?.retired?.[paypalPlanId];
  if (retired) return normalizePlanKey(retired);
  return null;
}

/** Rough per-answer cost estimate in micro-dollars, for the usage table. Adjust to current list prices. */
export const PRICE_PER_MTOK_USD: Record<string, { in: number; out: number; cacheRead: number; cacheWrite?: number }> = {
  quick: { in: 0.6, out: 2.5, cacheRead: 0.15 },   // Kimi K3, low effort (list prices; adjust when Moonshot publishes K3 rates)
  default: { in: 0.6, out: 2.5, cacheRead: 0.15 }, // Kimi K3, medium effort
  complex: { in: 0.6, out: 2.5, cacheRead: 0.15 }, // Kimi K3, max effort
  build: { in: 10, out: 50, cacheRead: 1, cacheWrite: 12.5 },   // Claude Fable 5.1 for the Build studio (Kimi rates apply when it falls back)
  ideas: { in: 10, out: 50, cacheRead: 1, cacheWrite: 12.5 },   // Discover ideas, written by the build model
};
/** List prices per model family, so the estimate follows whichever model actually answered. */
const PRICE_BY_MODEL: Array<[RegExp, { in: number; out: number; cacheRead: number; cacheWrite?: number }]> = [
  [/^claude-fable/i, { in: 10, out: 50, cacheRead: 1, cacheWrite: 12.5 }],
  [/^claude-opus/i, { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/^claude-sonnet/i, { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  [/^claude-haiku/i, { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
  [/^kimi|^moonshot/i, { in: 0.6, out: 2.5, cacheRead: 0.15 }],
  // Other providers an admin can add under Model accounts: rough list prices per million tokens; unknown ids fall back to the tier's rate.
  [/^gpt-5(\.\d+)?-nano/i, { in: 0.05, out: 0.4, cacheRead: 0.005 }],
  [/^gpt-5(\.\d+)?-mini/i, { in: 0.25, out: 2, cacheRead: 0.025 }],
  [/^gpt-5/i, { in: 1.25, out: 10, cacheRead: 0.125 }],
  [/^gpt-4\.1-nano/i, { in: 0.1, out: 0.4, cacheRead: 0.025 }],
  [/^gpt-4\.1-mini/i, { in: 0.4, out: 1.6, cacheRead: 0.1 }],
  [/^gpt-4\.1/i, { in: 2, out: 8, cacheRead: 0.5 }],
  [/^gpt-4o-mini/i, { in: 0.15, out: 0.6, cacheRead: 0.075 }],
  [/^gpt-4o/i, { in: 2.5, out: 10, cacheRead: 1.25 }],
  [/^o[34]-mini/i, { in: 1.1, out: 4.4, cacheRead: 0.275 }],
  [/^o[13](-|$)/i, { in: 2, out: 8, cacheRead: 0.5 }],
  [/^gemini-.*flash-lite/i, { in: 0.1, out: 0.4, cacheRead: 0.025 }],
  [/^gemini-.*flash/i, { in: 0.3, out: 2.5, cacheRead: 0.075 }],
  [/^gemini-/i, { in: 1.25, out: 10, cacheRead: 0.31 }],
  [/^grok-.*(fast|mini)/i, { in: 0.3, out: 0.5, cacheRead: 0.075 }],
  [/^grok-/i, { in: 3, out: 15, cacheRead: 0.75 }],
  [/^deepseek-reasoner/i, { in: 0.55, out: 2.19, cacheRead: 0.14 }],
  [/^deepseek-/i, { in: 0.27, out: 1.1, cacheRead: 0.07 }],
  [/^(mistral-large|magistral-medium)/i, { in: 2, out: 6, cacheRead: 2 }],
  [/^(mistral-medium|codestral|devstral-medium)/i, { in: 0.4, out: 2, cacheRead: 0.4 }],
  [/^(mistral-small|ministral|magistral-small|devstral-small|pixtral|open-mistral|open-mixtral)/i, { in: 0.1, out: 0.3, cacheRead: 0.1 }],
  [/llama-?3\.[13]-70b|llama-?4/i, { in: 0.59, out: 0.79, cacheRead: 0.59 }],
  [/llama-?3\.[13]-8b|llama-?3\.2/i, { in: 0.05, out: 0.08, cacheRead: 0.05 }],
  [/gpt-oss-120b/i, { in: 0.15, out: 0.6, cacheRead: 0.15 }],
  [/gpt-oss-20b/i, { in: 0.075, out: 0.3, cacheRead: 0.075 }],
];
/** Web search (Brave) is billed per query on top of tokens once past the free allowance. */
export const WEB_SEARCH_USD = 0.005;

export function estimateCostMicros(tier: string, tokensIn: number, tokensOut: number, cacheRead = 0, searches = 0, model?: string, cacheWrite = 0): number {
  const byModel = model ? PRICE_BY_MODEL.find(([re]) => re.test(model))?.[1] : undefined;
  const p = byModel || PRICE_PER_MTOK_USD[tier] || PRICE_PER_MTOK_USD.default;
  const usd = (tokensIn * p.in + tokensOut * p.out + cacheRead * p.cacheRead + cacheWrite * (p.cacheWrite ?? p.in)) / 1e6 + searches * WEB_SEARCH_USD;
  return Math.round(usd * 1e6);
}
