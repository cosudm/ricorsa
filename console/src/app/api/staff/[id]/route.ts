import { eq, and, count } from 'drizzle-orm';
import { currentStaff, isOwnerEmail } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { StaffPatch } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const ms = (x: Date | null | undefined) => (x ? x.getTime() : null);
const view = (s: typeof schema.staff.$inferSelect) => ({ id: s.id, email: s.email, name: s.name, picture: s.picture, role: s.role, status: s.status, invitedBy: s.invitedBy, invitedAt: ms(s.invitedAt), acceptedAt: ms(s.acceptedAt), lastSeenAt: ms(s.lastSeenAt), createdAt: s.createdAt.getTime() });

/** PATCH /api/staff/:id — change a role, approve a request (status active), disable or re-enable. Configured owners cannot be demoted or disabled. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.staff).where(eq(schema.staff.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such person', 'not_found');
  const b = parse(StaffPatch, await readJson(req));
  if (isOwnerEmail(row.email) && ((b.role && b.role !== 'owner') || b.status === 'disabled')) return fail(409, `${row.email} is an owner by configuration and cannot be demoted or disabled here`, 'configured_owner');
  if (row.id === me.id && (b.status === 'disabled' || (b.role && b.role !== 'owner'))) return fail(409, 'You cannot demote or disable yourself', 'self');
  if (b.role && b.role !== 'owner' && row.role === 'owner') {
    const owners = (await d.select({ n: count() }).from(schema.staff).where(and(eq(schema.staff.role, 'owner'), eq(schema.staff.status, 'active'))))[0]?.n || 0;
    if (owners <= 1) return fail(409, 'Keep at least one active owner', 'last_owner');
  }
  const set: Record<string, unknown> = {};
  if (b.role) set.role = b.role; if (b.name !== undefined) set.name = b.name;
  if (b.status) { set.status = b.status; if (b.status === 'active' && row.status === 'requested') { set.acceptedAt = new Date(); set.invitedBy = me.id; } }
  if (Object.keys(set).length) await d.update(schema.staff).set(set).where(eq(schema.staff.id, id));
  await logActivity(me, 'staff.update', 'staff', id, `${b.status === 'active' && row.status === 'requested' ? 'Approved' : 'Updated'} ${row.email}${b.role ? ' as ' + b.role : ''}${b.status && b.status !== 'active' ? ' (' + b.status + ')' : ''}`);
  return json({ staff: view((await d.select().from(schema.staff).where(eq(schema.staff.id, id)))[0]) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.staff).where(eq(schema.staff.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such person', 'not_found');
  if (row.id === me.id) return fail(409, 'You cannot remove yourself', 'self');
  if (isOwnerEmail(row.email)) return fail(409, `${row.email} is an owner by configuration`, 'configured_owner');
  await d.delete(schema.staff).where(eq(schema.staff.id, id));
  await logActivity(me, 'staff.remove', 'staff', id, `Removed ${row.email}`);
  return json({ ok: true });
});
