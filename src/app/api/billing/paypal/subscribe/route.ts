import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { getSubscription } from '@/lib/paypal';
import { applySubscription } from '@/lib/billing';

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
  const result = await applySubscription(sub, user.id);
  if (!result) return fail(400, 'Subscription plan not recognised. Check PAYPAL_PLAN_* env vars.');
  return json({ ok: true, plan: result.plan, status: result.status });
});
