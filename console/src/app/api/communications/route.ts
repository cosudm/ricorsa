import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { CommInput } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { customerName, touchCustomer } from '@/lib/customers';
import { commView } from '@/lib/views';
import { sendEmail, messageHtml, messageText } from '@/lib/email';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** GET /api/communications — the latest 2,000 across all customers (the grid filters). ?customerId= narrows to one. */
export const GET = handle(async (req: Request) => {
  await currentStaff();
  const cid = new URL(req.url).searchParams.get('customerId');
  const q = db().select({ c: schema.communications, name: schema.customers.name, company: schema.customers.company, email: schema.customers.email }).from(schema.communications).leftJoin(schema.customers, eq(schema.customers.id, schema.communications.customerId));
  const rows = await (cid ? q.where(eq(schema.communications.customerId, cid)) : q).orderBy(desc(schema.communications.at)).limit(2000);
  return json({ communications: rows.map(r => commView(r.c, { name: r.name || '', company: r.company, email: r.email })) });
});

/** POST /api/communications — log a call, meeting, note or email; with `send: true` an email is sent through the email service first. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('manager');
  const b = parse(CommInput, await readJson(req));
  const d = db();
  const c = (await d.select({ id: schema.customers.id, name: schema.customers.name, email: schema.customers.email }).from(schema.customers).where(eq(schema.customers.id, b.customerId)).limit(1))[0];
  if (!c) return fail(404, 'No such customer', 'not_found');
  const kind = b.kind || 'note';
  const id = uid();
  let status: 'logged' | 'sent' | 'failed' = 'logged', provider: string | null = null, providerId: string | null = null, error: string | null = null;
  let toEmail = b.toEmail ?? null;
  if (kind === 'email' && b.send) {
    if (!toEmail && b.contactId) { const ct = (await d.select({ email: schema.contacts.email }).from(schema.contacts).where(eq(schema.contacts.id, b.contactId)).limit(1))[0]; toEmail = ct?.email || null; }
    if (!toEmail) toEmail = c.email;
    if (!toEmail) return fail(400, 'This customer has no email address to send to', 'no_email');
    if (!b.subject?.trim()) return fail(400, 'Give the email a subject', 'invalid_request');
    const email = await getSetting('email');
    try {
      const r = await sendEmail({ from: email.from, to: [toEmail], replyTo: email.replyTo || undefined, subject: b.subject.trim(), html: messageHtml(b.body || '', email.signature), text: messageText(b.body || '', email.signature) });
      status = 'sent'; provider = 'resend'; providerId = r.id;
    } catch (e) {
      const err = e as { status?: number; message?: string; code?: string };
      if (err.code === 'email_unconfigured') return fail(503, err.message || 'Email is not set up', 'email_unconfigured');
      status = 'failed'; provider = 'resend'; error = err.message || 'send failed';
    }
  }
  await d.insert(schema.communications).values({ id, customerId: b.customerId, contactId: b.contactId ?? null, kind, direction: b.direction || 'out', subject: b.subject || '', body: b.body || '', toEmail, status, provider, providerId, error, byStaffId: me.id, at: b.at ? new Date(b.at) : new Date() });
  await touchCustomer(b.customerId, { lastContactAt: new Date() });
  await logActivity(me, 'communication.' + (status === 'sent' ? 'send' : 'log'), 'communication', id, `${status === 'sent' ? 'Emailed' : status === 'failed' ? 'Failed to email' : `Logged a ${kind} with`} ${await customerName(b.customerId)}${b.subject ? ': ' + b.subject : ''}`, { customerId: b.customerId });
  const row = (await d.select().from(schema.communications).where(eq(schema.communications.id, id)))[0];
  return json({ communication: commView(row, { name: c.name, company: null, email: c.email }) }, { status: status === 'failed' ? 502 : 201 });
});
