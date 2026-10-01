import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { parse } from '@/lib/validate';
import { AllowanceInput } from '@/lib/inputs';
import { setAllowance, accountDetail } from '@/lib/ricorsa';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/accounts/:id/allowance — raise (or clear) the monthly gas of a Ricorsa account above its plan (an
 * Enterprise contract's figure, a goodwill raise). The product's gauge shows the new number at once; the gas spent
 * beyond the plan's own allowance is what a true-up invoice bills an annual account for.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const userId = decodeURIComponent(id);
  const b = parse(AllowanceInput, await readJson(req));
  const allowance = await setAllowance(userId, b, me.email);
  const acc = await accountDetail(userId);
  const what = allowance && typeof allowance.gasPerMonth === 'number' ? `${allowance.gasPerMonth.toLocaleString('en-US')} gas a month` : 'the plan\'s own gas';
  await logActivity(me, 'ricorsa.allowance', 'ricorsa', userId, `Set the gas allowance of ${acc?.email || userId} to ${what}${b.note ? ` (${b.note})` : ''}`, { data: (allowance || {}) as Record<string, unknown> });
  return json({ account: acc });
});
