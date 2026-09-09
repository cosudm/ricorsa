import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { cancelSubscription } from '@/lib/paypal';
import { syncSubscription } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** Cancel at PayPal, then re-sync. Access continues until PayPal reports the change (usually immediately). */
export const POST = handle(async () => {
  const user = await currentUser();
  if (!user.paypalSubscriptionId) return fail(400, 'No subscription to cancel');
  await cancelSubscription(user.paypalSubscriptionId);
  const result = await syncSubscription(user.paypalSubscriptionId, user.id);
  return json({ ok: true, plan: result?.plan || 'free', status: result?.status || 'CANCELLED' });
});
