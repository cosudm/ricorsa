import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ emoji: z.string().max(8).optional(), name: z.string().trim().min(1).max(60).optional(), description: z.string().max(140).optional(), instructions: z.string().max(4000).optional() });
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const rows = await db().update(schema.spaces).set(b.data).where(and(eq(schema.spaces.id, id), eq(schema.spaces.userId, user.id))).returning();
  if (!rows[0]) return fail(404, 'Space not found');
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  await db().update(schema.threads).set({ spaceId: null }).where(and(eq(schema.threads.spaceId, id), eq(schema.threads.userId, user.id)));
  await db().delete(schema.spaces).where(and(eq(schema.spaces.id, id), eq(schema.spaces.userId, user.id)));
  return json({ ok: true });
});
