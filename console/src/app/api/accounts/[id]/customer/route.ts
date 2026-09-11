import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { accountDetail } from '@/lib/ricorsa';
import { getCustomer } from '@/lib/customers';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/accounts/:id/customer — create (or return) the customer record for a Ricorsa account. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const userId = decodeURIComponent(id);
  const acc = await accountDetail(userId);
  if (!acc) return fail(404, 'No such Ricorsa account', 'not_found');
  const d = db();
  const existing = (await d.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.ricorsaUserId, userId)).limit(1))[0];
  if (existing) return json({ customer: await getCustomer(existing.id), created: false });
  const cid = uid();
  const paying = acc.plan !== 'free' && ['ACTIVE', 'APPROVAL_PENDING'].includes(acc.subscriptionStatus || '');
  await d.insert(schema.customers).values({ id: cid, kind: 'person', name: acc.name || acc.email || 'Ricorsa user', email: acc.email, status: paying ? 'active' : acc.subscriptionStatus === 'TRIAL' ? 'trial' : 'lead', plan: acc.plan, mrrCents: paying ? (acc.plan === 'team' ? 4900 : 2000) : 0, source: 'ricorsa', ownerId: me.id, ricorsaUserId: userId });
  await logActivity(me, 'customer.create', 'customer', cid, `Added ${acc.email || userId} from the Ricorsa sign-ups`, { customerId: cid });
  return json({ customer: await getCustomer(cid), created: true }, { status: 201 });
});
