import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { startTakeOver, takeOverAct, takeOverFrame, endTakeOver, type LiveAction } from '@/lib/browse-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ turnId: string }> };

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('start') }),
  z.object({ op: z.literal('frame') }),
  z.object({ op: z.literal('end'), how: z.enum(['handback', 'close']), remember: z.array(z.string().max(253)).max(10).optional() }),
  z.object({ op: z.literal('act'), action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('click'), x: z.number().min(0).max(1), y: z.number().min(0).max(1), double: z.boolean().optional() }),
    z.object({ type: z.literal('type'), text: z.string().max(2000) }),
    z.object({ type: z.literal('key'), key: z.string().max(20), times: z.number().int().min(1).max(20).optional() }),
    z.object({ type: z.literal('scroll'), x: z.number().min(0).max(1), y: z.number().min(0).max(1), dy: z.number().min(-1200).max(1200) }),
    z.object({ type: z.literal('nav'), url: z.string().max(2000) }),
    z.object({ type: z.literal('back') }), z.object({ type: z.literal('forward') }), z.object({ type: z.literal('reload') }), z.object({ type: z.literal('select_all') }),
  ]) }),
]);

/**
 * POST /api/browse/take/:turnId — the person's turn at the page Ricorsa left open after that answer.
 *   start: take the page (a first picture comes back)   frame: a fresh picture   act: one move   end: hand back or close
 * Every call reaches the browser by its session, acts, takes the picture and lets go. Typed text is never logged.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { turnId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(turnId)) return fail(404, 'No such page', 'not_found');
  const b = Body.safeParse(await readJson(req).catch(() => ({})));
  if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  const body = b.data;
  if (body.op === 'start') return json(await startTakeOver(user, turnId));
  if (body.op === 'frame') return json(await takeOverFrame(user, turnId));
  if (body.op === 'act') return json(await takeOverAct(user, turnId, body.action as LiveAction));
  return json(await endTakeOver(user, turnId, body.how, body.remember || []));
});
