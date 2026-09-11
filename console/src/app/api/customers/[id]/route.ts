import { and, desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { getCustomer, touchCustomer, CustomerInput } from '@/lib/customers';
import { parse } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { accountDetail } from '@/lib/ricorsa';
import { effectiveStatus } from '@/lib/invoices';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/customers/:id — the record and everything attached to it, including the live Ricorsa account. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await currentStaff();
  const { id } = await ctx.params;
  const customer = await getCustomer(id);
  if (!customer) return fail(404, 'No such customer', 'not_found');
  const d = db();
  const [contacts, licenses, trials, invoices, communications, activity] = await Promise.all([
    d.select().from(schema.contacts).where(eq(schema.contacts.customerId, id)).orderBy(desc(schema.contacts.primary), desc(schema.contacts.createdAt)),
    d.select().from(schema.licenses).where(eq(schema.licenses.customerId, id)).orderBy(desc(schema.licenses.createdAt)),
    d.select().from(schema.trials).where(eq(schema.trials.customerId, id)).orderBy(desc(schema.trials.createdAt)),
    d.select().from(schema.invoices).where(eq(schema.invoices.customerId, id)).orderBy(desc(schema.invoices.createdAt)),
    d.select().from(schema.communications).where(eq(schema.communications.customerId, id)).orderBy(desc(schema.communications.at)).limit(200),
    d.select().from(schema.activity).where(and(eq(schema.activity.customerId, id))).orderBy(desc(schema.activity.at)).limit(100),
  ]);
  let account = null;
  if (customer.ricorsaUserId) { try { account = await accountDetail(customer.ricorsaUserId); } catch (e) { console.warn('[customer] account detail unavailable', String((e as Error)?.message || e)); } }
  const ms = (x: Date | null | undefined) => (x ? x.getTime() : null);
  return json({
    customer, account,
    contacts: contacts.map(c => ({ ...c, createdAt: c.createdAt.getTime() })),
    licenses: licenses.map(l => ({ ...l, startsAt: l.startsAt.getTime(), endsAt: ms(l.endsAt), createdAt: l.createdAt.getTime(), updatedAt: l.updatedAt.getTime() })),
    trials: trials.map(t => ({ ...t, startedAt: t.startedAt.getTime(), endsAt: t.endsAt.getTime(), convertedAt: ms(t.convertedAt), createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime() })),
    invoices: invoices.map(i => ({ ...i, status: effectiveStatus(i), issuedAt: ms(i.issuedAt), dueAt: ms(i.dueAt), paidAt: ms(i.paidAt), sentAt: ms(i.sentAt), createdAt: i.createdAt.getTime(), updatedAt: i.updatedAt.getTime() })),
    communications: communications.map(c => ({ ...c, at: c.at.getTime(), createdAt: c.createdAt.getTime() })),
    activity: activity.map(a => ({ ...a, at: a.at.getTime() })),
  });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const before = await getCustomer(id);
  if (!before) return fail(404, 'No such customer', 'not_found');
  const b = parse(CustomerInput.partial(), await readJson(req));
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) if (v !== undefined) set[k] = v;
  if (typeof set.currency === 'string') set.currency = (set.currency as string).toUpperCase();
  if (!Object.keys(set).length) return json({ customer: before });
  await touchCustomer(id, set);
  const changed = Object.keys(set).filter(k => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(set[k]));
  if (changed.length) await logActivity(me, 'customer.update', 'customer', id, `Updated ${changed.join(', ')} on ${before.name}`, { customerId: id, data: Object.fromEntries(changed.map(k => [k, set[k]])) });
  return json({ customer: await getCustomer(id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('owner');
  const { id } = await ctx.params;
  const before = await getCustomer(id);
  if (!before) return fail(404, 'No such customer', 'not_found');
  await db().delete(schema.customers).where(eq(schema.customers.id, id)); // contacts, licences, trials, communications, invoices cascade
  await logActivity(me, 'customer.delete', 'customer', id, `Deleted ${before.name}`, { customerId: id });
  return json({ ok: true });
});
