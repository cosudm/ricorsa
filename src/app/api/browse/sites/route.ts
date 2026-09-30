import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { rememberedSites } from '@/lib/browse-live';

export const dynamic = 'force-dynamic';

/** GET /api/browse/sites — the sites this account keeps sign-ins for through Ricorsa's browser. */
export const GET = handle(async () => {
  const user = await currentUser();
  return json({ sites: await rememberedSites(user.id) });
});
