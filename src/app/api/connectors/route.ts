import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { planFor } from '@/lib/plans';
import { CATALOG, checkConnector, listConnectors, presetFor, serverNameFor, toClient, validateUrl } from '@/lib/connectors';
import { sealJson } from '@/lib/secretbox';

export const dynamic = 'force-dynamic';

/** GET /api/connectors — the person's connectors (credentials masked), the catalog, and what the plan allows. */
export const GET = handle(async () => {
  const user = await currentUser();
  const plan = planFor(user.plan);
  const rows = await listConnectors(user.id);
  const items = await Promise.all(rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(toClient));
  return json({ items, catalog: CATALOG, limit: user.admin ? 100 : plan.caps.connectors, callback: `${process.env.APP_BASE_URL || ''}/api/connectors/oauth/callback` });
});

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().min(1).max(500),
  preset: z.string().max(40).optional().nullable(),
  authType: z.enum(['none', 'bearer', 'oauth']).default('none'),
  token: z.string().max(4000).optional().nullable(),
});

/** POST /api/connectors — add one. Bearer and open connectors are checked right away; OAuth ones wait for sign-in. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const plan = planFor(user.plan);
  const limit = user.admin ? 100 : plan.caps.connectors;
  const existing = await listConnectors(user.id);
  if (limit <= 0) return fail(402, 'Connectors are part of the Pro and Team plans.', 'upgrade_required');
  if (existing.length >= limit) return fail(402, `The ${plan.name} plan allows ${limit} connector${limit === 1 ? '' : 's'}. Upgrade for more.`, 'upgrade_required');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Check the name and URL');
  const preset = presetFor(b.data.preset) ; const url = validateUrl(b.data.url);
  const authType = b.data.authType;
  if (authType === 'bearer' && !String(b.data.token || '').trim()) return fail(400, 'This connector needs a token');
  const secret = authType === 'bearer' ? await sealJson({ token: String(b.data.token).trim() }) : null;
  const serverName = serverNameFor(b.data.name, existing.map(c => c.serverName));
  const rows = await db().insert(schema.connectors).values({ id: uid(), userId: user.id, name: b.data.name, serverName, preset: preset && preset.key !== 'custom' ? preset.key : null, url, authType, secret, status: authType === 'oauth' ? 'needs_auth' : 'new' }).returning();
  let row = rows[0];
  if (authType !== 'oauth') row = await checkConnector(row);
  return json({ connector: await toClient(row) });
});
