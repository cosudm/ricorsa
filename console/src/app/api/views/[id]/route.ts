import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff();
  const { id } = await ctx.params;
  const row = (await db().select().from(schema.views).where(eq(schema.views.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such view', 'not_found');
  if (row.staffId !== me.id && me.role !== 'owner') return fail(403, 'Only its owner can delete this view', 'forbidden');
  await db().delete(schema.views).where(eq(schema.views.id, id));
  return json({ ok: true });
});
