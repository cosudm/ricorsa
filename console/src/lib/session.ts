import { eq } from 'drizzle-orm';
import { auth0, auth0Configured, devFakeUserEnabled } from './auth0';
import { db, schema } from './db';
import { HttpError, uid } from './http';
import type { StaffRole } from './db/schema';

export type Staff = typeof schema.staff.$inferSelect;
const RANK: Record<StaffRole, number> = { viewer: 1, manager: 2, owner: 3 };

/** Emails that are owners of the console by configuration (CONSOLE_OWNERS, comma separated). */
export function ownerEmails(): string[] {
  return String(process.env.CONSOLE_OWNERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}
export function isOwnerEmail(email: string | null | undefined): boolean { return !!email && ownerEmails().includes(email.toLowerCase()); }

/** The signed-in person as the Auth0 session describes them (or the fixed local person in development). */
export async function identity(): Promise<{ sub: string; email: string; name: string | null; picture: string | null }> {
  if (devFakeUserEnabled()) return { sub: 'dev|console', email: process.env.DEV_FAKE_EMAIL || 'support@smeprotech.com', name: 'Dev Owner', picture: null };
  if (!auth0Configured()) throw new HttpError(503, 'Sign-in is not configured yet', 'auth_unconfigured');
  const session = await auth0().getSession();
  if (!session?.user?.sub) throw new HttpError(401, 'Sign in to continue', 'unauthenticated');
  const email = String(session.user.email || '').toLowerCase();
  if (!email) throw new HttpError(403, 'Your sign-in did not include an email address', 'no_email');
  return { sub: session.user.sub, email, name: session.user.name ?? null, picture: session.user.picture ?? null };
}

/**
 * Resolve the signed-in staff member, creating the row for a configured owner on first sign-in and activating an
 * invitation on first sign-in. Throws 401 when signed out and 403 when the person has no access (the client then
 * shows the request-access screen). `min` enforces a minimum role.
 */
export async function currentStaff(min: StaffRole = 'viewer'): Promise<Staff> {
  const who = await identity();
  const d = db();
  let row = (await d.select().from(schema.staff).where(eq(schema.staff.email, who.email)).limit(1))[0];
  if (!row) {
    if (!isOwnerEmail(who.email)) throw new HttpError(403, 'This account has no access to the console yet', 'no_access');
    const inserted = await d.insert(schema.staff).values({ id: uid(), email: who.email, name: who.name, picture: who.picture, role: 'owner', status: 'active', auth0Sub: who.sub, acceptedAt: new Date(), lastSeenAt: new Date() }).onConflictDoNothing().returning();
    row = inserted[0] || (await d.select().from(schema.staff).where(eq(schema.staff.email, who.email)).limit(1))[0];
  }
  if (row.status === 'disabled') throw new HttpError(403, 'This account has been disabled', 'disabled');
  if (row.status === 'requested') throw new HttpError(403, 'Your access request is waiting for an owner to approve it', 'pending');
  const patch: Partial<Staff> = {};
  if (row.status === 'invited') { patch.status = 'active'; patch.acceptedAt = new Date(); }
  if (isOwnerEmail(who.email) && row.role !== 'owner') patch.role = 'owner';
  if (!row.auth0Sub || row.auth0Sub !== who.sub) patch.auth0Sub = who.sub;
  if (!row.name && who.name) patch.name = who.name;
  if (who.picture && row.picture !== who.picture) patch.picture = who.picture;
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 3600e3) patch.lastSeenAt = new Date();
  if (Object.keys(patch).length) { await d.update(schema.staff).set(patch).where(eq(schema.staff.id, row.id)); row = { ...row, ...patch }; }
  if (RANK[row.role] < RANK[min]) throw new HttpError(403, `This needs the ${min} role`, 'forbidden');
  return row;
}

export function can(staff: Staff, min: StaffRole): boolean { return RANK[staff.role] >= RANK[min]; }
