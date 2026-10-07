import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { getSubscription, cancelSubscription } from '@/lib/paypal';
import { applySubscription } from '@/lib/billing';
import { PLANS, RETIRED_PLANS, planKeyFromPaypalPlan } from '@/lib/plans';
import { paypalProvisioned } from '@/lib/paypal-setup';

export const dynamic = 'force-dynamic';
const Body = z.object({ subscriptionId: z.string().min(3).max(64) });

/**
 * Called by the PayPal button's onApprove. We never trust the browser: the subscription is
 * fetched from PayPal, must carry this user's id in custom_id, and its status decides the plan.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const sub = await getSubscription(b.data.subscriptionId);
  if (sub.custom_id && sub.custom_id !== user.id) return fail(403, 'That subscription belongs to another account');
  // Essentials and Professional are not sold since October 7, 2026: a subscription to one approved after that is canceled at PayPal before it bills, and the person is pointed at a recharge.
  const key = planKeyFromPaypalPlan(sub.plan_id, await paypalProvisioned().catch(() => null));
  if (key && RETIRED_PLANS.has(key)) {
    try { await cancelSubscription(sub.id); } catch (e) { console.warn('[billing] could not cancel a subscription to a retired plan', sub.id, String((e as Error)?.message || e)); }
    return fail(410, 'Ricorsa no longer sells subscriptions. Nothing was charged; recharge your gas instead.', 'plans_retired');
  }
  const result = await applySubscription(sub, user.id);
  if (!result) return fail(400, 'Subscription plan not recognized.');
  return json({ ok: true, plan: result.plan, planName: PLANS[result.plan]?.name || result.plan, cycle: result.cycle, status: result.status });
});
