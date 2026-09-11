import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { listCustomers, getCustomer, CustomerInput } from '@/lib/customers';
import { parse } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { findAccountByEmail } from '@/lib/ricorsa';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await currentStaff();
  return json({ customers: await listCustomers() });
});

/** POST /api/customers — create a customer; an email that matches a Ricorsa account links it automatically. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(CustomerInput, await readJson(req));
  const id = uid();
  let ricorsaUserId = b.ricorsaUserId ?? null;
  if (!ricorsaUserId && b.email) { try { const acc = await findAccountByEmail(b.email); if (acc) ricorsaUserId = acc.id; } catch { /* product database unavailable */ } }
  await db().insert(schema.customers).values({
    id, kind: b.kind || (b.company ? 'company' : 'person'), name: b.name, company: b.company ?? null, email: b.email ?? null, phone: b.phone ?? null, website: b.website ?? null,
    address: b.address ?? null, status: b.status || 'lead', plan: b.plan || 'free', mrrCents: b.mrrCents ?? 0, currency: (b.currency || 'USD').toUpperCase(), source: b.source ?? null,
    ownerId: b.ownerId ?? me.id, tags: b.tags || [], notes: b.notes || '', ricorsaUserId, custom: b.custom || {},
  });
  await logActivity(me, 'customer.create', 'customer', id, `Added ${b.name}`, { customerId: id });
  return json({ customer: await getCustomer(id) }, { status: 201 });
});
