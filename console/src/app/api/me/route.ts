import { asc } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { paypalConfigured } from '@/lib/paypal';
import { emailConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

/** GET /api/me — who is signed in, their role, the settings the app needs, and which integrations are ready. */
export const GET = handle(async () => {
  const me = await currentStaff();
  const [people, settings] = await Promise.all([
    db().select({ id: schema.staff.id, email: schema.staff.email, name: schema.staff.name, role: schema.staff.role, status: schema.staff.status, picture: schema.staff.picture }).from(schema.staff).orderBy(asc(schema.staff.email)),
    getSettings(),
  ]);
  return json({
    me: { id: me.id, email: me.email, name: me.name, picture: me.picture, role: me.role, prefs: me.prefs },
    staff: people.filter(p => p.status === 'active' || p.status === 'invited'),
    settings,
    integrations: { paypal: paypalConfigured(), email: emailConfigured(), paypalEnv: process.env.PAYPAL_ENV || 'sandbox' },
    app: { name: process.env.APP_NAME || 'Ricorsa Manager Console', productUrl: process.env.PRODUCT_URL || 'https://ricorsa.com' },
  });
});

/** PATCH /api/me — the person's own preferences (grid layouts, last view). POST is the same, for a beacon sent while leaving the page. */
export const PATCH = handle(async (req: Request) => savePrefs(req));
export const POST = handle(async (req: Request) => savePrefs(req));
async function savePrefs(req: Request) {
  const me = await currentStaff();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const prefs = { ...(me.prefs || {}), ...(body && typeof body === 'object' ? body : {}) };
  if (JSON.stringify(prefs).length > 60_000) return json({ error: 'Preferences are too large', code: 'invalid_request' }, { status: 400 });
  const { eq } = await import('drizzle-orm');
  await db().update(schema.staff).set({ prefs }).where(eq(schema.staff.id, me.id));
  return json({ ok: true, prefs });
}
