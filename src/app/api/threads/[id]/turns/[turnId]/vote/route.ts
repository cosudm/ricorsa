import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { getThreadOwned, saveTurns } from '@/lib/threads';
import { loadGraph, saveGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; turnId: string }> };

const Body = z.object({ vote: z.enum(['up', 'down']).nullable() });
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id, turnId } = await ctx.params;
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const t = await getThreadOwned(user.id, id);
  const turns = [...t.turns]; const turn = turns.find(x => x.id === turnId); if (!turn) return fail(404, 'Turn not found');
  const prev = turn.vote || null; turn.vote = b.data.vote;
  await saveTurns(t, turns);
  const g = await loadGraph(user.id);
  if (prev === 'up') g.votes.up = Math.max(0, g.votes.up - 1); if (prev === 'down') g.votes.down = Math.max(0, g.votes.down - 1);
  if (turn.vote === 'up') g.votes.up++; if (turn.vote === 'down') g.votes.down++;
  await saveGraph(user.id, g);
  return json({ ok: true, vote: turn.vote });
});
