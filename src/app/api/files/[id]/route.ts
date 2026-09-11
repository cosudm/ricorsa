import { and, eq, isNull } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { metaOf } from '@/lib/files';
import { deleteFiles } from '@/lib/storage';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/files/:id — the attachment's details; `?text=1` adds the text Ricorsa read from it (the viewer's fallback). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const row = (await db().select().from(schema.attachments).where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, user.id))).limit(1))[0];
  if (!row) return fail(404, 'That file is not in your account', 'not_found');
  const withText = new URL(req.url).searchParams.get('text') === '1';
  return json({ file: { ...metaOf(row), via: row.via, threadId: row.threadId, createdAt: row.createdAt.getTime() }, ...(withText ? { text: row.text } : {}) });
});

/** DELETE /api/files/:id — drop an upload that has not been used in a question yet. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const r = await db().delete(schema.attachments).where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, user.id), isNull(schema.attachments.threadId))).returning({ id: schema.attachments.id, r2Key: schema.attachments.r2Key });
  if (!r.length) return fail(404, 'That file is not pending', 'not_found');
  await deleteFiles(r.map(x => x.r2Key));
  return json({ ok: true });
});
