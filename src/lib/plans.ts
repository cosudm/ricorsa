/**
 * Gas, recharges and plans. Since October 2026 Ricorsa is prepaid: every account starts with a grant of gas
 * (RECHARGE.signupGas), everything metered is priced in gas (a question 1, a Research report 10, a Discover idea
 * set 25, an app version 250, a browser action 1; see GAS), and when the gas runs out the person recharges, $20 to
 * $5,000 at a time at RECHARGE.gasPerUsd, by card or through PayPal. Bought gas never expires. Every account has
 * the full feature set (the Professional capabilities below); Enterprise is the contract tier the Manager Console
 * sets, with a monthly allowance and higher limits. Essentials and Professional are no longer sold: their
 * definitions stay so the subscriptions taken out before October 7, 2026 keep resolving (PayPal plans are
 * immutable, so their ids stay in the record as retired) and so the console's figures still read.
 */
export type PlanKey = 'free' | 'essentials' | 'professional' | 'enterprise';
/** The keys in use before September 2026. Rows and PayPal ids stored under them resolve to the plans that replaced them. */
export const LEGACY_PLAN_KEYS: Record<string, PlanKey> = { pro: 'essentials', team: 'professional' };
/** The plans in order of what they include. */
export const PLAN_ORDER: PlanKey[] = ['free', 'essentials', 'professional', 'enterprise'];
/** A first paid subscription starts with a free trial; billing begins when it ends. The default; a plan may carry its own `trialDays`. */
export const TRIAL_DAYS = 14;
/** The free trial a plan starts with, in days (one trial per account, whichever plan it starts on). */
export function trialDaysFor(plan: Pick<Plan, 'trialDays'>): number { return typeof plan.trialDays === 'number' ? plan.trialDays : TRIAL_DAYS; }
/** How a subscription bills. New plans bill monthly; annual subscriptions from before October 2026 keep billing yearly. */
export type BillingCycle = 'monthly' | 'annual';
export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'annual'];
export const ANNUAL_MONTHS_FREE = 2;
/**
 * The plans still offered: Enterprise alone, priced per organization. Essentials and Professional were retired on
 * October 7, 2026 (nothing new is sold; existing subscriptions run until canceled); the Recharge page sells gas.
 */
export const OFFERED_PLANS: PlanKey[] = ['enterprise'];
/** Plans that are not sold any more; a subscription to one is honored, a new one is refused. */
export const RETIRED_PLANS: ReadonlySet<PlanKey> = new Set<PlanKey>(['essentials', 'professional']);

/**
 * Recharges: the rate, the amounts offered, the welcome grant and the auto-recharge defaults. A recharge is one
 * card payment (or one PayPal order) credited at `gasPerUsd`; the tiles are what the Recharge page offers, with a
 * custom amount between `minUsd` and `maxUsd`. Auto-recharge charges the card on file for the person's chosen
 * amount when the balance falls below the threshold, at most once a day, and switches itself off after
 * `autoFailuresOff` failed charges.
 */
export const RECHARGE = {
  gasPerUsd: 40,
  minUsd: 20,
  maxUsd: 5000,
  tiles: [
    { usd: 20, label: 'Starting out', recommended: true },
    { usd: 50, label: 'Quick start' },
    { usd: 100, label: 'Small project' },
    { usd: 200, label: 'Full project' },
    { usd: 500, label: 'Production' },
    { usd: 1000, label: 'Ample usage' },
    { usd: 5000, label: 'Ample usage' },
  ],
  /** Gas every new account starts with, once. */
  signupGas: 500,
  autoThresholdGas: 200,
  autoUsdDefault: 20,
  autoMaxPerDay: 1,
  autoFailuresOff: 3,
  /** The Recharge Agreement in force; recorded with each purchase and consent. */
  agreementVersion: '2026-10-07',
} as const;
/** Gas for a dollar amount at the current rate. */
export function gasForUsd(usd: number): number { return Math.round(usd * RECHARGE.gasPerUsd); }
/** Whether an amount can be recharged: whole dollars within the offered range. */
export function validRechargeUsd(usd: unknown): usd is number { return typeof usd === 'number' && Number.isInteger(usd) && usd >= RECHARGE.minUsd && usd <= RECHARGE.maxUsd; }

/**
 * Gas: the one unit everything metered is priced in, so one gauge tells the person what they have left and what
 * each thing costs. The numbers follow what each thing costs to run (a Research report reads several pages and
 * writes a long report; an app version is written by the build model and checked in a real browser).
 */
