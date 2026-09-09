import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function owned(userId: string, id: string) {
  return (await db().select().from(schema.builds).where(and(eq(schema.builds.id, id), eq(schema.builds.userId, userId))).limit(1))[0];
}

/** GET /api/builds/:id — one build with its HTML. Add ?raw=1 to get the document itself (for a full-screen tab). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const b = await owned(user.id, id);
  if (!b) return fail(404, 'Build not found', 'not_found');
  if (new URL(req.url).searchParams.get('raw') === '1') {
    return new Response(b.html || '<!doctype html><p>This build has no app yet.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'", 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'private, no-store' } });
  }
  return json({ build: { ...b, createdAt: new Date(b.createdAt).getTime(), updatedAt: new Date(b.updatedAt).getTime() } });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const b = await owned(user.id, id);
  if (!b) return fail(404, 'Build not found', 'not_found');
  await db().delete(schema.builds).where(eq(schema.builds.id, id));
  return json({ ok: true });
});
