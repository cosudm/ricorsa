/**
 * Finix self-provisioning, the way PayPal's works. With the API credentials in place the app reads the merchant and
 * its subscription plans from Finix and keeps what it needs in the `config` table under `finix:<env>`: the application
 * and merchant ids, the plan id for each tier sold online (matched by name, price, monthly interval and trial; a tier
 * whose price or trial changed gets a new plan while the old id is kept as retired), and the webhook it registered,
 * with the webhook's signing key and bearer token sealed. Reconciled on every cold start; nothing is copied by hand.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { PLANS, OFFERED_PLANS, trialDaysFor, type PlanKey } from './plans';
import { finixConfigured, finixEnv, listPlans, listMerchants, createPlan, planTrialDays, listWebhooks, createWebhook, type FinixPlan } from './finix';
import { sealJson, openJson } from './secretbox';

export type FinixProvisioned = {
  env: 'live' | 'sandbox';
  applicationId: string;
  merchantId: string;
  /** The Finix subscription plan id per tier sold online. */
  plans: Partial<Record<PlanKey, string>>;
  /** What each plan id was matched or created with: `price|trialDays`. */
  specs: Partial<Record<PlanKey, string>>;
  /** Trial days per tier, as the Finix plan carries them (what the pricing page says for card checkout). */
  trialDays: Partial<Record<PlanKey, number>>;
  /** Earlier plan ids (an old price or trial) mapped to the tier they grant, so their subscriptions still resolve. */
  retired: Record<string, PlanKey>;
  webhookId?: string;
  webhookUrl?: string;
  /** Sealed: the webhook's signing key and the bearer token Finix presents. */
  signingKeySealed?: string;
  bearerSealed?: string;
  createdAt: number;
  updatedAt?: number;
};

let cached: FinixProvisioned | null = null;
let inflight: Promise<FinixProvisioned | null> | null = null;

function webhookUrl(): string | null {
  if (process.env.FINIX_WEBHOOK_URL && process.env.NODE_ENV !== 'production') return process.env.FINIX_WEBHOOK_URL;   // tests point the stand-in at the dev server
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return /^https:\/\//.test(base) && !/localhost/.test(base) ? base + '/api/billing/finix/webhook' : null;
}
const specOf = (key: PlanKey) => `${PLANS[key].priceUsd}|${trialDaysFor(PLANS[key])}`;

/** Everything Finix-side the app needs, read or created on first use. Null when the credentials are missing. */
export function finixProvisioned(): Promise<FinixProvisioned | null> {
  if (!finixConfigured()) return Promise.resolve(null);
  if (cached && cached.env === finixEnv() && (cached.webhookId || !webhookUrl())) return Promise.resolve(cached);
  if (!inflight) inflight = provision().finally(() => { inflight = null; });
  return inflight;
}

/** Whether a Finix plan is the tier as plans.ts defines it today: the name, the monthly price, the interval and the trial. */
function matches(p: FinixPlan, key: PlanKey): boolean {
  const plan = PLANS[key];
  return p.state === 'ACTIVE' && String(p.linked_type).toUpperCase() === 'MERCHANT' && String(p.billing_interval).toUpperCase() === 'MONTHLY' && String(p.currency).toUpperCase() === 'USD'
    && p.amount === Math.round(plan.priceUsd * 100) && planTrialDays(p) === trialDaysFor(plan)
    && (String(p.plan_name || '').trim().toLowerCase() === plan.name.toLowerCase() || String(p.nickname || '').trim().toLowerCase() === plan.name.toLowerCase());
}

