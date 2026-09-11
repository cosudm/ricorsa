import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { InvoiceInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { invoiceView } from '@/lib/views';
import { computeTotals } from '@/lib/invoices';
import { getSetting, nextInvoiceNumber } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await currentStaff();
  const rows = await db().select({ i: schema.invoices, name: schema.customers.name, company: schema.customers.company, email: schema.customers.email }).from(schema.invoices).leftJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId)).orderBy(desc(schema.invoices.createdAt)).limit(5000);
  return json({ invoices: rows.map(r => invoiceView(r.i, { name: r.name || '', company: r.company, email: r.email })) });
});

/** POST /api/invoices — a draft with the next number; bill-to defaults to the customer's details. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(InvoiceInput, await readJson(req));
  const d = db();
  const c = (await d.select().from(schema.customers).where(eq(schema.customers.id, b.customerId)).limit(1))[0];
  if (!c) return fail(404, 'No such customer', 'not_found');
  const inv = await getSetting('invoice');
  const items = b.items.map(it => ({ description: it.description, qty: it.qty, unitCents: it.unitCents, taxRate: it.taxRate ?? (inv.taxRate || undefined) }));
  const totals = computeTotals(items);
  const issuedAt = b.issuedAt ? new Date(b.issuedAt) : new Date();
  const dueAt = b.dueAt === undefined ? new Date(issuedAt.getTime() + inv.dueDays * 86400e3) : (b.dueAt ? new Date(b.dueAt) : null);
  const id = uid(), number = await nextInvoiceNumber();
  await d.insert(schema.invoices).values({
    id, number, customerId: b.customerId, status: 'draft', currency: (b.currency || inv.currency || c.currency || 'USD').toUpperCase(), items, ...totals, issuedAt, dueAt,
    billTo: { name: b.billTo?.name ?? c.name, company: b.billTo?.company ?? c.company ?? undefined, email: b.billTo?.email ?? c.email ?? undefined, address: b.billTo?.address ?? c.address ?? undefined },
    notes: b.notes ?? '', terms: b.terms ?? inv.terms, createdBy: me.id,
  });
  await logActivity(me, 'invoice.create', 'invoice', id, `Drafted invoice ${number} for ${await customerName(b.customerId)}`, { customerId: b.customerId });
  const row = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0];
  return json({ invoice: invoiceView(row, { name: c.name, company: c.company, email: c.email }) }, { status: 201 });
});
