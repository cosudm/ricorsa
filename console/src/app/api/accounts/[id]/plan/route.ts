import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { parse } from '@/lib/validate';
import { PlanGrant } from '@/lib/inputs';
import { grantPlan, accountDetail } from '@/lib/ricorsa';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/accounts/:id/plan — set the plan on a Ricorsa account directly (a licence or trial by hand, or back to Free). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const userId = decodeURIComponent(id);
  const b = parse(PlanGrant, await readJson(req));
  const r = await grantPlan(userId, b.plan, b.plan === 'free' ? 'clear' : (b.kind === 'trial' ? 'trial' : 'license'), b.until ? new Date(b.until) : null);
  const acc = await accountDetail(userId);
  await logActivity(me, 'ricorsa.grant', 'ricorsa', userId, `Set ${acc?.email || userId} to ${b.plan}${b.plan !== 'free' ? ` (${b.kind === 'trial' ? 'trial' : 'licence'}${b.until ? ' until ' + new Date(b.until).toDateString() : ''})` : ''}`, { data: r as unknown as Record<string, unknown> });
  return json({ account: acc });
});
