import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { getConnectorOwned, tokenFor } from '@/lib/connectors';
import { isVaultConnector, vaultUrl } from '@/lib/vault';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; docId: string }> };

/**
 * GET /api/connectors/[id]/vault/files/[docId] — what the viewer needs to know about a Vault document, in the same
 * shape as an attached file (`?text=1` adds the text Ricorsa read). The Vault logs the read against this person.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser(); const { id, docId } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  if (!isVaultConnector(c)) return fail(404, 'Not a Vault connector');
  const token = await tokenFor(c); if (!token) return fail(409, 'This connector has no token. Connect it again.', 'needs_auth');
  const headers = { Authorization: `Bearer ${token}` };
  const r = await fetch(`${vaultUrl()}/api/docs/${encodeURIComponent(docId)}`, { headers });
  if (r.status === 404) return fail(404, 'The Vault has no such document in the workspaces you connected');
  if (r.status === 401) return fail(409, 'The Vault no longer accepts this connection. Connect it again.', 'needs_auth');
  if (!r.ok) return fail(502, 'The Vault did not answer');
  const j = await r.json() as { doc: { id: string; name: string; mime: string; size: number; pages: number; chars: number; kind: string; witness: string | null; volume: string | null; date: string | null; status: string; sha256: string } };
  const file = { id: j.doc.id, name: j.doc.name, type: j.doc.mime, size: j.doc.size, chars: j.doc.chars, stored: true, pages: j.doc.pages, kind: j.doc.kind, witness: j.doc.witness, volume: j.doc.volume, date: j.doc.date, status: j.doc.status, sha256: j.doc.sha256, via: 'vault' };
  if (new URL(req.url).searchParams.get('text') === '1') {
    const t = await fetch(`${vaultUrl()}/api/docs/${encodeURIComponent(docId)}/text`, { headers });
    const tj = t.ok ? await t.json() as { text: string } : { text: '' };
    return json({ file, text: tj.text || '' });
  }
  return json({ file });
});
