import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { parse } from '@/lib/validate';
import { TrueupInput } from '@/lib/inputs';
import { trueupCandidates } from '@/lib/ricorsa';
import { draftTrueup } from '@/lib/trueups';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** GET /api/trueups?period=YYYY-MM — annual accounts whose usage went past the plan's monthly allowance, with the unit prices that would bill it. */
export const GET = handle(async (req: Request) => {
  await currentStaff();
  const u = new URL(req.url).searchParams;
  const period = /^\d{4}-\d{2}$/.test(u.get('period') || '') ? u.get('period')! : new Date().toISOString().slice(0, 7);
  const [candidates, prices] = await Promise.all([trueupCandidates(period), getSetting('trueup')]);
  return json({ period, candidates, prices });
});

/** POST /api/trueups — draft the true-up invoice for one account and period. Sending is a separate, deliberate step. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(TrueupInput, await readJson(req));
  const r = await draftTrueup(b.userId, b.period || new Date().toISOString().slice(0, 7), me);
  return json(r, { status: 201 });
});
