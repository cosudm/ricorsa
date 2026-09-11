import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { getCustomer, touchCustomer } from '@/lib/customers';
import { parse, zEmail, zOptText } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { findAccountByEmail } from '@/lib/ricorsa';
import { rdb, ricorsa } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/customers/:id/link — tie the customer to a Ricorsa account by id or by email. DELETE unlinks. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const c = await getCustomer(id); if (!c) return fail(404, 'No such customer', 'not_found');
  const b = parse(z.object({ ricorsaUserId: zOptText(200), email: zEmail.optional() }), await readJson(req));
  let userId = b.ricorsaUserId || null;
  if (!userId && b.email) { const acc = await findAccountByEmail(b.email); if (!acc) return fail(404, `No Ricorsa account uses ${b.email}`, 'not_found'); userId = acc.id; }
  if (!userId) return fail(400, 'Give an account id or an email', 'invalid_request');
  const acc = (await rdb().select({ id: ricorsa.rUsers.id, email: ricorsa.rUsers.email }).from(ricorsa.rUsers).where(eq(ricorsa.rUsers.id, userId)).limit(1))[0];
  if (!acc) return fail(404, 'That Ricorsa account does not exist', 'not_found');
  await touchCustomer(id, { ricorsaUserId: acc.id });
  await logActivity(me, 'customer.link', 'customer', id, `Linked ${c.name} to the Ricorsa account ${acc.email || acc.id}`, { customerId: id });
  return json({ customer: await getCustomer(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const c = await getCustomer(id); if (!c) return fail(404, 'No such customer', 'not_found');
  await touchCustomer(id, { ricorsaUserId: null });
  await logActivity(me, 'customer.unlink', 'customer', id, `Unlinked ${c.name} from its Ricorsa account`, { customerId: id });
  return json({ customer: await getCustomer(id) });
});
