import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { cancelCurrentSubscription } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/cancel — cancel the account's subscription with whoever bills it (a card through Finix or
 * PayPal), then re-sync. Access continues until the billing side reports the change, which is usually at once.
 */
export const POST = handle(async () => {
  const user = await currentUser();
  if (!user.paypalSubscriptionId) return fail(400, 'No subscription to cancel');
  const result = await cancelCurrentSubscription(user);
  return json({ ok: true, plan: result?.plan || 'free', status: result?.status || 'CANCELLED' });
});
