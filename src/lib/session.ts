import { eq } from 'drizzle-orm';
import { auth0, auth0Configured, devFakeUserEnabled } from './auth0';
import { db, schema } from './db';
import { HttpError } from './http';
import { grantExpired } from './plans';

export type CurrentUser = typeof schema.users.$inferSelect & { admin?: boolean; effectivePlan?: string };

/** Emails with full access (ADMIN_EMAILS, comma separated): every capability, no quotas, and a "demo as" switch for showing the plans. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Admins act as Team (or as the plan they chose to demo); everyone else is what PayPal says they are. */
function withAccess(u: typeof schema.users.$inferSelect): CurrentUser {
  if (!isAdminEmail(u.email)) return u;
  const demo = (u.settings as { demoPlan?: string } | null)?.demoPlan;
  const plan = demo && ['free', 'pro', 'team'].includes(demo) ? demo : 'team';
  return { ...u, admin: true, effectivePlan: plan, plan, subscriptionStatus: null };
}

/**
 * Resolve the signed-in person and make sure they have a row. Throws 401 when signed out.
 * With DEV_FAKE_USER=1 (development only) a fixed local user is used so the app runs without Auth0.
 */
export async function currentUser(): Promise<CurrentUser> {
  let sub: string, email: string | null = null, name: string | null = null, picture: string | null = null;
  if (devFakeUserEnabled()) {
    sub = 'dev|local'; email = 'dev@example.com'; name = 'Dev User';
  } else {
    if (!auth0Configured()) throw new HttpError(503, 'Sign-in is not configured yet', 'auth_unconfigured');
    const session = await auth0().getSession();
    if (!session?.user?.sub) throw new HttpError(401, 'Sign in to continue', 'unauthenticated');
    sub = session.user.sub; email = session.user.email ?? null; name = session.user.name ?? null; picture = session.user.picture ?? null;
  }
  const d = db();
  const existing = await d.select().from(schema.users).where(eq(schema.users.id, sub)).limit(1);
  if (existing[0]) {
    let row = existing[0];
    // A trial or licence granted by the Manager Console ends on its date: the account goes back to Free.
    if (grantExpired(row.subscriptionStatus, row.planRenewsAt)) {
      const ended = row.subscriptionStatus === 'TRIAL' ? 'TRIAL_ENDED' : 'LICENSE_ENDED';
      await d.update(schema.users).set({ plan: 'free', subscriptionStatus: ended, planRenewsAt: null }).where(eq(schema.users.id, sub));
      row = { ...row, plan: 'free', subscriptionStatus: ended, planRenewsAt: null };
    }
    // keep the row fresh without an extra write per request storm: only if older than an hour
    if (Date.now() - new Date(row.lastSeenAt).getTime() > 3600e3) {
      await d.update(schema.users).set({ lastSeenAt: new Date(), email, name, picture }).where(eq(schema.users.id, sub));
    }
    return withAccess(row);
  }
  const inserted = await d.insert(schema.users).values({ id: sub, email, name, picture }).onConflictDoNothing().returning();
  if (inserted[0]) return withAccess(inserted[0]);
  const again = await d.select().from(schema.users).where(eq(schema.users.id, sub)).limit(1);
  return withAccess(again[0]);
}
