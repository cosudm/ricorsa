import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { availableModels, resolveModel, modelFor, providerOf, anthropicStatus, probeAnthropic, type Tier } from '@/lib/llm';
import { browserRunAvailable } from '@/lib/build-run';

export const dynamic = 'force-dynamic';

const TIERS: Tier[] = ['quick', 'default', 'complex', 'build', 'ideas'];

/**
 * GET /api/admin/models — admins only: what the provider accounts can use and what each tier resolves to.
 * Anthropic is probed with one tiny message so the exact answer (key rejected, no credit, unknown model) is
 * visible here; an accepted probe also lifts a set-aside, so `tiers` below reflects the state after the probe.
 * Add ?probe=0 to skip the probe.
 */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const url = new URL(req.url);
  const ids = await availableModels(true);
  const probe = url.searchParams.get('probe') === '0' ? null : await probeAnthropic();
  const anthropic = { ...anthropicStatus(), probe };
  const tiers: Record<string, { configured: string; resolved: string; provider: string }> = {};
  for (const t of TIERS) { const resolved = await resolveModel(t); tiers[t] = { configured: modelFor(t), resolved, provider: providerOf(resolved) }; }
  return json({ base: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1', available: ids, anthropic, tiers, search: !!process.env.BRAVE_API_KEY, browserRun: browserRunAvailable() });
});
