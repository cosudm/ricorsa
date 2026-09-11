import { currentUser } from '@/lib/session';
import { handle, fail } from '@/lib/http';
import { getConnectorOwned, tokenFor } from '@/lib/connectors';
import { isVaultConnector, vaultUrl } from '@/lib/vault';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; docId: string }> };

/** GET /api/connectors/[id]/vault/files/[docId]/content — the original bytes, streamed from the Vault (Range passes through). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id, docId } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  if (!isVaultConnector(c)) return fail(404, 'Not a Vault connector');
  const token = await tokenFor(c); if (!token) return fail(409, 'This connector has no token. Connect it again.', 'needs_auth');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = req.headers.get('range'); if (range) headers.Range = range;
  const download = new URL(req.url).searchParams.get('download') === '1';
  const r = await fetch(`${vaultUrl()}/api/docs/${encodeURIComponent(docId)}/content${download ? '?download=1' : ''}`, { headers });
  if (r.status === 404) return fail(404, 'The Vault has no such document in the workspaces you connected');
  if (r.status === 401) return fail(409, 'The Vault no longer accepts this connection. Connect it again.', 'needs_auth');
  if (!r.ok && r.status !== 206) return fail(502, 'The Vault did not answer');
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'etag', 'content-security-policy']) { const v = r.headers.get(h); if (v) out.set(h, v); }
  out.set('Cache-Control', 'private, no-store'); out.set('X-Content-Type-Options', 'nosniff'); out.set('X-Frame-Options', 'SAMEORIGIN');
  return new Response(r.body, { status: r.status, headers: out });
});
