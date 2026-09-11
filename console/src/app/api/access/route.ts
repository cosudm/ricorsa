import { eq } from 'drizzle-orm';
import { identity, isOwnerEmail } from '@/lib/session';
import { handle, json, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

/** GET /api/access — where a signed-in person without access stands (none, requested, invited, disabled). */
export const GET = handle(async () => {
  const who = await identity();
  const row = (await db().select().from(schema.staff).where(eq(schema.staff.email, who.email)).limit(1))[0];
  return json({ email: who.email, name: who.name, status: row ? row.status : (isOwnerEmail(who.email) ? 'owner' : 'none') });
});

/** POST /api/access — ask an owner for access; the request shows up under Staff for approval. */
export const POST = handle(async () => {
  const who = await identity();
  const d = db();
  const row = (await d.select().from(schema.staff).where(eq(schema.staff.email, who.email)).limit(1))[0];
  if (row) return json({ status: row.status });
  await d.insert(schema.staff).values({ id: uid(), email: who.email, name: who.name, picture: who.picture, role: 'viewer', status: 'requested', auth0Sub: who.sub, invitedAt: new Date() }).onConflictDoNothing();
  await logActivity(null, 'staff.request', 'staff', null, `${who.email} asked for access`);
  return json({ status: 'requested' });
});
