import { json } from '@/lib/http';
import { mockMode } from '@/lib/llm';
import { loadProviders, probeProvider } from '@/lib/providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/models — whether the model accounts are answering, for an uptime monitor (Cloudflare Health
 * Checks, UptimeRobot, Better Stack, a cron) and for the admin banner in the app. 200 when every provider with a
 * key answers, 503 when one refuses (no credit, rejected key, unknown model), so a monitor can alert the
 * operator before a customer notices. No details, no secrets: those are on /api/admin/models for admins.
 * Each probe costs one one-token message and the result is cached for five minutes per worker instance.
 */
type State = 'ok' | 'refused' | 'unset';
type Health = { ok: boolean; providers: Record<string, State>; anthropic: State; kimi: State; checkedAt: number };
let cached: Health | null = null;
const TTL_MS = 5 * 60_000;

export async function GET() {
  if (mockMode()) return json({ ok: true, providers: {}, anthropic: 'unset', kimi: 'ok', checkedAt: Date.now() } satisfies Health, { headers: { 'Cache-Control': 'no-store' } });
  if (!cached || Date.now() - cached.checkedAt > TTL_MS) {
    const list = await loadProviders(true);
    const providers: Record<string, State> = {};
    await Promise.all(list.filter(p => p.key).map(async p => { providers[p.id] = (await probeProvider(p).catch(() => ({ ok: false }))).ok ? 'ok' : 'refused'; }));
    const configured = Object.values(providers);
    cached = { ok: configured.length > 0 && configured.every(s => s === 'ok'), providers, anthropic: providers.anthropic || 'unset', kimi: providers.moonshot || 'unset', checkedAt: Date.now() };
  }
  return json(cached, { status: cached.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
