import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { checkConnector, getConnectorOwned, toClient } from '@/lib/connectors';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/connectors/[id]/test — reach the server, list its tools, record the result. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const row = await checkConnector(await getConnectorOwned(user.id, id));
  return json({ connector: await toClient(row) });
});
