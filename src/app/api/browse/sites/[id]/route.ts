import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { forgetSite } from '@/lib/browse-live';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/browse/sites/:id — sign out of a site: the kept sign-in is deleted. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const ok = await forgetSite(user.id, id);
  return ok ? json({ ok: true }) : fail(404, 'That site is not on your list', 'not_found');
});
