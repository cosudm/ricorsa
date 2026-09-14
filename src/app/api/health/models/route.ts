import { json } from '@/lib/http';
import { probeAnthropic, availableModels, anthropicConfigured, mockMode } from '@/lib/llm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/models — whether the model accounts are answering, for an uptime monitor (Cloudflare Health
 * Checks, UptimeRobot, Better Stack, a cron) and for the admin banner in the app. 200 when every configured
 * account answers, 503 when one refuses (no credit, rejected key, unknown model), so a monitor can alert the
 * operator before a customer notices. No details, no secrets: those are on /api/admin/models for admins.
 * The probe itself costs one one-token message and is cached for five minutes per worker instance.
 */
type Health = { ok: boolean; anthropic: 'ok' | 'refused' | 'unset'; kimi: 'ok' | 'refused'; checkedAt: number };
let cached: Health | null = null;
const TTL_MS = 5 * 60_000;

export async function GET() {
  if (mockMode()) return json({ ok: true, anthropic: 'unset', kimi: 'ok', checkedAt: Date.now() } satisfies Health, { headers: { 'Cache-Control': 'no-store' } });
  if (!cached || Date.now() - cached.checkedAt > TTL_MS) {
    const [probe, ids] = await Promise.all([
      anthropicConfigured() ? probeAnthropic().catch(() => ({ ok: false })) : Promise.resolve(null),
      availableModels(true).catch(() => [] as string[]),
    ]);
    const anthropic: Health['anthropic'] = probe === null ? 'unset' : probe.ok ? 'ok' : 'refused';
    const kimi: Health['kimi'] = ids.length ? 'ok' : 'refused';
    cached = { ok: anthropic !== 'refused' && kimi === 'ok', anthropic, kimi, checkedAt: Date.now() };
  }
  return json(cached, { status: cached.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
