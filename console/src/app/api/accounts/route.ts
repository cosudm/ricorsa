import { currentStaff } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { listAccounts } from '@/lib/ricorsa';

export const dynamic = 'force-dynamic';

/** GET /api/accounts — Ricorsa sign-ups, newest first, with this month's usage and whether a customer record exists. */
export const GET = handle(async (req: Request) => {
  await currentStaff();
  const u = new URL(req.url).searchParams;
  const since = u.get('since') ? Number(u.get('since')) : undefined;
  const r = await listAccounts({ q: u.get('q') || undefined, plan: u.get('plan') || undefined, limit: Number(u.get('limit') || 500), offset: Number(u.get('offset') || 0), since });
  return json({ accounts: r.rows, total: r.total });
});
