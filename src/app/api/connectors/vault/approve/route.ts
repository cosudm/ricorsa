import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { planFor } from '@/lib/plans';
import { checkConnector, listConnectors, serverNameFor, toClient } from '@/lib/connectors';
import { sealJson } from '@/lib/secretbox';
import { VAULT_LABEL, VAULT_PRESET, vaultClient, vaultMcpUrl } from '@/lib/vault';

export const dynamic = 'force-dynamic';

/** POST /api/connectors/vault/approve { challengeId, workspaceIds } — the Vault issues a token for those workspaces; Ricorsa keeps it as a connector. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const plan = planFor(user.plan); const limit = user.admin ? 100 : plan.caps.connectors;
  const existing = await listConnectors(user.id);
  if (existing.length >= limit) return fail(402, `The ${plan.name} plan allows ${limit} connector${limit === 1 ? '' : 's'}. Upgrade for more.`, 'upgrade_required');
  const b = z.object({ challengeId: z.string().max(60), workspaceIds: z.array(z.string().max(60)).min(1).max(50), name: z.string().trim().max(60).optional() }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Choose at least one workspace');
  const r = await vaultClient<{ token: string; connectionId: string; email: string; workspaces: Array<{ id: string; name: string; tenant: string }> }>('/connect/approve', { challengeId: b.data.challengeId, workspaceIds: b.data.workspaceIds, label: `Ricorsa (${user.email})` });
  const name = b.data.name || (r.workspaces.length === 1 ? `Vault: ${r.workspaces[0].name}` : VAULT_LABEL);
  const secret = await sealJson({ token: r.token, vaultConnectionId: r.connectionId, vaultWorkspaces: r.workspaces, vaultEmail: r.email });
  const rows = await db().insert(schema.connectors).values({ id: uid(), userId: user.id, name: name.slice(0, 60), serverName: serverNameFor('vault', existing.map(c => c.serverName)), preset: VAULT_PRESET, url: vaultMcpUrl(), authType: 'bearer', secret, status: 'new' }).returning();
  const row = await checkConnector(rows[0]);
  return json({ connector: await toClient(row), workspaces: r.workspaces, email: r.email });
});
