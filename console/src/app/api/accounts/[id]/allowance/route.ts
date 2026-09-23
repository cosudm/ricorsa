import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { parse } from '@/lib/validate';
import { AllowanceInput } from '@/lib/inputs';
import { setAllowance, accountDetail } from '@/lib/ricorsa';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/accounts/:id/allowance — raise (or clear) the monthly allowances of a Ricorsa account above its plan:
 * app versions, Discover idea sets, questions and Research reports. The product enforces the new ceilings at once;
 * the usage beyond the plan's own allowance is what a true-up invoice bills an annual account for.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const userId = decodeURIComponent(id);
  const b = parse(AllowanceInput, await readJson(req));
  const allowance = await setAllowance(userId, b, me.email);
  const acc = await accountDetail(userId);
  const what = allowance ? Object.entries(allowance).filter(([k]) => !['note', 'setBy', 'setAt'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', ') : 'the plan\'s own numbers';
  await logActivity(me, 'ricorsa.allowance', 'ricorsa', userId, `Set the allowances of ${acc?.email || userId} to ${what}${b.note ? ` (${b.note})` : ''}`, { data: (allowance || {}) as Record<string, unknown> });
  return json({ account: acc });
});
