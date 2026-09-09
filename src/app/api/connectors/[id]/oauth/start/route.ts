import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { getConnectorOwned } from '@/lib/connectors';
import { McpError, probeMcp } from '@/lib/mcp';
import { beginAuthorization, discover, registerClient } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const back = (id: string, q: string) => `/app#/connectors?${q}&id=${encodeURIComponent(id)}`;

/**
 * GET /api/connectors/[id]/oauth/start — send the person to the app's sign-in page.
 * Finds the authorization server from the MCP server's own metadata, registers Ricorsa as a client if the
 * server allows it, and redirects with PKCE. The person lands back on /api/connectors/oauth/callback.
 */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  const base = process.env.APP_BASE_URL || 'https://ricorsa.com';
  const redirectUri = `${base}/api/connectors/oauth/callback`;
  try {
    // A 401 from the server usually names its auth metadata; that is the most reliable pointer.
    let hint: string | null = null;
    try { await probeMcp(c.url, null, { timeoutMs: 8000 }); } catch (e) { if (e instanceof McpError && e.kind === 'auth') hint = e.wwwAuthenticate || null; }
    const d = await discover(c.url, hint);
    const client = await registerClient(d.meta, redirectUri, d.scopes);
    const { url, pending } = await beginAuthorization(d, client, redirectUri);
    await db().update(schema.connectors).set({ pending, status: 'needs_auth', lastError: null, updatedAt: new Date() }).where(eq(schema.connectors.id, c.id));
    return Response.redirect(url, 302);
  } catch (e) {
    const msg = String((e as Error)?.message || 'Could not start sign-in').slice(0, 300);
    await db().update(schema.connectors).set({ status: 'needs_auth', lastError: msg, updatedAt: new Date() }).where(eq(schema.connectors.id, c.id));
    return Response.redirect(`${base}${back(c.id, 'oauth=failed&reason=' + encodeURIComponent(msg))}`, 302);
  }
});
