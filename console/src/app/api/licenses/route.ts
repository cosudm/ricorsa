import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { LicenseInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { newLicenseKey } from '@/lib/licenses';
import { syncCustomerGrant } from '@/lib/grants';
import { licenseView } from '@/lib/views';

export const dynamic = 'force-dynamic';


/** GET /api/licenses — every licence with its customer, newest first. Expired dates are reported as they stand; the grid marks them. */
export const GET = handle(async () => {
  await currentStaff();
  const rows = await db().select({ l: schema.licenses, name: schema.customers.name, company: schema.customers.company, email: schema.customers.email }).from(schema.licenses).leftJoin(schema.customers, eq(schema.customers.id, schema.licenses.customerId)).orderBy(desc(schema.licenses.createdAt)).limit(5000);
  return json({ licenses: rows.map(r => licenseView(r.l, { name: r.name || '', company: r.company, email: r.email })) });
});

/** POST /api/licenses — issue a licence and, by default, apply it to the linked Ricorsa account. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(LicenseInput, await readJson(req));
  const d = db();
  const c = (await d.select({ id: schema.customers.id, ricorsaUserId: schema.customers.ricorsaUserId }).from(schema.customers).where(eq(schema.customers.id, b.customerId)).limit(1))[0];
  if (!c) return fail(404, 'No such customer', 'not_found');
  const id = uid();
  await d.insert(schema.licenses).values({ id, customerId: b.customerId, key: newLicenseKey(), plan: b.plan, seats: b.seats || 1, status: 'active', startsAt: b.startsAt ? new Date(b.startsAt) : new Date(), endsAt: b.endsAt ? new Date(b.endsAt) : null, autoRenew: !!b.autoRenew, notes: b.notes || '', createdBy: me.id });
  await logActivity(me, 'license.create', 'license', id, `Issued a ${b.plan} licence to ${await customerName(b.customerId)}${b.endsAt ? ' until ' + new Date(b.endsAt).toDateString() : ''}`, { customerId: b.customerId });
  const sync = b.apply === false ? { applied: null, note: 'Not applied to the Ricorsa account.' } : await syncCustomerGrant(b.customerId, me);
  const row = (await d.select().from(schema.licenses).where(eq(schema.licenses.id, id)))[0];
  return json({ license: licenseView(row), sync }, { status: 201 });
});
