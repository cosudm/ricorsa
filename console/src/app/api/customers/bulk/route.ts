import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { listCustomers } from '@/lib/customers';
import { parse, zCustomerStatus, zId, zOptText, zPlan, zTags } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const Bulk = z.object({ ids: z.array(zId).min(1).max(1000), set: z.object({ status: zCustomerStatus.optional(), plan: zPlan.optional(), ownerId: zOptText(60), source: zOptText(80), addTags: zTags.optional(), removeTags: zTags.optional() }) });

/** PATCH /api/customers/bulk — one change on many rows: status, plan, owner, source, tags added or removed. */
export const PATCH = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(Bulk, await readJson(req));
  const d = db();
  const rows = await d.select({ id: schema.customers.id, tags: schema.customers.tags }).from(schema.customers).where(inArray(schema.customers.id, b.ids));
  for (const r of rows) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (b.set.status) set.status = b.set.status;
    if (b.set.plan) set.plan = b.set.plan;
    if (b.set.ownerId !== undefined) set.ownerId = b.set.ownerId;
    if (b.set.source !== undefined) set.source = b.set.source;
    if (b.set.addTags || b.set.removeTags) { let tags = [...(r.tags || [])]; for (const t of b.set.addTags || []) if (!tags.includes(t)) tags.push(t); if (b.set.removeTags) tags = tags.filter(t => !b.set.removeTags!.includes(t)); set.tags = tags; }
    await d.update(schema.customers).set(set).where(inArray(schema.customers.id, [r.id]));
  }
  await logActivity(me, 'customer.bulk', 'customer', null, `Changed ${rows.length} customer${rows.length === 1 ? '' : 's'}`, { data: b.set as Record<string, unknown> });
  return json({ customers: await listCustomers(b.ids) });
});

export const DELETE = handle(async (req: Request) => {
  const me = await currentStaff('owner');
  const b = parse(z.object({ ids: z.array(zId).min(1).max(1000) }), await readJson(req));
  await db().delete(schema.customers).where(inArray(schema.customers.id, b.ids));
  await logActivity(me, 'customer.bulk_delete', 'customer', null, `Deleted ${b.ids.length} customer${b.ids.length === 1 ? '' : 's'}`);
  return json({ ok: true });
});
