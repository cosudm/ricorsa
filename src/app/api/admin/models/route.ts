import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { availableModels, resolveModel, modelFor } from '@/lib/llm';

export const dynamic = 'force-dynamic';

/** GET /api/admin/models — admins only: what the provider account can use and what each tier resolves to. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const ids = await availableModels(true);
  const tiers = { quick: { configured: modelFor('quick'), resolved: await resolveModel('quick') }, default: { configured: modelFor('default'), resolved: await resolveModel('default') }, complex: { configured: modelFor('complex'), resolved: await resolveModel('complex') }, build: { configured: modelFor('build'), resolved: await resolveModel('build') } };
  return json({ base: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1', available: ids, tiers, search: !!process.env.BRAVE_API_KEY });
});
