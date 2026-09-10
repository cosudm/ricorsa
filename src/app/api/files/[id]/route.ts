import { and, eq, isNull } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** DELETE /api/files/:id — drop an upload that has not been used in a question yet. */
export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const r = await db().delete(schema.attachments).where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, user.id), isNull(schema.attachments.threadId))).returning({ id: schema.attachments.id });
  if (!r.length) return fail(404, 'That file is not pending', 'not_found');
  return json({ ok: true });
});
