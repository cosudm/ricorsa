import { eq } from 'drizzle-orm';
import { auth0, auth0Configured, devFakeUserEnabled } from './auth0';
import { db, schema } from './db';
import { HttpError } from './http';

export type CurrentUser = typeof schema.users.$inferSelect;

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
    // keep the row fresh without an extra write per request storm: only if older than an hour
    if (Date.now() - new Date(existing[0].lastSeenAt).getTime() > 3600e3) {
      await d.update(schema.users).set({ lastSeenAt: new Date(), email, name, picture }).where(eq(schema.users.id, sub));
    }
    return existing[0];
  }
  const inserted = await d.insert(schema.users).values({ id: sub, email, name, picture }).onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0];
  const again = await d.select().from(schema.users).where(eq(schema.users.id, sub)).limit(1);
  return again[0];
}
