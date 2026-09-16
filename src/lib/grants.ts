/**
 * Plans granted by email (Settings, admins: "Grant a plan by email"). A grant stands on its own: it lands on
 * the person's row at sign-in, it comes back after a PayPal event that would otherwise drop them to Free, and
 * it outranks a paid plan on the same account (an admin who grants Professional to someone paying for Essentials means it).
 * It stops counting once its end date has passed or an admin removes it.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { normalizePlanKey } from './plans';

type UserRow = typeof schema.users.$inferSelect;

/** The live grant for an address, or null. */
export async function grantFor(email: string | null | undefined) {
  const key = (email || '').trim().toLowerCase();
  if (!key) return null;
  const g = (await db().select().from(schema.grants).where(eq(schema.grants.email, key)).limit(1))[0];
  if (!g || (g.endsAt && new Date(g.endsAt).getTime() < Date.now())) return null;
  return g;
}

/**
 * Put the grant for this person's address on their row when the row does not already carry it. Returns the
 * updated row, or null when there was nothing to apply. A grant already applied to a different account (the
 * same address on two rows) is left alone.
 */
export async function applyGrant(row: UserRow): Promise<UserRow | null> {
  const g = await grantFor(row.email);
  if (!g) return null;
  if (g.appliedTo && g.appliedTo !== row.id) return null;
  const wantRenews = g.endsAt ? new Date(g.endsAt).getTime() : null;
  const haveRenews = row.planRenewsAt ? new Date(row.planRenewsAt).getTime() : null;
  if (normalizePlanKey(row.plan) === normalizePlanKey(g.plan) && row.subscriptionStatus === g.status && wantRenews === haveRenews) return null;
  const d = db();
  const patch = { plan: normalizePlanKey(g.plan), subscriptionStatus: g.status, planRenewsAt: g.endsAt ? new Date(g.endsAt) : null };
  await d.update(schema.users).set(patch).where(eq(schema.users.id, row.id));
  if (!g.appliedTo) await d.update(schema.grants).set({ appliedTo: row.id, appliedAt: new Date() }).where(eq(schema.grants.email, g.email));
  console.log('[grant] applied', JSON.stringify({ email: g.email, plan: g.plan, status: g.status, user: row.id }));
  return { ...row, ...patch };
}
