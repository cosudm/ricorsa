import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { PLANS, RETIRED_PLANS, normalizePlanKey, trialDaysFor } from '@/lib/plans';
import { finixProvisioned } from '@/lib/finix-setup';
import { finixConfigured, createInstrumentFromToken, createSubscription, customerMessageFor, isFinixError } from '@/lib/finix';
import { buyerIdentity } from '@/lib/finix-buyer';
import { applyFinixSubscription, trialEligible } from '@/lib/billing';

export const dynamic = 'force-dynamic';
const Body = z.object({ token: z.string().min(4).max(80), plan: z.enum(['essentials', 'professional', 'pro', 'team']) });

/**
 * POST /api/billing/finix/subscribe — a card subscription from the token Finix.js made in the browser. The card is
 * saved to the person's buyer identity, then the subscription is created from the tier's plan (first subscription:
 * the plan's trial applies) or priced directly with no trial (the account's one trial is behind it), and applied to the
 * account the same way a PayPal approval is. Finix checks the card with a small authorization first; a card it will not
 * take comes back as a plain sentence, never as Finix's words.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!finixConfigured()) return fail(503, 'Card checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  const key = normalizePlanKey(b.data.plan);
  const plan = PLANS[key];
  if (RETIRED_PLANS.has(key)) return fail(410, 'Ricorsa no longer sells subscriptions. Nothing was charged; recharge your gas instead.', 'plans_retired');
  if (key === 'free' || plan.contactSales || !plan.priceUsd) return fail(400, 'That plan is not sold online', 'invalid_request');
  const cfg = await finixProvisioned();
  if (!cfg?.merchantId) return fail(503, 'Card checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const trial = await trialEligible(user);
  const planId = trial ? cfg.plans[key] || null : null;
  if (trial && !planId) return fail(503, 'Card checkout is being set up for this plan. Please check back in a moment.', 'checkout_unavailable');
  try {
    const identityId = await buyerIdentity(user);
    const instrument = await createInstrumentFromToken(b.data.token, identityId);
    const sub = await createSubscription({
      merchantId: cfg.merchantId, identityId, instrumentId: instrument.id, planId, amountCents: Math.round(plan.priceUsd * 100),
      nickname: trial ? plan.name : `${plan.name} (billed from today)`,
      tags: { ricorsa_user: user.id, plan: key, trial: trial ? String(cfg.trialDays[key] ?? trialDaysFor(plan)) : '0' },
    });
    const result = await applyFinixSubscription(sub, user.id);
    if (!result) return fail(500, 'The subscription was created but could not be applied to your account. It will be applied automatically within a few minutes.', 'apply_failed');
    console.log('[finix] subscribed', JSON.stringify({ user: user.id, plan: key, trial, subscription: sub.id, state: sub.state, card: `${instrument.brand || 'card'} ${instrument.last_four || ''}`.trim() }));
    return json({ ok: true, plan: result.plan, planName: PLANS[result.plan]?.name || result.plan, status: result.status, trial, trialDays: trial ? (cfg.trialDays[key] ?? trialDaysFor(plan)) : 0, card: { brand: instrument.brand || null, lastFour: instrument.last_four || null } });
  } catch (e) {
    if (isFinixError(e)) {
      console.warn('[finix] subscribe failed', JSON.stringify({ user: user.id, plan: key, status: e.status, code: e.code, message: e.message.slice(0, 300) }));
      return fail(e.status === 422 || e.status === 402 || e.status === 400 ? 402 : 502, customerMessageFor(e), 'card_declined');
    }
    throw e;
  }
});
