import { currentUser } from '@/lib/session';
import { handle, fail } from '@/lib/http';
import { getFile } from '@/lib/storage';
import { shotKey } from '@/lib/browse';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ turnId: string; n: string }> };

/**
 * GET /api/browse/shot/:turnId/:n — the screenshot Ricorsa's browser took after step n of that turn, for the person
 * who asked the question only. The key carries their user id, so nobody else's turn id resolves to anything.
 */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { turnId, n } = await ctx.params;
  const step = Math.floor(Number(n));
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(turnId) || !Number.isFinite(step) || step < 1 || step > 999) return fail(404, 'No such screenshot', 'not_found');
  const obj = await getFile(shotKey(user.id, turnId, step));
  if (!obj) return fail(404, 'No such screenshot', 'not_found');
  return new Response(obj.body as unknown as ReadableStream, { status: 200, headers: {
    'Content-Type': 'image/jpeg',
    'Content-Length': String(obj.size),
    'Cache-Control': 'private, max-age=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
    'ETag': obj.httpEtag,
  } });
});
