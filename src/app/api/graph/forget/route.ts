import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { forgetNode, loadGraph, saveGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';
const Body = z.object({ nodeId: z.string().min(1).max(200) });
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const g = await loadGraph(user.id); forgetNode(g, b.data.nodeId); await saveGraph(user.id, g);
  return json({ graph: g });
});
