import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { planKeyFromPaypalPlan, type PlanKey } from './plans';
import { paypalProvisioned } from './paypal-setup';
import { getSubscription, type PaypalSubscription } from './paypal';

/** Statuses that grant paid access. APPROVAL_PENDING is allowed briefly while PayPal finishes the first charge. */
const GRANTING = new Set(['ACTIVE', 'APPROVAL_PENDING']);

/** Apply a PayPal subscription object to our records. Idempotent; safe to call from webhooks and from activation. */
export async function applySubscription(sub: PaypalSubscription, userIdHint?: string): Promise<{ userId: string; plan: PlanKey; status: string } | null> {
  const provisioned = await paypalProvisioned();
  const planKey = planKeyFromPaypalPlan(sub.plan_id, provisioned?.plans);
  const userId = sub.custom_id || userIdHint;
  if (!planKey || !userId) { console.warn('subscription without known plan or user', sub.id, sub.plan_id, sub.custom_id); return null; }
  const d = db();
  const status = sub.status;
  const nextBillingAt = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
  await d.insert(schema.subscriptions).values({
    id: sub.id, userId, planKey, paypalPlanId: sub.plan_id, status, startedAt: sub.start_time ? new Date(sub.start_time) : null, nextBillingAt,
    cancelledAt: status === 'CANCELLED' ? new Date() : null, raw: sub as unknown as Record<string, unknown>, updatedAt: new Date(),
  }).onConflictDoUpdate({ target: schema.subscriptions.id, set: { status, nextBillingAt, cancelledAt: status === 'CANCELLED' ? new Date() : null, raw: sub as unknown as Record<string, unknown>, updatedAt: new Date(), planKey, paypalPlanId: sub.plan_id } });

  const user = (await d.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  if (!user) return null;
  // Only let this subscription drive the user's plan if it is theirs and current
  if (user.paypalSubscriptionId && user.paypalSubscriptionId !== sub.id && user.subscriptionStatus === 'ACTIVE' && !GRANTING.has(status)) {
    return { userId, plan: user.plan as PlanKey, status: user.subscriptionStatus };
  }
  const plan: PlanKey = GRANTING.has(status) ? planKey : 'free';
  await d.update(schema.users).set({ plan, paypalSubscriptionId: sub.id, subscriptionStatus: status, planRenewsAt: nextBillingAt }).where(eq(schema.users.id, userId));
  return { userId, plan, status };
}

/** Re-check with PayPal (used after approval and as a safety net if a webhook was missed). */
export async function syncSubscription(subscriptionId: string, userIdHint?: string) {
  const sub = await getSubscription(subscriptionId);
  return applySubscription(sub, userIdHint);
}
