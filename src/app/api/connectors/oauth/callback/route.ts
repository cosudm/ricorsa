import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { checkConnector } from '@/lib/connectors';
import { exchangeCode } from '@/lib/mcp-oauth';
import { sealJson } from '@/lib/secretbox';

export const dynamic = 'force-dynamic';

/** GET /api/connectors/oauth/callback?code&state — finish the sign-in and check the connector. */
export async function GET(req: Request) {
  const base = process.env.APP_BASE_URL || 'https://ricorsa.com';
  const u = new URL(req.url);
  const code = u.searchParams.get('code'), state = u.searchParams.get('state');
  const err = u.searchParams.get('error');
  const done = (q: string) => Response.redirect(`${base}/app#/connectors?${q}`, 302);
  let user; try { user = await currentUser(); } catch { return Response.redirect(`${base}/auth/login?returnTo=${encodeURIComponent('/app#/connectors')}`, 302); }
  const rows = await db().select().from(schema.connectors).where(eq(schema.connectors.userId, user.id));
  const c = rows.find(r => r.pending && state && r.pending.state === state);
  if (!c) return done('oauth=failed&reason=' + encodeURIComponent('This sign-in link is not valid any more. Start again from Connectors.'));
  if (err || !code) {
    const reason = u.searchParams.get('error_description') || err || 'Sign-in was cancelled';
    await db().update(schema.connectors).set({ pending: null, status: 'needs_auth', lastError: reason.slice(0, 300), updatedAt: new Date() }).where(and(eq(schema.connectors.id, c.id), eq(schema.connectors.userId, user.id)));
    return done('oauth=failed&reason=' + encodeURIComponent(reason) + '&id=' + encodeURIComponent(c.id));
  }
  try {
    if (Date.now() - c.pending!.startedAt > 15 * 60_000) throw new Error('The sign-in took too long. Start again.');
    const secret = await exchangeCode(c.pending!, code);
    const updated = await db().update(schema.connectors).set({ secret: await sealJson(secret), pending: null, status: 'new', lastError: null, updatedAt: new Date() }).where(and(eq(schema.connectors.id, c.id), eq(schema.connectors.userId, user.id))).returning();
    await checkConnector(updated[0]);
    return done('oauth=ok&id=' + encodeURIComponent(c.id));
  } catch (e) {
    const reason = String((e as Error)?.message || 'Sign-in failed').slice(0, 300);
    await db().update(schema.connectors).set({ pending: null, status: 'needs_auth', lastError: reason, updatedAt: new Date() }).where(and(eq(schema.connectors.id, c.id), eq(schema.connectors.userId, user.id)));
    return done('oauth=failed&reason=' + encodeURIComponent(reason) + '&id=' + encodeURIComponent(c.id));
  }
}
