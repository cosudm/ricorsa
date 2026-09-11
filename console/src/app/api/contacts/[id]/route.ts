import { and, eq, ne } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { ContactInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { touchCustomer } from '@/lib/customers';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such contact', 'not_found');
  const b = parse(ContactInput.omit({ customerId: true }).partial(), await readJson(req));
  const set: Record<string, unknown> = {}; for (const [k, v] of Object.entries(b)) if (v !== undefined) set[k] = v;
  if (b.primary) await d.update(schema.contacts).set({ primary: false }).where(and(eq(schema.contacts.customerId, row.customerId), ne(schema.contacts.id, id)));
  if (Object.keys(set).length) await d.update(schema.contacts).set(set).where(eq(schema.contacts.id, id));
  await touchCustomer(row.customerId);
  await logActivity(me, 'contact.update', 'contact', id, `Updated contact ${b.name || row.name}`, { customerId: row.customerId });
  const after = (await d.select().from(schema.contacts).where(eq(schema.contacts.id, id)))[0];
  return json({ contact: { ...after, createdAt: after.createdAt.getTime() } });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such contact', 'not_found');
  await d.delete(schema.contacts).where(eq(schema.contacts.id, id));
  await touchCustomer(row.customerId);
  await logActivity(me, 'contact.delete', 'contact', id, `Removed contact ${row.name}`, { customerId: row.customerId });
  return json({ ok: true });
});
