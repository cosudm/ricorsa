/**
 * PayPal self-provisioning. The first time billing is needed the app creates its catalog product,
 * one billing plan per paid tier and the webhook on PayPal, and keeps the ids in the `config` table.
 * Nothing needs to be copied around by hand: the credentials are the only configuration.
 * Explicit PAYPAL_PLAN_* / PAYPAL_WEBHOOK_ID env vars still win when set.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { PLANS, type PlanKey } from './plans';
import { createPlan, createProduct, createWebhook, paypalConfigured } from './paypal';

export type PaypalProvisioned = { env: 'live' | 'sandbox'; productId: string; plans: Partial<Record<PlanKey, string>>; webhookId?: string; webhookUrl?: string; createdAt: number };

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
    const fromEnv: Partial<Record<PlanKey, string>> = {};
    for (const p of Object.values(PLANS)) if (p.paypalPlanEnv && process.env[p.paypalPlanEnv]) fromEnv[p.key] = process.env[p.paypalPlanEnv];
    const wanted = Object.values(PLANS).filter(p => p.paypalPlanEnv && !fromEnv[p.key]);
    let productId = '';
    const plans: Partial<Record<PlanKey, string>> = { ...fromEnv };
    if (wanted.length) {
      const product = await createProduct('Ricorsa', 'Ricorsa answer engine subscription');
      productId = product.id;
      for (const plan of wanted) {
        const created = await createPlan(product.id, `Ricorsa ${plan.name}`, `${plan.name} plan: ${plan.blurb}`, plan.priceUsd);
        plans[plan.key] = created.id;
      }
    }
    cfg = { env, productId, plans, createdAt: Date.now() };
    // Two workers may race on the very first request; the first insert wins and everyone reads it back.
    await d.insert(schema.config).values({ key, value: cfg }).onConflictDoNothing();
    cfg = (await read()) || cfg;
  }

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
