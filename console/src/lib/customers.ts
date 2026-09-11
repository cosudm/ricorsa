import { z } from 'zod';
import { and, desc, eq, inArray, count } from 'drizzle-orm';
import { db, rdb, schema, ricorsa } from './db';
import { effectiveStatus } from './invoices';
import { zAddress, zCustomerStatus, zOptEmail, zOptText, zPlan, zTags, zText, zCents } from './validate';

/** What a customer can be created or edited with (PATCH takes any subset). */
export const CustomerInput = z.object({
  kind: z.enum(['person', 'company']).optional(),
  name: zText(200).min(1),
  company: zOptText(200), email: zOptEmail, phone: zOptText(60), website: zOptText(200),
  address: zAddress.nullable().optional(),
  status: zCustomerStatus.optional(), plan: zPlan.optional(), mrrCents: zCents.optional(), currency: zText(3).optional(),
  source: zOptText(80), ownerId: zOptText(60), tags: zTags.optional(), notes: zText(20000).optional(),
  ricorsaUserId: zOptText(200), custom: z.record(z.string(), z.unknown()).optional(),
});

export type CustomerRow = typeof schema.customers.$inferSelect;

/** A customer as the grid shows it: the row plus what hangs off it, in one object. */
export type CustomerView = ReturnType<typeof toView>;
function toView(c: CustomerRow, extra: { contacts: number; openCents: number; invoices: number; license: { plan: string; endsAt: number | null; status: string } | null; trial: { plan: string; endsAt: number; status: string } | null; account: { plan: string; subscriptionStatus: string | null; lastSeenAt: number; email: string | null } | null }) {
  return {
    id: c.id, kind: c.kind, name: c.name, company: c.company, email: c.email, phone: c.phone, website: c.website, address: c.address, status: c.status, plan: c.plan,
    mrrCents: c.mrrCents, currency: c.currency, source: c.source, ownerId: c.ownerId, tags: c.tags, notes: c.notes, ricorsaUserId: c.ricorsaUserId, custom: c.custom,
    lastContactAt: c.lastContactAt?.getTime() ?? null, createdAt: c.createdAt.getTime(), updatedAt: c.updatedAt.getTime(),
    contacts: extra.contacts, openCents: extra.openCents, invoices: extra.invoices, license: extra.license, trial: extra.trial, account: extra.account,
  };
}

/** Every customer with aggregates, newest first (the grid sorts and filters on the client). */
export async function listCustomers(ids?: string[]): Promise<CustomerView[]> {
  const d = db();
  const where = ids ? inArray(schema.customers.id, ids) : undefined;
  const rows = await d.select().from(schema.customers).where(where).orderBy(desc(schema.customers.updatedAt)).limit(5000);
  if (!rows.length) return [];
  const cids = rows.map(r => r.id);
  const scope = <T extends { customerId: unknown }>(col: T['customerId']) => inArray(col as never, cids);
  const [contacts, invs, lics, tris] = await Promise.all([
    d.select({ customerId: schema.contacts.customerId, n: count() }).from(schema.contacts).where(scope(schema.contacts.customerId)).groupBy(schema.contacts.customerId),
    d.select({ customerId: schema.invoices.customerId, status: schema.invoices.status, totalCents: schema.invoices.totalCents, paidCents: schema.invoices.paidCents, dueAt: schema.invoices.dueAt }).from(schema.invoices).where(scope(schema.invoices.customerId)),
    d.select().from(schema.licenses).where(and(scope(schema.licenses.customerId), eq(schema.licenses.status, 'active'))).orderBy(desc(schema.licenses.createdAt)),
    d.select().from(schema.trials).where(and(scope(schema.trials.customerId), eq(schema.trials.status, 'active'))).orderBy(desc(schema.trials.createdAt)),
  ]);
  const linked = rows.map(r => r.ricorsaUserId).filter((x): x is string => !!x);
  let accounts: Array<{ id: string; plan: string; subscriptionStatus: string | null; lastSeenAt: Date; email: string | null }> = [];
  if (linked.length) { try { accounts = await rdb().select({ id: ricorsa.rUsers.id, plan: ricorsa.rUsers.plan, subscriptionStatus: ricorsa.rUsers.subscriptionStatus, lastSeenAt: ricorsa.rUsers.lastSeenAt, email: ricorsa.rUsers.email }).from(ricorsa.rUsers).where(inArray(ricorsa.rUsers.id, linked)); } catch (e) { console.warn('[customers] product database unavailable', String((e as Error)?.message || e)); } }
  return rows.map(c => {
    const mine = invs.filter(i => i.customerId === c.id);
    const openCents = mine.reduce((a, i) => { const s = effectiveStatus(i); return a + (s === 'sent' || s === 'overdue' ? Math.max(0, i.totalCents - i.paidCents) : 0); }, 0);
    const lic = lics.find(l => l.customerId === c.id), tr = tris.find(t => t.customerId === c.id), acc = accounts.find(a => a.id === c.ricorsaUserId);
    return toView(c, {
      contacts: contacts.find(x => x.customerId === c.id)?.n || 0, openCents, invoices: mine.length,
      license: lic ? { plan: lic.plan, endsAt: lic.endsAt?.getTime() ?? null, status: lic.status } : null,
      trial: tr ? { plan: tr.plan, endsAt: tr.endsAt.getTime(), status: tr.status } : null,
      account: acc ? { plan: acc.plan, subscriptionStatus: acc.subscriptionStatus, lastSeenAt: acc.lastSeenAt.getTime(), email: acc.email } : null,
    });
  });
}

export async function getCustomer(id: string): Promise<CustomerView | null> { return (await listCustomers([id]))[0] || null; }

/** Apply a change to a customer and stamp it as updated. */
export async function touchCustomer(id: string, patch: Partial<CustomerRow> = {}): Promise<void> {
  await db().update(schema.customers).set({ ...patch, updatedAt: new Date() }).where(eq(schema.customers.id, id));
}

export async function customerName(id: string): Promise<string> {
  const r = (await db().select({ name: schema.customers.name, company: schema.customers.company }).from(schema.customers).where(eq(schema.customers.id, id)).limit(1))[0];
  return r ? (r.company && r.company !== r.name ? `${r.name} (${r.company})` : r.name) : id;
}

