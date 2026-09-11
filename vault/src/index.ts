import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, IntakeMessage } from './env';
import { admin } from './admin';
import { connectionFromRequest, hashToken, inScope, logAccess, readDocument, signLink, verifyLink } from './access';
import { approveChallenge, clientAuthorized, revokeConnection, startChallenge, verifyChallenge } from './connect';
import { first } from './db';
import { getBatch, origKey, receiveFile, sealBatch, setManifest, type BatchRow } from './intake';
import { handleMcp } from './mcp';
import { deadLetter, processMessage } from './pipeline';
import { getDoc, parseDocId } from './shards';
import { HttpError, mimeFor } from './util';

export { SearchShard } from './shard-do';
export { HashDirectory } from './hashdir-do';

type Vars = { Bindings: Env };
const app = new Hono<Vars>();

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message, code: e.code || null }, e.status as 400);
  if (e instanceof z.ZodError) return c.json({ error: 'Some of the input is not right', code: 'invalid', issues: e.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
  console.error('[vault]', e);
  return c.json({ error: 'Something went wrong on our side', code: 'internal' }, 500);
});

app.get('/api/health', async c => {
  const checks = { db: false, files: false, ocr: c.env.OCR_PROVIDER || 'none', mail: !!c.env.RESEND_API_KEY, client: !!c.env.RICORSA_CLIENT_SECRET };
  try { checks.db = !!(await first<{ ok: number }>(c.env.DB, 'SELECT 1 AS ok'))?.ok; } catch { /* false */ }
  try { await c.env.FILES.head('health'); checks.files = true; } catch { /* false */ }
  return c.json({ ok: true, service: 'vault', time: new Date().toISOString(), ...checks }, 200, { 'Cache-Control': 'no-store' });
});

// Staff screens
app.route('/api/admin', admin);

// The uploader's API, authenticated by the batch's own key
async function batchFromKey(c: { env: Env; req: { header: (n: string) => string | undefined; param: (n: string) => string } }): Promise<BatchRow> {
  const m = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') || ''); if (!m) throw new HttpError(401, 'The batch key is required', 'unauthenticated');
  const batch = await getBatch(c.env, c.req.param('id')); if (!batch || !(batch as BatchRow & { intake_key_hash?: string }).intake_key_hash) throw new HttpError(404, 'No such batch');
  if ((batch as BatchRow & { intake_key_hash: string }).intake_key_hash !== await hashToken(m[1].trim())) throw new HttpError(401, 'That batch key is not right', 'unauthenticated');
  return batch;
}
app.get('/api/intake/batches/:id', async c => { const b = await batchFromKey(c); return c.json({ batch: b }); });
app.post('/api/intake/batches/:id/manifest', async c => { const b = await batchFromKey(c); const body = z.object({ files: z.array(z.object({ path: z.string(), size: z.number(), sha256: z.string() })).max(50000) }).parse(await c.req.json()); return c.json(await setManifest(c.env, b, body.files)); });
app.put('/api/intake/batches/:id/files', async c => {
  const b = await batchFromKey(c);
  const len = +(c.req.header('content-length') || 0); if (len > 95 * 1024 * 1024) throw new HttpError(413, 'Files over 95 MB go through the bulk sync, not this endpoint');
  const bytes = new Uint8Array(await c.req.arrayBuffer()); if (!bytes.byteLength) throw new HttpError(400, 'The file is empty');
  return c.json(await receiveFile(c.env, b, { path: c.req.query('path') || '', name: c.req.query('name') || undefined, claimedSha256: c.req.query('sha256') || null, bytes, matterId: c.req.query('matter') || null, folderId: c.req.query('folder') || null }));
});
app.post('/api/intake/batches/:id/seal', async c => { const b = await batchFromKey(c); return c.json(await sealBatch(c.env, b)); });

// Outside clients (Ricorsa): the connection flow, server to server
app.use('/api/clients/*', async (c, next) => { if (!clientAuthorized(c.env, c.req.raw)) throw new HttpError(401, 'Client credentials are required', 'unauthenticated'); await next(); });
app.post('/api/clients/connect/start', async c => { const b = z.object({ email: z.string().max(200), externalUser: z.string().max(120).optional(), client: z.string().max(40).default('ricorsa') }).parse(await c.req.json()); return c.json(await startChallenge(c.env, { email: b.email, client: b.client, externalUser: b.externalUser || null })); });
app.post('/api/clients/connect/verify', async c => { const b = z.object({ challengeId: z.string(), code: z.string().max(12), client: z.string().max(40).default('ricorsa') }).parse(await c.req.json()); return c.json(await verifyChallenge(c.env, b)); });
app.post('/api/clients/connect/approve', async c => { const b = z.object({ challengeId: z.string(), workspaceIds: z.array(z.string()).min(1).max(50), label: z.string().max(120).optional(), client: z.string().max(40).default('ricorsa') }).parse(await c.req.json()); return c.json(await approveChallenge(c.env, { ...b, label: b.label || null })); });
app.post('/api/clients/connect/revoke', async c => { const b = z.object({ connectionId: z.string() }).parse(await c.req.json()); return c.json({ ok: await revokeConnection(c.env, b.connectionId, 'client') }); });
app.get('/api/clients/connections/:id', async c => {
  const row = await first<{ id: string; status: string; workspace_ids: string; label: string | null; created_at: number; last_used_at: number | null }>(c.env.DB, 'SELECT id, status, workspace_ids, label, created_at, last_used_at FROM connections WHERE id = ?', c.req.param('id'));
  if (!row) throw new HttpError(404, 'No such connection');
  return c.json({ connection: { ...row, workspaceIds: JSON.parse(row.workspace_ids) } });
});

