import { json } from '@/lib/http';
import { mockMode } from '@/lib/llm';
import { loadProviders, probeProvider } from '@/lib/providers';
import { refreshModelHealth, MODEL_CATALOG } from '@/lib/models';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/models — whether the model accounts and the named models are answering, for an uptime monitor
 * (Cloudflare Health Checks, UptimeRobot, Better Stack, a cron) and for the admin banner in the app. 200 when every
 * provider with a key answers and every named model that has a key behind it is served (at home or through the
 * OpenRouter backstop), 503 otherwise, so a monitor can alert the operator before a customer notices. A monitor that
 * calls this every ten minutes also keeps the health loop running when nobody is using the app. No details, no
 * secrets: those are on /api/admin/models for admins. Each probe is one one-token message; the provider answers are
 * cached five minutes per worker instance and the model record ten minutes across instances.
 */
type State = 'ok' | 'refused' | 'unset';
type ModelState = 'ok' | 'down' | 'unset';
type Health = { ok: boolean; providers: Record<string, State>; models: Record<string, ModelState>; anthropic: State; kimi: State; checkedAt: number };
let cached: Omit<Health, 'models' | 'ok'> | null = null;
const TTL_MS = 5 * 60_000;

export async function GET() {
  if (mockMode()) return json({ ok: true, providers: {}, models: {}, anthropic: 'unset', kimi: 'ok', checkedAt: Date.now() } satisfies Health, { headers: { 'Cache-Control': 'no-store' } });
  if (!cached || Date.now() - cached.checkedAt > TTL_MS) {
    const list = await loadProviders(true);
    const providers: Record<string, State> = {};
    await Promise.all(list.filter(p => p.key).map(async p => { providers[p.id] = (await probeProvider(p).catch(() => ({ ok: false }))).ok ? 'ok' : 'refused'; }));
    cached = { providers, anthropic: providers.anthropic || 'unset', kimi: providers.moonshot || 'unset', checkedAt: Date.now() };
  }
  const health = await refreshModelHealth();
  const models: Record<string, ModelState> = {};
  // ok: answered its last probe; down: a key exists (or OpenRouter lists it) and it is not answering; unset: nobody serves it.
  for (const e of MODEL_CATALOG) { const h = health.entries[e.id]; models[e.id] = h?.ok ? 'ok' : h?.downSince ? 'down' : 'unset'; }
  const configured = Object.values(cached.providers);
  const ok = configured.length > 0 && configured.every(s => s === 'ok') && Object.values(models).every(s => s !== 'down');
  return json({ ok, ...cached, models }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
