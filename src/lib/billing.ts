import { eq, inArray, and } from 'drizzle-orm';
import { db, schema } from './db';
import { planFromPaypalPlan, normalizePlanKey, type BillingCycle, type PlanKey } from './plans';
import { paypalProvisioned } from './paypal-setup';
import { getSubscription, cancelSubscription, type PaypalSubscription } from './paypal';
import { applyGrant } from './grants';

/** Statuses that grant paid access. APPROVAL_PENDING is allowed briefly while PayPal finishes the first charge. */
const GRANTING = new Set(['ACTIVE', 'APPROVAL_PENDING']);
/** Statuses under which PayPal may still bill a subscription, so a replaced one in these states is canceled. */
const BILLABLE = new Set(['ACTIVE', 'APPROVAL_PENDING', 'APPROVED', 'SUSPENDED']);

export type Decision = {
  /** Whether this event changes the plan on the row at all. */
  apply: boolean;
  plan: PlanKey; billingCycle: BillingCycle | null;
  /** The account's previous subscription to cancel at PayPal, when this one replaces it. */
  retire: string | null;
};

/**
 * What a PayPal subscription event means for the account, as a pure decision so it can be checked on its own.
 * A granting subscription takes the row (and retires a different subscription the row still points at); a
 * non-granting event about a subscription the row has moved on from (canceled, expired, suspended) is ignored,
 * so the plan a newer subscription pays for is never taken away by the old one winding down.
 */
export function decideSubscription(user: { plan: string | null; paypalSubscriptionId: string | null; subscriptionStatus: string | null; billingCycle?: string | null }, sub: { id: string; status: string }, planKey: PlanKey, cycle: BillingCycle): Decision {
  const grants = GRANTING.has(sub.status);
  const other = !!user.paypalSubscriptionId && user.paypalSubscriptionId !== sub.id;
  if (other && GRANTING.has(user.subscriptionStatus || '') && !grants) {
    return { apply: false, plan: normalizePlanKey(user.plan), billingCycle: (user.billingCycle as BillingCycle) || null, retire: null };
  }
  return { apply: true, plan: grants ? planKey : 'free', billingCycle: grants ? cycle : null, retire: grants && other ? user.paypalSubscriptionId : null };
}

/**
 * Apply a PayPal subscription object to our records. Idempotent; safe to call from webhooks and from activation.
 * A granting subscription that replaces a different one on the same account (a new plan, a switch from monthly to
 * annual) cancels the old one at PayPal, so nobody is billed twice.
 */
export async function applySubscription(sub: PaypalSubscription, userIdHint?: string): Promise<{ userId: string; plan: PlanKey; cycle: BillingCycle; status: string } | null> {
  const provisioned = await paypalProvisioned();
  const found = planFromPaypalPlan(sub.plan_id, provisioned);
  const userId = sub.custom_id || userIdHint;
  if (!found || !userId) { console.warn('subscription without known plan or user', sub.id, sub.plan_id, sub.custom_id); return null; }
  const { key: planKey, cycle } = found;
  const d = db();
  const status = sub.status;
  const nextBillingAt = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
  await d.insert(schema.subscriptions).values({
    id: sub.id, userId, planKey, paypalPlanId: sub.plan_id, billingCycle: cycle, status, startedAt: sub.start_time ? new Date(sub.start_time) : null, nextBillingAt,
    cancelledAt: status === 'CANCELLED' ? new Date() : null, raw: sub as unknown as Record<string, unknown>, updatedAt: new Date(),
  }).onConflictDoUpdate({ target: schema.subscriptions.id, set: { status, nextBillingAt, cancelledAt: status === 'CANCELLED' ? new Date() : null, raw: sub as unknown as Record<string, unknown>, updatedAt: new Date(), planKey, paypalPlanId: sub.plan_id, billingCycle: cycle } });

  const user = (await d.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  if (!user) return null;
  const decision = decideSubscription(user, sub, planKey, cycle);
  if (!decision.apply) return { userId, plan: decision.plan, cycle: decision.billingCycle || 'monthly', status: user.subscriptionStatus || status };
  const { plan, billingCycle } = decision;
  await d.update(schema.users).set({ plan, paypalSubscriptionId: sub.id, subscriptionStatus: status, planRenewsAt: nextBillingAt, billingCycle }).where(eq(schema.users.id, userId));
  if (decision.retire) await retireReplaced(decision.retire, sub.id);
  // A plan granted by email outranks whatever PayPal just said (a canceled subscription must not take a license away).
  const granted = await applyGrant({ ...user, plan, subscriptionStatus: status, planRenewsAt: nextBillingAt, paypalSubscriptionId: sub.id, billingCycle });
  if (granted) return { userId, plan: granted.plan as PlanKey, cycle, status: granted.subscriptionStatus || status };
  return { userId, plan, cycle, status };
}

/** Cancel at PayPal the subscription a newer one has replaced, when it could still bill, and record that. */
async function retireReplaced(previousId: string, replacedBy: string) {
  const d = db();
  const prev = (await d.select({ status: schema.subscriptions.status }).from(schema.subscriptions).where(eq(schema.subscriptions.id, previousId)).limit(1))[0];
  if (prev && !BILLABLE.has(prev.status)) return;
  try {
    await cancelSubscription(previousId, 'Replaced by a new Ricorsa subscription');
    console.log('[billing] replaced subscription canceled', previousId, '->', replacedBy);
  } catch (e) {
    // Already canceled or expired at PayPal reads as done; anything else is logged and PayPal's webhook will tell us later.
    console.warn('[billing] could not cancel the replaced subscription', previousId, String((e as Error)?.message || e));
  }
  await d.update(schema.subscriptions).set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.subscriptions.id, previousId), inArray(schema.subscriptions.status, [...BILLABLE])));
}

/** Re-check with PayPal (used after approval and as a safety net if a webhook was missed). */
export async function syncSubscription(subscriptionId: string, userIdHint?: string) {
  const sub = await getSubscription(subscriptionId);
  return applySubscription(sub, userIdHint);
}

/**
 * Whether an account still has its free trial: one per account, on whichever plan and cycle it starts with. Anyone
 * who has held a PayPal subscription before, on any plan, subscribes to a plan that bills from the first day.
 */
export async function trialEligible(user: { id: string; paypalSubscriptionId?: string | null }): Promise<boolean> {
  if (user.paypalSubscriptionId) return false;
  const had = await db().select({ id: schema.subscriptions.id }).from(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id)).limit(1);
  return had.length === 0;
}

/** The subscription a user's row points at, for the Account page (start date, cycle, next billing). */
export async function currentSubscription(user: { paypalSubscriptionId?: string | null }) {
  if (!user.paypalSubscriptionId) return null;
  return (await db().select().from(schema.subscriptions).where(eq(schema.subscriptions.id, user.paypalSubscriptionId)).limit(1))[0] || null;
}
