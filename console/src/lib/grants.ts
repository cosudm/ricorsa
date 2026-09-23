import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import { grantPlan } from './ricorsa';
import { normalizePlanKey, planName } from './plans';
import type { Staff } from './session';
import { logActivity } from './activity';

/**
 * Keep the product in step with what the console decided. After any license or trial change, the customer's
 * linked Ricorsa account gets the strongest live grant: an active license wins over an active trial, and
 * nothing live returns the account to Free (unless a PayPal subscription is running, which is left alone).
 * Also sets the customer's status from the same facts, so the grid stays truthful.
 */
export async function syncCustomerGrant(customerId: string, actor: Staff | null): Promise<{ applied: string | null; note: string | null }> {
  const d = db();
  const c = (await d.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1))[0];
  if (!c) return { applied: null, note: 'customer missing' };
  const now = Date.now();
  const lic = (await d.select().from(schema.licenses).where(and(eq(schema.licenses.customerId, customerId), eq(schema.licenses.status, 'active'))).orderBy(desc(schema.licenses.endsAt)))
    .find(l => !l.endsAt || l.endsAt.getTime() > now);
  const tr = (await d.select().from(schema.trials).where(and(eq(schema.trials.customerId, customerId), eq(schema.trials.status, 'active'))).orderBy(desc(schema.trials.endsAt)))
    .find(t => t.endsAt.getTime() > now);
  const status = lic ? 'active' : tr ? 'trial' : (c.status === 'active' || c.status === 'trial') ? 'lead' : c.status;
  const plan = lic ? normalizePlanKey(lic.plan) : tr ? normalizePlanKey(tr.plan) : (status === 'lead' ? 'free' : c.plan);
  // A license names how it bills; the customer record follows it (a trial or nothing leaves the record's own value alone).
  const billingCycle = lic ? (lic.billingCycle || c.billingCycle) : c.billingCycle;
  await d.update(schema.customers).set({ status, plan, billingCycle, updatedAt: new Date() }).where(eq(schema.customers.id, customerId));
  if (!c.ricorsaUserId) return { applied: null, note: 'No Ricorsa account is linked, so the plan was recorded here only.' };
  try {
    const r = lic ? await grantPlan(c.ricorsaUserId, normalizePlanKey(lic.plan), 'license', lic.endsAt)
      : tr ? await grantPlan(c.ricorsaUserId, normalizePlanKey(tr.plan), 'trial', tr.endsAt)
      : await grantPlan(c.ricorsaUserId, 'free', 'clear', null);
    const what = lic ? `${planName(lic.plan)} by license${lic.endsAt ? ' until ' + lic.endsAt.toDateString() : ''}` : tr ? `${planName(tr.plan)} trial until ${tr.endsAt.toDateString()}` : 'Free';
    await logActivity(actor, 'ricorsa.grant', 'ricorsa', c.ricorsaUserId, `Set the Ricorsa account of ${c.name} to ${what}`, { customerId, data: r as unknown as Record<string, unknown> });
    return { applied: what, note: null };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await logActivity(actor, 'ricorsa.grant_failed', 'ricorsa', c.ricorsaUserId, `Could not change the Ricorsa account of ${c.name}: ${msg}`, { customerId });
    return { applied: null, note: msg };
  }
}