// The MCP server Ricorsa talks to
app.all('/mcp', async c => handleMcp(c.env, c.req.raw, await connectionFromRequest(c.env, c.req.raw)));
app.all('/mcp/*', async c => handleMcp(c.env, c.req.raw, await connectionFromRequest(c.env, c.req.raw)));

// Documents for a connected client: facts, text and the bytes (proxied by the client into its own viewer)
app.get('/api/docs/:id', async c => {
  const conn = await connectionFromRequest(c.env, c.req.raw); if (!conn) throw new HttpError(401, 'A connection token is required');
  const p = parseDocId(c.req.param('id')); if (!p || !inScope(conn, p.workspaceId)) throw new HttpError(404, 'No such document');
  const d = await getDoc(c.env, c.req.param('id')); if (!d) throw new HttpError(404, 'No such document');
  await logAccess(c.env, conn, 'document', d.id, {});
  return c.json({ doc: { id: d.id, name: d.name, kind: d.kind, mime: d.mime, size: d.size, pages: d.pages, chars: d.chars, witness: d.witness, volume: d.volume, date: d.doc_date, status: d.status, sha256: d.sha256, matterId: d.matter_id, folderId: d.folder_id, boxId: d.box_id }, link: await signLink(c.env, d.id, null, 900) });
});
app.get('/api/docs/:id/text', async c => {
  const conn = await connectionFromRequest(c.env, c.req.raw); if (!conn) throw new HttpError(401, 'A connection token is required');
  const p = parseDocId(c.req.param('id')); if (!p || !inScope(conn, p.workspaceId)) throw new HttpError(404, 'No such document');
  const r = await readDocument(c.env, c.req.param('id'), null, null, 400_000);
  await logAccess(c.env, conn, 'read', r.doc.id, { pages: r.pages.length, via: 'text' });
  return c.json({ text: r.pages.map(pg => `[Page ${pg.page}]\n${pg.text}`).join('\n\n'), pages: r.total, truncated: r.truncated });
});
app.get('/api/docs/:id/content', async c => {
  const conn = await connectionFromRequest(c.env, c.req.raw); if (!conn) throw new HttpError(401, 'A connection token is required');
  const p = parseDocId(c.req.param('id')); if (!p || !inScope(conn, p.workspaceId)) throw new HttpError(404, 'No such document');
  const d = await getDoc(c.env, c.req.param('id')); if (!d) throw new HttpError(404, 'No such document');
  await logAccess(c.env, conn, 'content', d.id, { range: c.req.header('range') || null });
  return serveBytes(c.env, p.workspaceId, d.sha256, d.name, c.req.raw, c.req.query('download') === '1');
});

// Signed viewer links (short-lived), for opening a page in a browser tab
app.get('/v/:id', async c => {
  const id = c.req.param('id');
  if (!(await verifyLink(c.env, id, c.req.query('e') || null, c.req.query('s') || null))) throw new HttpError(403, 'This link has expired. Open the document again.');
  const p = parseDocId(id); const d = p ? await getDoc(c.env, id) : null; if (!p || !d) throw new HttpError(404, 'No such document');
  const res = await serveBytes(c.env, p.workspaceId, d.sha256, d.name, c.req.raw, c.req.query('download') === '1');
  return res;
});

/** Stream an original from storage with Range support, typed by name, never altered. */
async function serveBytes(env: Env, workspaceId: string, sha256: string, name: string, req: Request, download: boolean): Promise<Response> {
  const key = origKey(workspaceId, sha256);
  const range = parseRange(req.headers.get('range'));
  const obj = range ? await env.FILES.get(key, { range }) : await env.FILES.get(key);
  if (!obj) throw new HttpError(404, 'The stored original is missing');
  const headers = new Headers();
  headers.set('Content-Type', mimeFor(name));
  headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', `"${sha256}"`);
  if (/\.(html?|svg|xml)$/i.test(name)) headers.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  if (range && 'offset' in range) {
    const total = obj.size; const start = range.offset ?? 0; const end = start + (range.length ?? (total - start)) - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${total}`); headers.set('Content-Length', String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
function parseRange(h: string | null): R2Range | null {
  const m = h && /^bytes=(\d*)-(\d*)$/.exec(h.trim()); if (!m) return null;
  if (m[1] === '' && m[2] !== '') return { suffix: +m[2] };
  const start = +m[1]; if (m[2] === '') return { offset: start };
  return { offset: start, length: +m[2] - start + 1 };
}

// Everything else: the static admin screens (assets), else 404
app.notFound(c => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<IntakeMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const out = await processMessage(env, msg.body);
        if (out.kind === 'done') { msg.ack(); continue; }
        if (out.kind === 'requeue') { await env.INTAKE.send(out.message, { delaySeconds: out.delaySeconds }); msg.ack(); continue; }
        if (out.kind === 'retry' || out.kind === 'failed') {
          if (out.kind === 'failed' || msg.attempts >= 5) { await deadLetter(env, msg.body, out.error, msg.attempts); msg.ack(); }
          else { console.warn('[vault] retry', msg.body.docId, out.error); msg.retry({ delaySeconds: Math.min(600, 15 * 2 ** msg.attempts) }); }
        }
      } catch (e) {
        const error = String((e as Error)?.message || e);
        console.error('[vault] processing threw', msg.body.docId, error);
        if (msg.attempts >= 5) { await deadLetter(env, msg.body, error, msg.attempts).catch(() => {}); msg.ack(); }
        else msg.retry({ delaySeconds: Math.min(600, 15 * 2 ** msg.attempts) });
      }
    }
  },
};
