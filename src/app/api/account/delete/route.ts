import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { cancelSubscription } from '@/lib/paypal';
import { storageKeysFor } from '@/lib/files';
import { deleteFiles } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Delete the account and everything in it. Cancels an active PayPal subscription first. */
export const POST = handle(async () => {
  const user = await currentUser();
  if (user.paypalSubscriptionId && user.subscriptionStatus === 'ACTIVE') {
    try { await cancelSubscription(user.paypalSubscriptionId, 'Account deleted'); } catch (e) { console.warn('cancel on delete failed', e); }
  }
  const files = await storageKeysFor(user.id);
  await db().delete(schema.users).where(eq(schema.users.id, user.id)); // cascades to threads, spaces, graph, usage, subscriptions, attachments
  await deleteFiles(files); // the uploaded files themselves
  return json({ ok: true, next: '/auth/logout' });
});
