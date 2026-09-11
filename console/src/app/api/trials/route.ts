import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { TrialInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName } from '@/lib/customers';
import { syncCustomerGrant } from '@/lib/grants';
import { trialView } from '@/lib/views';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';


export const GET = handle(async () => {
  await currentStaff();
  const rows = await db().select({ t: schema.trials, name: schema.customers.name, company: schema.customers.company, email: schema.customers.email }).from(schema.trials).leftJoin(schema.customers, eq(schema.customers.id, schema.trials.customerId)).orderBy(desc(schema.trials.createdAt)).limit(5000);
  return json({ trials: rows.map(r => trialView(r.t, { name: r.name || '', company: r.company, email: r.email })) });
});

/** POST /api/trials — start a trial (default length and plan from Settings) and apply it to the linked account. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(TrialInput, await readJson(req));
  const d = db();
  const c = (await d.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, b.customerId)).limit(1))[0];
  if (!c) return fail(404, 'No such customer', 'not_found');
  const defaults = await getSetting('trial');
  const plan = b.plan || defaults.plan;
  const endsAt = b.endsAt ? new Date(b.endsAt) : new Date(Date.now() + (b.days || defaults.days) * 86400e3);
  const id = uid();
  await d.insert(schema.trials).values({ id, customerId: b.customerId, plan, status: 'active', endsAt, notes: b.notes || '', createdBy: me.id });
  await logActivity(me, 'trial.create', 'trial', id, `Started a ${plan} trial for ${await customerName(b.customerId)} until ${endsAt.toDateString()}`, { customerId: b.customerId });
  const sync = b.apply === false ? { applied: null, note: 'Not applied to the Ricorsa account.' } : await syncCustomerGrant(b.customerId, me);
  const row = (await d.select().from(schema.trials).where(eq(schema.trials.id, id)))[0];
  return json({ trial: trialView(row), sync }, { status: 201 });
});
