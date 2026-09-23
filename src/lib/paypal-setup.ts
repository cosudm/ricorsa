/**
 * PayPal self-provisioning. The first time billing is needed the app creates its catalog product, the billing
 * plans for each paid tier (monthly and yearly, each with and without the free trial) and the webhook on PayPal,
 * and keeps the ids in the `config` table. Nothing needs to be copied around by hand: the credentials are the
 * only configuration. Explicit PAYPAL_PLAN_* / PAYPAL_WEBHOOK_ID env vars still win when set.
 *
 * Plans are reconciled against src/lib/plans.ts on every cold start: a tier with no PayPal plan yet gets one,
 * and a tier whose price or trial changed gets a new one (PayPal plans are immutable) while the old id is kept
 * as retired, so subscriptions taken out at the old price keep granting the tier they paid for.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { PLANS, LEGACY_PLAN_KEYS, TRIAL_DAYS, provisionKey, type PlanKey, type ProvisionedPlans } from './plans';
import { createPlan, createProduct, createWebhook, paypalConfigured } from './paypal';

export type PaypalProvisioned = ProvisionedPlans & { env: 'live' | 'sandbox'; productId: string; /** The price each current plan id was created at (older rows), so a price change is noticed. */ prices?: Partial<Record<PlanKey, number>>; /** What each current plan id was created with, `price|trialDays` (annual: `price|trialDays|YEAR`, keyed `<plan>:annual`), so a change to either makes a new plan. */ specs?: Partial<Record<string, string>>; webhookId?: string; webhookUrl?: string; createdAt: number };

let cached: PaypalProvisioned | null = null;
let inflight: Promise<PaypalProvisioned | null> | null = null;

