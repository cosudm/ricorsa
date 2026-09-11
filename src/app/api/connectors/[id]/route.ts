import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { checkConnector, getConnectorOwned, toClient, validateUrl } from '@/lib/connectors';
import { openJson, sealJson } from '@/lib/secretbox';
import { isVaultConnector, vaultClient } from '@/lib/vault';
import type { ConnectorSecret } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  url: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean().optional(),
  allowedTools: z.array(z.string().max(120)).max(200).nullable().optional(),
  token: z.string().max(4000).optional(),   // rotate a bearer token
});

/** PATCH /api/connectors/[id] — rename, turn on or off, limit tools, change the URL, or rotate the token. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const patch: Partial<typeof c> = { updatedAt: new Date() };
  if (b.data.name !== undefined) patch.name = b.data.name;
  if (b.data.enabled !== undefined) patch.enabled = b.data.enabled;
  if (b.data.allowedTools !== undefined) patch.allowedTools = b.data.allowedTools && b.data.allowedTools.length ? b.data.allowedTools : null;
  let recheck = false;
  if (b.data.url !== undefined) { patch.url = validateUrl(b.data.url); recheck = true; }
  if (b.data.token !== undefined && c.authType === 'bearer') { patch.secret = await sealJson({ token: b.data.token.trim() }); recheck = true; }
  const rows = await db().update(schema.connectors).set(patch).where(and(eq(schema.connectors.id, id), eq(schema.connectors.userId, user.id))).returning();
  let row = rows[0];
  if (recheck && row.authType !== 'oauth') row = await checkConnector(row);
  return json({ connector: await toClient(row) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  // A Vault connection is revoked on the Vault side too, so the token dies with the connector (best effort).
  if (isVaultConnector(c)) { try { const s = await openJson<ConnectorSecret>(c.secret); if (s?.vaultConnectionId) await vaultClient('/connect/revoke', { connectionId: s.vaultConnectionId }); } catch (e) { console.warn('[vault] revoke failed', String((e as Error)?.message || e)); } }
  await db().delete(schema.connectors).where(and(eq(schema.connectors.id, id), eq(schema.connectors.userId, user.id)));
  return json({ ok: true });
});
