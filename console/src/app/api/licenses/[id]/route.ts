import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { LicensePatch } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { syncCustomerGrant } from '@/lib/grants';
import { licenseView } from '@/lib/views';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/licenses/:id — edit, or act: suspend, revoke, reactivate, renew (extends the end date by `months`). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.licenses).where(eq(schema.licenses.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such licence', 'not_found');
  const b = parse(LicensePatch, await readJson(req));
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (b.plan) set.plan = b.plan; if (b.seats) set.seats = b.seats; if (b.autoRenew !== undefined) set.autoRenew = b.autoRenew; if (b.notes !== undefined) set.notes = b.notes;
  if (b.startsAt !== undefined) set.startsAt = new Date(b.startsAt); if (b.endsAt !== undefined) set.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  let what = 'Updated';
  if (b.action === 'suspend') { set.status = 'suspended'; what = 'Suspended'; }
  if (b.action === 'revoke') { set.status = 'revoked'; what = 'Revoked'; }
  if (b.action === 'reactivate') { set.status = 'active'; what = 'Reactivated'; if (row.endsAt && row.endsAt.getTime() < Date.now() && b.endsAt === undefined) set.endsAt = null; }
  if (b.action === 'renew') { const base = row.endsAt && row.endsAt.getTime() > Date.now() ? new Date(row.endsAt) : new Date(); base.setMonth(base.getMonth() + (b.months || 12)); set.endsAt = base; set.status = 'active'; what = `Renewed until ${base.toDateString()}`; }
  await d.update(schema.licenses).set(set).where(eq(schema.licenses.id, id));
  await logActivity(me, 'license.' + (b.action || 'update'), 'license', id, `${what} the ${(b.plan || row.plan)} licence of ${await customerName(row.customerId)}`, { customerId: row.customerId });
  const sync = b.apply === false ? { applied: null, note: null } : await syncCustomerGrant(row.customerId, me);
  const after = (await d.select().from(schema.licenses).where(eq(schema.licenses.id, id)))[0];
  return json({ license: licenseView(after), sync });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.licenses).where(eq(schema.licenses.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such licence', 'not_found');
  await d.delete(schema.licenses).where(eq(schema.licenses.id, id));
  await logActivity(me, 'license.delete', 'license', id, `Deleted a licence of ${await customerName(row.customerId)}`, { customerId: row.customerId });
  const sync = await syncCustomerGrant(row.customerId, me);
  return json({ ok: true, sync });
});