export const GAS = {
  /** A Search-mode question on the Fast or Best model. */
  question: 1,
  /** A question on a premium model (the deep models: Claude Fable, GPT, Gemini Pro, Grok); Auto and the standard models cost `question`. */
  reasoning: 3,
  /** A Research report. */
  research: 10,
  /** One action of Ricorsa's browser: an open, a click, a typed field, a chosen option, a scroll or a back. */
  browserAction: 1,
  /** A minute of the person's own control of the browser after a take-over. */
  takeoverMinute: 1,
  /** A Discover idea set generated from the graph (a cached set served again is free). */
  ideaSet: 25,
  /** An app version written by the Build studio. */
  build: 250,
  /** A question a built app asks through its live line. */
  appQuestion: 1,
} as const;
export type GasKind = keyof typeof GAS;
/** What each kind is called on the gauge and in the receipts under an answer. */
export const GAS_LABELS: Record<GasKind, string> = {
  question: 'Question (Auto or a standard model)', reasoning: 'Question on a premium model', research: 'Research report', browserAction: 'Browser action', takeoverMinute: 'Minute in control of the browser', ideaSet: 'Discover idea set', build: 'App version (Build studio)', appQuestion: 'Question from a built app',
};
/** The $100 block of gas, kept for older clients and the console's copy (a recharge of $100 at the current rate). */
export const PAYG = { usd: 100, gas: 4000 } as const;
/** A gas amount for copy: "1 gas", "2,500 gas". */
export function gas(n: number): string { return `${Math.round(n).toLocaleString('en-US')} gas`; }

/** `files`: how many files a question can carry and how large each may be. `browser`: whether Ricorsa may open sites and work them for the person. */
export type Caps = { graph: 'preview' | 'full'; discover: 'locked' | 'full'; browser: 'locked' | 'full'; connectors: number; files: { perQuestion: number; maxMb: number } };

