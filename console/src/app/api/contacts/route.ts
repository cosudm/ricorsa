import { and, eq, ne } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { ContactInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName, touchCustomer } from '@/lib/customers';

export const dynamic = 'force-dynamic';


export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(ContactInput, await readJson(req));
  const d = db();
  const exists = (await d.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, b.customerId)).limit(1))[0];
  if (!exists) return fail(404, 'No such customer', 'not_found');
  const id = uid();
  if (b.primary) await d.update(schema.contacts).set({ primary: false }).where(and(eq(schema.contacts.customerId, b.customerId), ne(schema.contacts.id, id)));
  await d.insert(schema.contacts).values({ id, customerId: b.customerId, name: b.name, email: b.email ?? null, phone: b.phone ?? null, title: b.title ?? null, primary: !!b.primary, notes: b.notes || '' });
  await touchCustomer(b.customerId);
  await logActivity(me, 'contact.create', 'contact', id, `Added contact ${b.name} to ${await customerName(b.customerId)}`, { customerId: b.customerId });
  const row = (await d.select().from(schema.contacts).where(eq(schema.contacts.id, id)))[0];
  return json({ contact: { ...row, createdAt: row.createdAt.getTime() } }, { status: 201 });
});
