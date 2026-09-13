import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { availableModels, resolveModel, modelFor, providerOf, anthropicConfigured, type Tier } from '@/lib/llm';

export const dynamic = 'force-dynamic';

const TIERS: Tier[] = ['quick', 'default', 'complex', 'build', 'ideas'];

/** GET /api/admin/models — admins only: what the provider accounts can use and what each tier resolves to. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const ids = await availableModels(true);
  const tiers: Record<string, { configured: string; resolved: string; provider: string }> = {};
  for (const t of TIERS) { const resolved = await resolveModel(t); tiers[t] = { configured: modelFor(t), resolved, provider: providerOf(resolved) }; }
  return json({ base: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1', available: ids, anthropic: anthropicConfigured(), tiers, search: !!process.env.BRAVE_API_KEY, browserRun: !!process.env.BROWSER_RUN });
});
