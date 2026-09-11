import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse, zText, zMs } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { commView } from '@/lib/views';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/communications/:id — edit a logged item (sent emails keep their text). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.communications).where(eq(schema.communications.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such item', 'not_found');
  if (row.status === 'sent') return fail(409, 'A sent email cannot be edited', 'sent');
  const b = parse(z.object({ subject: zText(300).optional(), body: zText(50000).optional(), kind: z.enum(['email', 'call', 'meeting', 'note', 'sms']).optional(), direction: z.enum(['in', 'out']).optional(), at: zMs.optional() }), await readJson(req));
  const set: Record<string, unknown> = {}; for (const [k, v] of Object.entries(b)) if (v !== undefined) set[k] = k === 'at' ? new Date(v as number) : v;
  if (Object.keys(set).length) await d.update(schema.communications).set(set).where(eq(schema.communications.id, id));
  await logActivity(me, 'communication.update', 'communication', id, 'Edited a logged item', { customerId: row.customerId });
  const after = (await d.select().from(schema.communications).where(eq(schema.communications.id, id)))[0];
  return json({ communication: commView(after) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.communications).where(eq(schema.communications.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such item', 'not_found');
  await d.delete(schema.communications).where(eq(schema.communications.id, id));
  await logActivity(me, 'communication.delete', 'communication', id, 'Deleted a logged item', { customerId: row.customerId });
  return json({ ok: true });
});
