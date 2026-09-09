import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { loadGraph, saveGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';
const Body = z.object({ paused: z.boolean() });
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const g = await loadGraph(user.id); g.paused = b.data.paused; await saveGraph(user.id, g);
  return json({ graph: g });
});