async function provision(): Promise<FinixProvisioned | null> {
  const env = finixEnv();
  const key = `finix:${env}`;
  const d = db();
  const read = async () => (await d.select().from(schema.config).where(eq(schema.config.key, key)).limit(1))[0]?.value as FinixProvisioned | undefined;
  let cfg = await read();
  if (!cfg) {
    cfg = { env, applicationId: '', merchantId: '', plans: {}, specs: {}, trialDays: {}, retired: {}, createdAt: Date.now() };
    await d.insert(schema.config).values({ key, value: cfg }).onConflictDoNothing();
    cfg = (await read()) || cfg;
  }
  cfg.plans = cfg.plans || {}; cfg.specs = cfg.specs || {}; cfg.trialDays = cfg.trialDays || {}; cfg.retired = cfg.retired || {};
  let changed = false;

  // The merchant's plans as Finix has them now, and the merchant and application they hang off.
  let existing: FinixPlan[] = [];
  try { existing = await listPlans(); } catch (e) { console.warn('[finix] could not list plans', String((e as Error)?.message || e)); }
  const anyPlan = existing.find(p => p.linked_type === 'MERCHANT');
  if (anyPlan) {
    if (cfg.merchantId !== anyPlan.linked_to) { cfg.merchantId = anyPlan.linked_to; changed = true; }
    if (anyPlan.application_id && cfg.applicationId !== anyPlan.application_id) { cfg.applicationId = anyPlan.application_id; changed = true; }
  }
  if (!cfg.merchantId) {
    try { const m = (await listMerchants()).find(x => x.processing_enabled !== false) || (await listMerchants())[0]; if (m) { cfg.merchantId = m.id; if (m.application && !cfg.applicationId) cfg.applicationId = m.application; changed = true; } }
    catch (e) { console.warn('[finix] could not list merchants', String((e as Error)?.message || e)); }
  }

  // Each tier sold online: keep the id whose spec still matches, adopt a plan the merchant already made for it, or create one.
  for (const k of OFFERED_PLANS) {
    const plan = PLANS[k];
    if (plan.contactSales || !plan.priceUsd) continue;
    const spec = specOf(k);
    const have = cfg.plans[k];
    if (have && cfg.specs[k] === spec && existing.some(p => p.id === have && p.state === 'ACTIVE')) continue;
    if (have && cfg.specs[k] === spec && !existing.length) continue;   // the list could not be read; keep what we have
    const found = existing.find(p => matches(p, k));
    if (found) {
      if (have && have !== found.id) cfg.retired[have] = k;
      cfg.plans[k] = found.id; cfg.specs[k] = spec; cfg.trialDays[k] = planTrialDays(found); changed = true;
      console.log('[finix] plan adopted', k, spec, found.id, have && have !== found.id ? `(retired ${have})` : '');
      continue;
    }
    if (!cfg.merchantId) { console.warn('[finix] no merchant to create a plan for', k); continue; }
    try {
      const created = await createPlan({ merchantId: cfg.merchantId, name: plan.name, amountCents: Math.round(plan.priceUsd * 100), trialDays: trialDaysFor(plan), description: 'ricorsa.com' });
      if (have && have !== created.id) cfg.retired[have] = k;
      cfg.plans[k] = created.id; cfg.specs[k] = spec; cfg.trialDays[k] = trialDaysFor(plan); changed = true;
      if (created.application_id && !cfg.applicationId) cfg.applicationId = created.application_id;
      console.log('[finix] plan created', k, spec, created.id, have ? `(retired ${have})` : '');
    } catch (e) {
      // Keep the old id in place (still sellable at the old price) rather than none at all; the next cold start tries again.
      console.warn('[finix] plan creation failed for', k, String((e as Error)?.message || e));
    }
  }
  // Ids retired by an earlier reconciliation that are still the current one for a tier are not retired after all.
  for (const [id, k] of Object.entries(cfg.retired)) if (cfg.plans[k] === id) delete cfg.retired[id];

  // The webhook: one per environment, with a bearer token of ours and Finix's signing key, both sealed.
  const url = webhookUrl();
  if (!cfg.webhookId && url) {
    try {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const hook = await createWebhook(url, token);
      cfg.webhookId = hook.id; cfg.webhookUrl = url;
      cfg.bearerSealed = await sealJson(token);
      if (hook.secret_signing_key) cfg.signingKeySealed = await sealJson(hook.secret_signing_key);
      else console.warn('[finix] the webhook came back without a signing key; deliveries will be checked by the bearer token alone');
      changed = true;
      console.log('[finix] webhook created', hook.id, url);
    } catch (e) {
      // A webhook on this URL may already exist from an earlier attempt whose record was lost: adopt it (its key cannot be read back, so the bearer token is what we check).
      try { const hit = (await listWebhooks()).find(w => w.url === url); if (hit) { cfg.webhookId = hit.id; cfg.webhookUrl = url; changed = true; console.warn('[finix] webhook adopted without its signing key', hit.id); } }
      catch { /* nothing to adopt */ }
      if (!cfg.webhookId) console.warn('[finix] webhook registration failed; will retry on a later request', String((e as Error)?.message || e));
    }
  }

  if (changed) { cfg.updatedAt = Date.now(); await d.update(schema.config).set({ value: cfg, updatedAt: new Date() }).where(eq(schema.config.key, key)); }
  cached = cfg;
  return cfg;
}

/** The webhook secrets, opened: the signing key and the bearer token (either may be missing). */
export async function finixWebhookSecrets(cfg: FinixProvisioned): Promise<{ signingKey: string | null; bearer: string | null }> {
  return { signingKey: cfg.signingKeySealed ? await openJson<string>(cfg.signingKeySealed) : null, bearer: cfg.bearerSealed ? await openJson<string>(cfg.bearerSealed) : null };
}

/** The tier a Finix plan id grants, current or retired; null for a plan that is not ours. */
export function planKeyFromFinixPlan(planId: string | null | undefined, cfg: FinixProvisioned | null): PlanKey | null {
  if (!planId || !cfg) return null;
  for (const [k, id] of Object.entries(cfg.plans)) if (id === planId) return k as PlanKey;
  return cfg.retired[planId] || null;
}

/** What the pricing page needs for the card form: the environment, the application id, and the plans (with their trial) that can be sold by card. */
export function finixPublic(cfg: FinixProvisioned | null): { env: 'live' | 'sandbox'; applicationId: string; plans: Partial<Record<PlanKey, { trialDays: number }>>; merchant: boolean } | null {
  if (!cfg || !cfg.applicationId) return null;
  const plans: Partial<Record<PlanKey, { trialDays: number }>> = {};
  for (const [k, id] of Object.entries(cfg.plans)) if (id) plans[k as PlanKey] = { trialDays: cfg.trialDays[k as PlanKey] ?? trialDaysFor(PLANS[k as PlanKey]) };
  return { env: cfg.env, applicationId: cfg.applicationId, plans, merchant: !!cfg.merchantId };
}