export type Plan = {
  key: PlanKey;
  name: string;
  priceUsd: number;            // per month, 0 for free
  /** Per year, billed once; two months free against twelve monthly payments. Absent where the plan is not sold annually. */
  priceUsdYear?: number;
  caps: Caps;                  // what the identity graph and Discover can do on this plan
  paypalPlanEnv?: string;      // env var holding the PayPal plan id
  /** The env var that may name the annual PayPal plan id (otherwise the app provisions one). */
  paypalPlanEnvAnnual?: string;
  /** The env var the plan's PayPal id lived in under its previous name and price, for subscriptions taken out then. */
  legacyPaypalPlanEnv?: string;
  /** Gas included every month; the one ceiling on questions, reports, idea sets, app versions and browser actions together. */
  gasPerMonth: number;
  /** Priced per organization: no online price, no PayPal plan; the card says Call for pricing. */
  contactSales?: boolean;
  /** The free trial this plan starts with, in days, when it differs from TRIAL_DAYS (Professional: 30). */
  trialDays?: number;
  /** No longer sold: honored for the subscriptions that hold it, refused for new ones. */
  retired?: boolean;
  tiers: Array<'quick' | 'default' | 'complex'>; // model tiers this plan may use
  spaces: number;              // max Spaces
  blurb: string;
  features: string[];
  /** A marker after the price (***) pointing at `licensing`, printed as a footnote under the plans. */
  priceMarker?: string;
  /** How organizations license the plan, when the per-person price is not the whole story. */
  licensing?: string;
};

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    priceUsd: 0,
    caps: { graph: 'preview', discover: 'locked', browser: 'locked', connectors: 0, files: { perQuestion: 2, maxMb: 10 } },
    /** No monthly refill since October 2026: an account runs on the gas it was given at signup and the gas it buys. */
    gasPerMonth: 0,
    tiers: ['quick', 'default'],
    spaces: 1,
    blurb: 'The state of an account with no subscription and no gas left.',
    features: ['500 gas when you sign up', 'Live web citations', 'Attach files to a question', 'The identity graph learns you and suggests what to ask next'],
  },
  essentials: {
    key: 'essentials',
    name: 'Essentials',
    retired: true,
    priceUsd: 60,
    paypalPlanEnv: 'PAYPAL_PLAN_ESSENTIALS',
    paypalPlanEnvAnnual: 'PAYPAL_PLAN_ESSENTIALS_ANNUAL',
    legacyPaypalPlanEnv: 'PAYPAL_PLAN_PRO',
    caps: { graph: 'full', discover: 'locked', browser: 'locked', connectors: 3, files: { perQuestion: 5, maxMb: 25 } },
    gasPerMonth: 2500,
    tiers: ['quick', 'default', 'complex'],
    spaces: 25,
    blurb: 'The full identity graph, for people who research every day.',
    features: ['2,500 gas a month: about 2,500 questions, or 250 Research reports, or any mix', 'Full Identity Graph: the living map, intents, connections and provenance of every node', 'Research reports and the Reasoning model', 'Memory: answers recall and cite your earlier answers and files', 'Files: 5 per question, up to 25 MB each', '3 Connectors: apps, MCP servers, websites and document vaults your answers can use', 'Unlimited Library, 25 Spaces', 'Export everything, any time'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    retired: true,
    priceUsd: 150,
    trialDays: 30,
    paypalPlanEnv: 'PAYPAL_PLAN_PROFESSIONAL',
    paypalPlanEnvAnnual: 'PAYPAL_PLAN_PROFESSIONAL_ANNUAL',
    legacyPaypalPlanEnv: 'PAYPAL_PLAN_TEAM',
    caps: { graph: 'full', discover: 'full', browser: 'full', connectors: 25, files: { perQuestion: 10, maxMb: 40 } },
    gasPerMonth: 8000,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100,
    blurb: 'Everything in Essentials, plus Discover and the Ricorsa Browser: turn your research into working tools.',
    features: ['8,000 gas a month, spent any way you like: questions, Research reports, Discover idea sets, app versions, browser actions', 'Everything in Essentials', 'Discover, fully unlocked: apps, agents, tools, datasets and credentials built from your own asset, each checked in a real browser and stamped with a provenance id', 'Build studio: app versions written, tested and repaired for you', 'Ricorsa Browser: Ricorsa opens a website and works it for you while you watch; take the page over when you need to', 'Files: 10 per question, up to 40 MB each', '25 Connectors, each usable everywhere or kept to one Space', '100 Spaces', 'Priority support'],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    priceUsd: 0,
    contactSales: true,
    paypalPlanEnv: 'PAYPAL_PLAN_ENTERPRISE',
    paypalPlanEnvAnnual: 'PAYPAL_PLAN_ENTERPRISE_ANNUAL',
    caps: { graph: 'full', discover: 'full', browser: 'full', connectors: 100, files: { perQuestion: 20, maxMb: 60 } },
    gasPerMonth: 30000,
    tiers: ['quick', 'default', 'complex'],
    spaces: 100000,
    blurb: 'Everything in Ricorsa, for a firm that runs on research: a gas allowance set for your organization, every connector, and a direct line to us.',
    features: ['Everything a prepaid account has: the full identity graph, Research, Discover, the Build studio and the Ricorsa Browser', 'A gas allowance set for your organization, raised as you grow', 'Files: 20 per question, up to 60 MB each', '100 Connectors', 'Unlimited Spaces', 'A direct line to us, with onboarding for your team', 'Seat and floating licenses for organizations, with deployment on your own data and geography'],
    licensing: 'Enterprise licensing for organizations: seat licenses or floating licenses shared across a team, with deployment on your own data and geography. Call for pricing: enterprise@ricorsa.com.',
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
/**
 * The plan whose capabilities apply to an account. Since October 2026 every account has the full feature set, the
 * Professional capabilities, whatever it pays or has left (the meter, not a gate, is what says "recharge to
 * continue"); Enterprise keeps its own, higher limits. The balance argument is kept for callers from before.
 */
export function capabilityPlanKey(subscriptionPlan: string | null | undefined, _gasBalance?: number | null | undefined): PlanKey {
  void _gasBalance;
  return normalizePlanKey(subscriptionPlan) === 'enterprise' ? 'enterprise' : 'professional';
}
/** The plan above this one that is still sold, or null: with Essentials and Professional retired there is nothing to move up to online. */
export function nextPlan(key: string | null | undefined): Plan | null {
  const i = PLAN_ORDER.indexOf(normalizePlanKey(key));
  for (let j = i + 1; j < PLAN_ORDER.length; j++) { const p = PLANS[PLAN_ORDER[j]]; if (!p.retired && !p.contactSales) return p; }
  return null;
}

/**
 * What the app keeps about the PayPal side: the current plan id per tier and cycle (`essentials` for monthly,
 * `essentials:annual` for annual), and every earlier id (an old price, an old name) mapped to the tier it grants.
 */
export type ProvisionedPlans = { plans: Partial<Record<string, string>>; retired?: Record<string, string> };

/**
 * The key a PayPal plan is stored under in the provisioned record: the tier, `:annual` when it bills yearly, and
 * `:notrial` for the variant sold to people whose free trial is behind them (one trial per account).
 */
export function provisionKey(key: PlanKey, cycle: BillingCycle = 'monthly', trial = true): string {
  return `${key}${cycle === 'annual' ? ':annual' : ''}${trial ? '' : ':notrial'}`;
}
/** A stored provision key back to its plan and cycle (the trial variant bills the same tier the same way). */
export function parseProvisionKey(k: string): { key: PlanKey; cycle: BillingCycle } {
  const [base, ...rest] = k.split(':');
  return { key: normalizePlanKey(base), cycle: rest.includes('annual') ? 'annual' : 'monthly' };
}
/** A dollar amount for copy: whole dollars with a thousands separator, cents only when there are any. */
export function usd(n: number): string { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
/** The price a plan bills at for a cycle; null when the plan is not sold that way. */
export function priceFor(plan: Plan, cycle: BillingCycle): number | null {
  if (cycle === 'annual') return plan.priceUsdYear ?? null;
  return plan.priceUsd || null;
}
/**
 * What a year costs per month on the annual plan, in whole dollars, for the pricing page's monthly-equivalent figure.
 * Rounded up, so the card never shows less than what is paid; the footnote carries the exact yearly amount.
 */
export function monthlyEquivalent(plan: Plan): number | null {
  return plan.priceUsdYear ? Math.ceil(plan.priceUsdYear / 12) : null;
}
/** What a year of monthly payments would cost beyond the annual price: the "two months free". */
export function annualSaving(plan: Plan): number {
  return plan.priceUsdYear ? Math.max(0, plan.priceUsd * 12 - plan.priceUsdYear) : 0;
}

/**
 * The PayPal plan id for a paid tier, cycle and trial eligibility: an explicit env var wins for the standard (trial)
 * plan, otherwise the id the app provisioned itself. When the no-trial variant is not provisioned yet the trial plan
 * is sold instead, so a checkout is never blocked on it.
 */
export function paypalPlanId(key: PlanKey, provisioned?: ProvisionedPlans | null, cycle: BillingCycle = 'monthly', trial = true): string | null {
  const plan = PLANS[key];
  const env = cycle === 'annual' ? plan.paypalPlanEnvAnnual : plan.paypalPlanEnv;
  if (!env || plan.contactSales || !plan.priceUsd) return null;
  if (cycle === 'annual' && !plan.priceUsdYear) return null;
  const standard = process.env[env] || provisioned?.plans?.[provisionKey(key, cycle)] || null;
  if (trial) return standard;
  return provisioned?.plans?.[provisionKey(key, cycle, false)] || standard;
}

/** Map a PayPal plan id back to our plan and its billing cycle, including ids from before a rename or a price change. */
export function planFromPaypalPlan(paypalPlanId: string | null | undefined, provisioned?: ProvisionedPlans | null): { key: PlanKey; cycle: BillingCycle } | null {
  if (!paypalPlanId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.paypalPlanEnv && process.env[p.paypalPlanEnv] === paypalPlanId) return { key: p.key, cycle: 'monthly' };
    if (p.paypalPlanEnvAnnual && process.env[p.paypalPlanEnvAnnual] === paypalPlanId) return { key: p.key, cycle: 'annual' };
    if (p.legacyPaypalPlanEnv && process.env[p.legacyPaypalPlanEnv] === paypalPlanId) return { key: p.key, cycle: 'monthly' };
  }
  for (const [k, id] of Object.entries(provisioned?.plans || {})) if (id === paypalPlanId) return parseProvisionKey(k);
  const retired = provisioned?.retired?.[paypalPlanId];
  if (retired) return parseProvisionKey(retired);
  return null;
}
/** The plan key alone, for callers that do not care how it bills. */
export function planKeyFromPaypalPlan(paypalPlanId: string | null | undefined, provisioned?: ProvisionedPlans | null): PlanKey | null {
  return planFromPaypalPlan(paypalPlanId, provisioned)?.key ?? null;
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
