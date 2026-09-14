import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { resolveModel, modelFor, providerOf, anthropicStatus, probeAnthropic, type Tier } from '@/lib/llm';
import { loadProviders, listProviderModels, probeProvider, providerForClient, providerUsable, modelSettings, saveModelSettings, type ModelSettings, type TierChoice } from '@/lib/providers';
import { browserRunAvailable } from '@/lib/build-run';

export const dynamic = 'force-dynamic';

const TIERS: Tier[] = ['quick', 'default', 'complex', 'build', 'ideas'];

/**
 * GET /api/admin/models — admins only: every provider Ricorsa knows (with a key from the environment or the
 * account, or none), the models each one lists, the admin's choice per tier and what each tier resolves to
 * right now. Model lists are fetched for every provider with a key (cached ten minutes). Add ?probe=1 to also
 * send one tiny message to each configured provider, so the exact answer (accepted, key rejected, no credit) is
 * on record; an accepted probe lifts a set-aside, so `tiers` reflects the state after the probes.
 */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const url = new URL(req.url);
  const probeAll = url.searchParams.get('probe') === '1';
  const list = await loadProviders(true);
  const probes: Record<string, unknown> = {};
  for (const p of list) {
    if (!p.key) continue;
    if (probeAll) probes[p.id] = await probeProvider(p);
    else await listProviderModels(p);
  }
  const settings = await modelSettings(true);
  const tiers: Record<string, { configured: string; resolved: string; provider: string; chosen: TierChoice | null }> = {};
  for (const t of TIERS) { const resolved = await resolveModel(t); tiers[t] = { configured: modelFor(t), resolved, provider: providerOf(resolved, t), chosen: settings[t] || null }; }
  // The Anthropic block stays for the health banner and older screens; the probe is the one made above when asked for.
  const anthropic = { ...anthropicStatus(), probe: probeAll ? probes.anthropic || null : url.searchParams.get('probe') === 'anthropic' ? await probeAnthropic() : null };
  const providers = list.map(providerForClient).sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  return json({ providers, probes, tiers, settings, anthropic, available: list.find(p => p.id === 'moonshot')?.models || [], search: !!process.env.BRAVE_API_KEY, browserRun: browserRunAvailable() });
});

const Choice = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/), model: z.string().trim().min(1).max(160) }).nullable();
const Put = z.object({ tiers: z.object({ quick: Choice.optional(), default: Choice.optional(), complex: Choice.optional(), build: Choice.optional(), ideas: Choice.optional() }) });

/**
 * PUT /api/admin/models { tiers: { quick: { provider, model } | null, … } } — choose the active model per tier.
 * A choice must name a provider with a key and a model that provider lists (a provider without a list is
 * trusted); null clears the choice so the environment's MODEL_* variable or the default applies again.
 */
export const PUT = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const b = Put.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const list = await loadProviders(true);
  const next: ModelSettings = { ...(await modelSettings(true)) };
  for (const t of TIERS) {
    const c = b.data.tiers[t];
    if (c === undefined) continue;
    if (c === null) { delete next[t]; continue; }
    const p = list.find(x => x.id === c.provider);
    if (!p || !p.key) return fail(400, `${c.provider} has no API key yet`);
    const ids = p.models.length ? p.models : await listProviderModels(p);
    if (ids.length && !ids.includes(c.model)) return fail(400, `${p.name} does not list ${c.model} for this account`);
    if (!providerUsable(p)) console.warn('[models] tier', t, 'set to a provider that is set aside right now', p.id);
    next[t] = { provider: p.id, model: c.model };
  }
  await saveModelSettings(next);
  const tiers: Record<string, { configured: string; resolved: string; provider: string; chosen: TierChoice | null }> = {};
  for (const t of TIERS) { const resolved = await resolveModel(t); tiers[t] = { configured: modelFor(t), resolved, provider: providerOf(resolved, t), chosen: next[t] || null }; }
  return json({ settings: next, tiers });
});
