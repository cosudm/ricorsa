import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { PROVIDER_CATALOG, loadProviders, probeProvider, saveProviderAccount, removeProviderAccount, providerForClient, forgetProviders, mcpAddress, type ProviderKind } from '@/lib/providers';

export const dynamic = 'force-dynamic';

const idRe = /^[a-z][a-z0-9_-]{1,39}$/;
function validBase(raw: string): string {
  let u: URL; try { u = new URL(raw.trim()); } catch { throw new Error('Enter the full base URL of the API, for example https://api.example.com/v1'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error('The base URL must use https');
  if (u.username || u.password || u.search || u.hash) throw new Error('Use the plain base URL, without credentials or query');
  if (mcpAddress(u.pathname)) throw new Error('That address is an MCP server. Add it under Connectors as a custom MCP server; Model accounts take OpenAI-compatible model APIs, usually ending in /v1');
  return u.toString().replace(/\/+$/, '');
}

const Put = z.object({
  id: z.string().regex(idRe),
  apiKey: z.string().trim().min(8).max(4000).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  name: z.string().trim().min(1).max(60).optional(),
  kind: z.enum(['anthropic', 'openai']).optional(),
  probeModel: z.string().trim().max(120).optional(),
});

/**
 * PUT /api/admin/providers { id, apiKey?, baseUrl?, name?, kind? } — admins only. Adds or replaces the account
 * key for a provider (sealed in the database; it outranks the environment), or adds a custom OpenAI-compatible
 * endpoint by base URL. The provider is probed right away: its model list is fetched and one one-token message
 * is sent, so the exact answer (accepted, key rejected, no credit) is on record and the models can be chosen.
 */
export const PUT = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const b = Put.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Check the provider id and the key');
  const { id } = b.data;
  const known = PROVIDER_CATALOG.find(d => d.id === id);
  let baseUrl: string | undefined;
  if (b.data.baseUrl !== undefined && b.data.baseUrl !== '') { try { baseUrl = validBase(b.data.baseUrl); } catch (e) { return fail(400, (e as Error).message); } }
  if (!known) {
    const existing = (await loadProviders(true)).find(p => p.id === id);
    if (!existing && !baseUrl) return fail(400, 'A custom provider needs its base URL');
    if (!existing && !b.data.name) return fail(400, 'Give the provider a name');
  }
  if (!b.data.apiKey && !baseUrl && b.data.name === undefined) return fail(400, 'Nothing to save');
  await saveProviderAccount(id, { apiKey: b.data.apiKey, baseUrl: b.data.baseUrl === '' ? null : baseUrl, name: known ? undefined : b.data.name, kind: known ? undefined : (b.data.kind as ProviderKind | undefined) || 'openai', probeModel: b.data.probeModel });
  const p = (await loadProviders(true)).find(x => x.id === id);
  if (!p) return fail(500, 'The provider could not be saved');
  const probe = await probeProvider(p, b.data.probeModel || undefined);
  await saveProviderAccount(id, { status: probe.ok ? 'ok' : 'refused', error: probe.ok ? null : probe.message, models: p.models });
  const fresh = (await loadProviders(true)).find(x => x.id === id) || p;
  return json({ provider: providerForClient(fresh), probe });
});

/** POST /api/admin/providers { id, model? } — probe one provider again (lists its models, sends one tiny message). An accepted probe lifts a set-aside. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const b = z.object({ id: z.string().regex(idRe), model: z.string().trim().max(120).optional() }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Invalid request');
  const p = (await loadProviders(true)).find(x => x.id === b.data.id);
  if (!p) return fail(404, 'Unknown provider');
  if (!p.key) return json({ provider: providerForClient(p), probe: { ok: false, status: 0, message: 'No API key for this provider', model: '', models: 0, ms: 0 } });
  const probe = await probeProvider(p, b.data.model || undefined);
  // The outcome is kept on the account row when there is one; an environment key's outcome is remembered in memory.
  if (p.source === 'account') await saveProviderAccount(p.id, { status: probe.ok ? 'ok' : 'refused', error: probe.ok ? null : probe.message, models: p.models });
  const fresh = (await loadProviders(true)).find(x => x.id === p.id) || p;
  return json({ provider: providerForClient(fresh), probe });
});

/** DELETE /api/admin/providers?id=… — remove the account key (and a custom provider entirely). A key in the environment stays. */
export const DELETE = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!idRe.test(id)) return fail(400, 'Invalid provider id');
  await removeProviderAccount(id); forgetProviders();
  const p = (await loadProviders(true)).find(x => x.id === id);
  return json({ ok: true, provider: p ? providerForClient(p) : null });
});
