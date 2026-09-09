import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { cancelSubscription } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

/** Delete the account and everything in it. Cancels an active PayPal subscription first. */
export const POST = handle(async () => {
  const user = await currentUser();
  if (user.paypalSubscriptionId && user.subscriptionStatus === 'ACTIVE') {
    try { await cancelSubscription(user.paypalSubscriptionId, 'Account deleted'); } catch (e) { console.warn('cancel on delete failed', e); }
  }
  await db().delete(schema.users).where(eq(schema.users.id, user.id)); // cascades to threads, spaces, graph, usage, subscriptions
  return json({ ok: true, next: '/auth/logout' });
});
