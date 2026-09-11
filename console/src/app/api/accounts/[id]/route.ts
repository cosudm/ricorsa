import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { accountDetail } from '@/lib/ricorsa';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await currentStaff();
  const { id } = await ctx.params;
  const account = await accountDetail(decodeURIComponent(id));
  if (!account) return fail(404, 'No such Ricorsa account', 'not_found');
  const customer = (await db().select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.ricorsaUserId, account.id)).limit(1))[0] || null;
  return json({ account, customer });
});