function envName(): 'live' | 'sandbox' { return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox'; }
function webhookUrl(): string | null {
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return /^https:\/\//.test(base) && !/localhost/.test(base) ? base + '/api/billing/paypal/webhook' : null;
}

/** Everything PayPal-side the app needs, creating it on first use. Null when PayPal credentials are missing. */
export function paypalProvisioned(): Promise<PaypalProvisioned | null> {
  if (!paypalConfigured()) return Promise.resolve(null);
  if (cached && cached.env === envName() && (cached.webhookId || !webhookUrl())) return Promise.resolve(cached);
  if (!inflight) inflight = provision().finally(() => { inflight = null; });
  return inflight;
}

async function provision(): Promise<PaypalProvisioned | null> {
  const env = envName();
  const key = `paypal:${env}`;
  const d = db();
  const read = async () => (await d.select().from(schema.config).where(eq(schema.config.key, key)).limit(1))[0]?.value as PaypalProvisioned | undefined;
  let cfg = await read();

  if (!cfg) {
    cfg = { env, productId: '', plans: {}, prices: {}, retired: {}, createdAt: Date.now() };
    // Two workers may race on the very first request; the first insert wins and everyone reads it back.
    await d.insert(schema.config).values({ key, value: cfg }).onConflictDoNothing();
    cfg = (await read()) || cfg;
  }

  let changed = false;
  cfg.prices = cfg.prices || {}; cfg.specs = cfg.specs || {}; cfg.retired = cfg.retired || {};
  const specOf = (plan: { priceUsd: number }) => `${plan.priceUsd}|${TRIAL_DAYS}`;
  // Ids stored under a plan's previous name become retired ids for the plan that replaced it.
  for (const [legacy, current] of Object.entries(LEGACY_PLAN_KEYS)) {
    const id = cfg.plans[legacy];
    if (id) { cfg.retired[id] = current; delete cfg.plans[legacy]; changed = true; }
  }
  // Every paid tier needs a PayPal plan at today's price for each way it is sold: monthly and yearly, each with the
  // free trial for a first subscription and without it for people whose trial is behind them. An env var naming the
  // standard plan of a cycle wins for that plan. The monthly spec keeps its original form (price|trial) so the plans
  // already live are recognized and left alone.
  type Variant = { key: string; env?: string; price: number; trial: number; spec: string; interval: 'MONTH' | 'YEAR'; label: string; description: string };
  for (const plan of Object.values(PLANS)) {
    if (!plan.paypalPlanEnv) continue;
    const variants: Variant[] = [
      { key: plan.key, env: plan.paypalPlanEnv, price: plan.priceUsd, trial: TRIAL_DAYS, spec: specOf(plan), interval: 'MONTH', label: `Ricorsa ${plan.name}`, description: `${plan.name} plan: ${plan.blurb}` },
      { key: provisionKey(plan.key, 'monthly', false), price: plan.priceUsd, trial: 0, spec: `${plan.priceUsd}|0`, interval: 'MONTH', label: `Ricorsa ${plan.name} (no trial)`, description: `${plan.name} plan, billed from the first day: ${plan.blurb}` },
    ];
    if (plan.priceUsdYear && plan.paypalPlanEnvAnnual) {
      variants.push(
        { key: provisionKey(plan.key, 'annual'), env: plan.paypalPlanEnvAnnual, price: plan.priceUsdYear, trial: TRIAL_DAYS, spec: `${plan.priceUsdYear}|${TRIAL_DAYS}|YEAR`, interval: 'YEAR', label: `Ricorsa ${plan.name} (annual)`, description: `${plan.name} plan, billed yearly (two months free): ${plan.blurb}` },
        { key: provisionKey(plan.key, 'annual', false), price: plan.priceUsdYear, trial: 0, spec: `${plan.priceUsdYear}|0|YEAR`, interval: 'YEAR', label: `Ricorsa ${plan.name} (annual, no trial)`, description: `${plan.name} plan, billed yearly from the first day (two months free): ${plan.blurb}` },
      );
    }
    for (const c of variants) {
      if (c.env && process.env[c.env]) continue;
      const have = cfg.plans[c.key];
      // Older rows only recorded the monthly price; they read as "that price, no trial" so a plan created before trials gets a fresh one.
      const legacyPrice = c.key === plan.key ? cfg.prices[plan.key] : undefined;
      const haveSpec = cfg.specs[c.key] || (legacyPrice !== undefined ? `${legacyPrice}|0` : undefined);
      if (have && haveSpec === c.spec) continue;
      if (have) { cfg.retired[have] = c.key; }
      try {
        if (!cfg.productId) { const product = await createProduct('Ricorsa', 'Ricorsa answer engine subscription'); cfg.productId = product.id; }
        const created = await createPlan(cfg.productId, c.label, c.description, c.price, c.trial, c.interval);
        cfg.plans[c.key] = created.id; if (c.key === plan.key) cfg.prices[plan.key] = plan.priceUsd; cfg.specs[c.key] = c.spec; changed = true;
        console.log('[paypal] plan created', c.key, c.spec, created.id, have ? `(retired ${have})` : '');
      } catch (e) {
        // Leave the old id in place (still sellable at the old price) rather than none at all; the next cold start tries again.
        if (have) { delete cfg.retired[have]; }
        console.warn('[paypal] plan creation failed for', c.key, String((e as Error)?.message || e));
      }
    }
  }
  if (changed) await d.update(schema.config).set({ value: cfg, updatedAt: new Date() }).where(eq(schema.config.key, key));

  if (!cfg.webhookId) {
    const url = webhookUrl();
    if (process.env.PAYPAL_WEBHOOK_ID) cfg.webhookId = process.env.PAYPAL_WEBHOOK_ID;
    else if (url) {
      try {
        const hook = await createWebhook(url);
        cfg.webhookId = hook.id; cfg.webhookUrl = url;
        await d.update(schema.config).set({ value: cfg, updatedAt: new Date() }).where(eq(schema.config.key, key));
      } catch (e) { console.warn('PayPal webhook registration failed; will retry on a later request', e); }
    }
  }
  cached = cfg;
  return cfg;
}
