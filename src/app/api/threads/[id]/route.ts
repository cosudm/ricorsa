import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, truncate } from '@/lib/http';
import { getThreadOwned, toClient } from '@/lib/threads';
import { db, schema } from '@/lib/db';
import { deleteThreadAttachments } from '@/lib/files';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  return json({ thread: toClient(await getThreadOwned(user.id, id)) });
});

const Patch = z.object({ title: z.string().trim().min(1).max(200).optional(), spaceId: z.string().nullable().optional() });
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const t = await getThreadOwned(user.id, id);
  const b = Patch.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (b.data.title !== undefined) set.title = truncate(b.data.title, 120);
  if (b.data.spaceId !== undefined) set.spaceId = b.data.spaceId;
  await db().update(schema.threads).set(set).where(eq(schema.threads.id, t.id));
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const t = await getThreadOwned(user.id, id);
  await db().delete(schema.threads).where(eq(schema.threads.id, t.id));
  // Any file attached to this thread goes with it: its text and the stored copy.
  await deleteThreadAttachments(t.id);
  return json({ ok: true });
});
