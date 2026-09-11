import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { TrialPatch } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { syncCustomerGrant } from '@/lib/grants';
import { newLicenseKey } from '@/lib/licenses';
import { trialView } from '@/lib/views';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/trials/:id — extend by `days`, convert (issues an open-ended licence on the trial's plan), cancel, or mark expired. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.trials).where(eq(schema.trials.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such trial', 'not_found');
  const b = parse(TrialPatch, await readJson(req));
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (b.notes !== undefined) set.notes = b.notes; if (b.plan) set.plan = b.plan;
  let what = 'Updated';
  if (b.action === 'extend') { const base = row.endsAt.getTime() > Date.now() ? new Date(row.endsAt) : new Date(); base.setDate(base.getDate() + (b.days || 7)); set.endsAt = base; set.status = 'active'; what = `Extended until ${base.toDateString()}`; }
  if (b.action === 'cancel') { set.status = 'cancelled'; what = 'Cancelled'; }
  if (b.action === 'expire') { set.status = 'expired'; what = 'Marked as expired'; }
  let license = null;
  if (b.action === 'convert') {
    set.status = 'converted'; set.convertedAt = new Date(); what = 'Converted to a paid plan';
    const lid = uid(); const plan = b.plan || row.plan;
    await d.insert(schema.licenses).values({ id: lid, customerId: row.customerId, key: newLicenseKey(), plan, seats: 1, status: 'active', autoRenew: true, notes: `Converted from trial ${id}`, createdBy: me.id });
    license = (await d.select().from(schema.licenses).where(eq(schema.licenses.id, lid)))[0];
    await logActivity(me, 'license.create', 'license', lid, `Issued a ${plan} licence to ${await customerName(row.customerId)} (trial converted)`, { customerId: row.customerId });
  }
  await d.update(schema.trials).set(set).where(eq(schema.trials.id, id));
  await logActivity(me, 'trial.' + (b.action || 'update'), 'trial', id, `${what}: the ${row.plan} trial of ${await customerName(row.customerId)}`, { customerId: row.customerId });
  const sync = b.apply === false ? { applied: null, note: null } : await syncCustomerGrant(row.customerId, me);
  const after = (await d.select().from(schema.trials).where(eq(schema.trials.id, id)))[0];
  return json({ trial: trialView(after), license, sync });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.trials).where(eq(schema.trials.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such trial', 'not_found');
  await d.delete(schema.trials).where(eq(schema.trials.id, id));
  await logActivity(me, 'trial.delete', 'trial', id, `Deleted a trial of ${await customerName(row.customerId)}`, { customerId: row.customerId });
  return json({ ok: true, sync: await syncCustomerGrant(row.customerId, me) });
});
