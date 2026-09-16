import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail, readJson } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { applyGrant } from '@/lib/grants';
import { normalizePlanKey, PLANS } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** GET /api/admin/grants — admins only: plans granted by email, newest first, with whether each has been applied. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const rows = await db().select().from(schema.grants).orderBy(desc(schema.grants.createdAt)).limit(200);
  return json({ grants: rows });
});

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  plan: z.enum(['essentials', 'professional', 'enterprise', 'pro', 'team']),
  status: z.enum(['LICENSED', 'TRIAL']).optional(),
  endsAt: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional(),
});

/**
 * POST /api/admin/grants — admins only: grant a plan to an email address. If a person with that address already has
 * an account, the plan lands on it at once; otherwise it is applied the first time they sign in.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const b = Body.safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Give an email address and a plan (essentials, professional or enterprise)');
  const endsAt = b.data.endsAt ? new Date(b.data.endsAt) : null;
  if (endsAt && isNaN(endsAt.getTime())) return fail(400, 'The end date is not a date');
  const d = db();
  const plan = normalizePlanKey(b.data.plan); if (plan === 'free') return fail(400, 'Grant a paid plan');
  const row = { email: b.data.email, plan, status: b.data.status || 'LICENSED', endsAt, note: b.data.note || null, createdBy: user.email || user.id, appliedTo: null, appliedAt: null };
  await d.insert(schema.grants).values(row).onConflictDoUpdate({ target: schema.grants.email, set: { plan: row.plan, status: row.status, endsAt: row.endsAt, note: row.note, createdBy: row.createdBy, appliedTo: null, appliedAt: null } });
  // Already signed up: apply now.
  const existing = (await d.select().from(schema.users).where(eq(schema.users.email, b.data.email)).limit(1))[0];
  const applied = !!existing;
  if (existing) await applyGrant(existing);
  const saved = (await d.select().from(schema.grants).where(eq(schema.grants.email, b.data.email)))[0];
  return json({ grant: saved, applied, planName: PLANS[plan].name });
});

/** DELETE /api/admin/grants?email=... — remove a grant; a plan already applied stays until you change the account. */
export const DELETE = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return fail(400, 'Which email?');
  await db().delete(schema.grants).where(eq(schema.grants.email, email));
  return json({ ok: true });
});
