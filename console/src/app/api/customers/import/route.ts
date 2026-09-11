import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse, zCustomerStatus, zOptEmail, zOptText, zPlan, zTags, zText } from '@/lib/validate';
import { logActivity } from '@/lib/activity';
import { findAccountByEmail } from '@/lib/ricorsa';

export const dynamic = 'force-dynamic';

const Row = z.object({ name: zText(200).min(1), company: zOptText(200), email: zOptEmail, phone: zOptText(60), website: zOptText(200), status: zCustomerStatus.optional(), plan: zPlan.optional(), source: zOptText(80), tags: zTags.optional(), notes: zText(20000).optional() });

/** POST /api/customers/import — rows parsed from a CSV on the client. Existing emails are updated instead of duplicated. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(z.object({ rows: z.array(Row).min(1).max(2000) }), await readJson(req));
  const d = db();
  const emails = b.rows.map(r => r.email).filter((e): e is string => !!e);
  const existing = emails.length ? await d.select({ id: schema.customers.id, email: schema.customers.email }).from(schema.customers).where(inArray(schema.customers.email, emails)) : [];
  let created = 0, updated = 0;
  for (const r of b.rows) {
    const hit = r.email ? existing.find(e => e.email === r.email) : null;
    if (hit) {
      await d.update(schema.customers).set({ name: r.name, company: r.company ?? undefined, phone: r.phone ?? undefined, website: r.website ?? undefined, status: r.status, plan: r.plan, source: r.source ?? undefined, tags: r.tags, notes: r.notes, updatedAt: new Date() }).where(inArray(schema.customers.id, [hit.id]));
      updated++;
    } else {
      let ricorsaUserId: string | null = null;
      if (r.email) { try { const acc = await findAccountByEmail(r.email); if (acc) ricorsaUserId = acc.id; } catch { /* unavailable */ } }
      await d.insert(schema.customers).values({ id: uid(), kind: r.company ? 'company' : 'person', name: r.name, company: r.company ?? null, email: r.email ?? null, phone: r.phone ?? null, website: r.website ?? null, status: r.status || 'lead', plan: r.plan || 'free', source: r.source ?? 'import', ownerId: me.id, tags: r.tags || [], notes: r.notes || '', ricorsaUserId });
      created++;
    }
  }
  await logActivity(me, 'customer.import', 'customer', null, `Imported ${created} new and updated ${updated} customer${created + updated === 1 ? '' : 's'}`);
  return json({ created, updated });
});
