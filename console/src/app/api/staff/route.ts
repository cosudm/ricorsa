import { asc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse } from '@/lib/validate';
import { StaffInvite } from '@/lib/inputs';
import { logActivity } from '@/lib/activity';
import { sendEmail, messageHtml, messageText, emailConfigured } from '@/lib/email';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const ms = (x: Date | null | undefined) => (x ? x.getTime() : null);
const view = (s: typeof schema.staff.$inferSelect) => ({ id: s.id, email: s.email, name: s.name, picture: s.picture, role: s.role, status: s.status, invitedBy: s.invitedBy, invitedAt: ms(s.invitedAt), acceptedAt: ms(s.acceptedAt), lastSeenAt: ms(s.lastSeenAt), createdAt: s.createdAt.getTime() });

export const GET = handle(async () => {
  await currentStaff();
  return json({ staff: (await db().select().from(schema.staff).orderBy(asc(schema.staff.email))).map(view) });
});

/** POST /api/staff — invite someone by email; they get in on their first sign-in with that email. */
export const POST = handle(async (req: Request) => {
  const me = await currentStaff('owner');
  const b = parse(StaffInvite, await readJson(req));
  const d = db();
  const existing = (await d.select().from(schema.staff).where(eq(schema.staff.email, b.email)).limit(1))[0];
  if (existing && existing.status !== 'requested') return fail(409, `${b.email} already has access (${existing.status})`, 'exists');
  const role = b.role || 'manager';
  let row;
  if (existing) { await d.update(schema.staff).set({ status: 'invited', role, invitedBy: me.id, invitedAt: new Date(), name: b.name ?? existing.name }).where(eq(schema.staff.id, existing.id)); row = (await d.select().from(schema.staff).where(eq(schema.staff.id, existing.id)))[0]; }
  else { const id = uid(); await d.insert(schema.staff).values({ id, email: b.email, name: b.name ?? null, role, status: 'invited', invitedBy: me.id, invitedAt: new Date() }); row = (await d.select().from(schema.staff).where(eq(schema.staff.id, id)))[0]; }
  let emailed = false;
  if (b.sendEmail !== false && emailConfigured()) {
    try {
      const es = await getSetting('email');
      const url = process.env.APP_BASE_URL || 'https://manage.ricorsa.com';
      const body = `${me.name || me.email} has invited you to the ${process.env.APP_NAME || 'Ricorsa Manager Console'} as ${role === 'owner' ? 'an owner' : 'a ' + role}.\n\nSign in with this email address (${b.email}) and you are in.`;
      await sendEmail({ from: es.from, to: [b.email], subject: `You're invited to the ${process.env.APP_NAME || 'Ricorsa Manager Console'}`, html: messageHtml(body, es.signature, { button: { label: 'Open the console', url } }), text: messageText(body, es.signature, { button: { label: 'Open the console', url } }) });
      emailed = true;
    } catch (e) { console.warn('[staff] invite email failed', String((e as Error)?.message || e)); }
  }
  await logActivity(me, 'staff.invite', 'staff', row.id, `Invited ${b.email} as ${role}${emailed ? ' (emailed)' : ''}`);
  return json({ staff: view(row), emailed }, { status: 201 });
});
