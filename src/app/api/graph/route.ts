import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { emptyGraph, loadGraph, saveGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await currentUser();
  return json({ graph: await loadGraph(user.id) });
});

/** Reset: erase everything learned, keep the pause setting. */
export const DELETE = handle(async () => {
  const user = await currentUser();
  const g = await loadGraph(user.id); const fresh = emptyGraph(); fresh.paused = g.paused;
  await saveGraph(user.id, fresh);
  return json({ graph: fresh });
});
