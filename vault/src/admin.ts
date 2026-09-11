import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Env } from './env';
import { all, first, run } from './db';
import { createBatch, getBatch, receiveFile, sealBatch, setManifest, type BatchRow } from './intake';
import { receipt, verifyChain } from './receipts';
import { getDoc, listShards, parseDocId, shardStub } from './shards';
import { hashToken, loadText, readDocument, requestScan, searchWorkspaces, signLink } from './access';
import { revokeConnection } from './connect';
import { HttpError, hmacHex, randomToken, shortId, timingSafeEqual, uid } from './util';

/**
 * Staff screens' API (SMEPro operations): tenants, people, workspaces, matters, the paper inventory, batches,
 * connections, receipts. Signed in with the staff key; the session is a signed cookie.
 */
type Vars = { Bindings: Env };
export const admin = new Hono<Vars>();

const SESSION_TTL = 12 * 3600;
async function sessionValue(env: Env, exp: number): Promise<string> { return `${exp}.${await hmacHex(env.LINK_SECRET || 'dev-link-secret', `admin:${exp}`)}`; }
export async function adminSignedIn(env: Env, cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const [exp, sig] = cookie.split('.'); if (!exp || !sig || +exp < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(sig, await hmacHex(env.LINK_SECRET || 'dev-link-secret', `admin:${exp}`));
}

admin.post('/session', async c => {
  const body = await c.req.json().catch(() => ({})) as { key?: string };
  const key = String(body.key || '');
  if (!c.env.ADMIN_KEY || !key || !timingSafeEqual(key, c.env.ADMIN_KEY)) throw new HttpError(401, 'That staff key is not right');
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  setCookie(c, 'vault_admin', await sessionValue(c.env, exp), { httpOnly: true, secure: !/localhost/.test(c.env.APP_BASE_URL), sameSite: 'Lax', path: '/', maxAge: SESSION_TTL });
  return c.json({ ok: true, expiresAt: exp * 1000 });
});
admin.delete('/session', c => { deleteCookie(c, 'vault_admin', { path: '/' }); return c.json({ ok: true }); });

admin.use('*', async (c, next) => {
  if (c.req.path.endsWith('/session')) return next();
  if (!(await adminSignedIn(c.env, getCookie(c, 'vault_admin')))) throw new HttpError(401, 'Sign in with the staff key', 'unauthenticated');
  await next();
});

admin.get('/overview', async c => {
  const db = c.env.DB;
  const [t, w, b, p, s, d, cn] = await Promise.all([
    first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM tenants'),
    first<{ n: number; docs: number; pages: number }>(db, 'SELECT COUNT(*) AS n, COALESCE(SUM(doc_count), 0) AS docs, COALESCE(SUM(page_count), 0) AS pages FROM workspaces'),
    first<{ open: number; awaiting: number; failed: number }>(db, `SELECT SUM(status = 'open') AS open, COALESCE(SUM(files_awaiting_ocr), 0) AS awaiting, COALESCE(SUM(files_failed), 0) AS failed FROM batches`),
    first<{ paper: number; requested: number }>(db, `SELECT SUM(status IN ('paper','requested','scanning')) AS paper, SUM(status = 'requested') AS requested FROM folders`),
    first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM scan_requests WHERE status IN ('requested','scanning')`),
    first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM dead_letters'),
    first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM connections WHERE status = 'active'`),
  ]);
  return c.json({ tenants: t?.n || 0, workspaces: w?.n || 0, documents: w?.docs || 0, pages: w?.pages || 0, openBatches: b?.open || 0, awaitingOcr: b?.awaiting || 0, failed: b?.failed || 0, paperFolders: p?.paper || 0, scanRequests: s?.n || 0, deadLetters: d?.n || 0, connections: cn?.n || 0, ocr: (c.env.OCR_PROVIDER || 'none') });
});

// Tenants and people
admin.get('/tenants', async c => c.json({ items: await all(c.env.DB, 'SELECT t.*, (SELECT COUNT(*) FROM workspaces w WHERE w.tenant_id = t.id) AS workspaces, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS people FROM tenants t ORDER BY created_at DESC') }));
admin.post('/tenants', async c => {
  const b = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/).optional() }).parse(await c.req.json());
  const id = uid(); const slug = b.slug || b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || shortId(6);
  await run(c.env.DB, 'INSERT INTO tenants (id, name, slug, status, created_at) VALUES (?, ?, ?, ?, ?)', id, b.name, slug, 'active', Date.now());
  await receipt(c.env.DB, id, 'tenant.created', id, { name: b.name, slug });
  return c.json({ tenant: await first(c.env.DB, 'SELECT * FROM tenants WHERE id = ?', id) });
});
admin.get('/users', async c => { const t = c.req.query('tenant'); return c.json({ items: t ? await all(c.env.DB, 'SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at DESC', t) : await all(c.env.DB, 'SELECT * FROM users ORDER BY created_at DESC LIMIT 500') }); });
admin.post('/users', async c => {
  const b = z.object({ tenantId: z.string(), email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(120).optional(), role: z.enum(['owner', 'admin', 'contributor', 'reviewer', 'viewer']).default('viewer') }).parse(await c.req.json());
  const id = uid();
  await run(c.env.DB, 'INSERT INTO users (id, tenant_id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, b.tenantId, b.email, b.name || null, b.role, 'active', Date.now());
  await receipt(c.env.DB, b.tenantId, 'user.added', id, { email: b.email, role: b.role });
  return c.json({ user: await first(c.env.DB, 'SELECT * FROM users WHERE id = ?', id) });
});
admin.patch('/users/:id', async c => {
  const b = z.object({ name: z.string().trim().max(120).optional(), role: z.enum(['owner', 'admin', 'contributor', 'reviewer', 'viewer']).optional(), status: z.enum(['active', 'disabled']).optional() }).parse(await c.req.json());
  const u = await first<{ id: string; tenant_id: string }>(c.env.DB, 'SELECT id, tenant_id FROM users WHERE id = ?', c.req.param('id')); if (!u) throw new HttpError(404, 'No such person');
  if (b.name !== undefined) await run(c.env.DB, 'UPDATE users SET name = ? WHERE id = ?', b.name, u.id);
  if (b.role) await run(c.env.DB, 'UPDATE users SET role = ? WHERE id = ?', b.role, u.id);
  if (b.status) await run(c.env.DB, 'UPDATE users SET status = ? WHERE id = ?', b.status, u.id);
  await receipt(c.env.DB, u.tenant_id, 'user.changed', u.id, b);
  return c.json({ user: await first(c.env.DB, 'SELECT * FROM users WHERE id = ?', u.id) });
});

// Workspaces, matters, members
admin.get('/workspaces', async c => { const t = c.req.query('tenant'); return c.json({ items: t ? await all(c.env.DB, 'SELECT * FROM workspaces WHERE tenant_id = ? ORDER BY name', t) : await all(c.env.DB, 'SELECT w.*, t.name AS tenant FROM workspaces w JOIN tenants t ON t.id = w.tenant_id ORDER BY t.name, w.name') }); });
admin.post('/workspaces', async c => {
  const b = z.object({ tenantId: z.string(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() }).parse(await c.req.json());
  const id = shortId(12);
  await run(c.env.DB, 'INSERT INTO workspaces (id, tenant_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)', id, b.tenantId, b.name, b.description || null, Date.now());
  await receipt(c.env.DB, b.tenantId, 'workspace.created', id, { name: b.name });
  return c.json({ workspace: await first(c.env.DB, 'SELECT * FROM workspaces WHERE id = ?', id) });
});
admin.get('/workspaces/:id', async c => {
  const w = await first<{ id: string; tenant_id: string }>(c.env.DB, 'SELECT * FROM workspaces WHERE id = ?', c.req.param('id')); if (!w) throw new HttpError(404, 'No such workspace');
  const [matters, members, shards, boxes, batches, requests] = await Promise.all([
    all(c.env.DB, 'SELECT * FROM matters WHERE workspace_id = ? ORDER BY name', w.id),
    all(c.env.DB, 'SELECT m.*, u.email, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?', w.id),
    listShards(c.env, w.id),
    all(c.env.DB, 'SELECT * FROM boxes WHERE workspace_id = ? ORDER BY barcode LIMIT 500', w.id),
    all(c.env.DB, 'SELECT * FROM batches WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', w.id),
    all(c.env.DB, 'SELECT r.*, f.label AS folder, b.label AS box FROM scan_requests r LEFT JOIN folders f ON f.id = r.folder_id LEFT JOIN boxes b ON b.id = r.box_id WHERE r.workspace_id = ? ORDER BY r.created_at DESC LIMIT 200', w.id),
  ]);
  const stats = await Promise.all(shards.map(s => shardStub(c.env, s.workspace_id, s.n).stats().catch(() => null)));
  return c.json({ workspace: w, matters, members, shards: shards.map((s, i) => ({ ...s, live: stats[i] })), boxes, batches, requests });
});
admin.post('/matters', async c => {
  const b = z.object({ workspaceId: z.string(), name: z.string().trim().min(1).max(200), caption: z.string().trim().max(300).optional(), court: z.string().trim().max(200).optional() }).parse(await c.req.json());
  const w = await first<{ tenant_id: string }>(c.env.DB, 'SELECT tenant_id FROM workspaces WHERE id = ?', b.workspaceId); if (!w) throw new HttpError(404, 'No such workspace');
  const id = uid();
  await run(c.env.DB, 'INSERT INTO matters (id, workspace_id, name, caption, court, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, b.workspaceId, b.name, b.caption || null, b.court || null, 'open', Date.now());
  await receipt(c.env.DB, w.tenant_id, 'matter.created', id, { workspaceId: b.workspaceId, name: b.name });
  return c.json({ matter: await first(c.env.DB, 'SELECT * FROM matters WHERE id = ?', id) });
});
admin.post('/members', async c => {
  const b = z.object({ workspaceId: z.string(), userId: z.string(), role: z.enum(['owner', 'admin', 'contributor', 'reviewer', 'viewer']).default('viewer') }).parse(await c.req.json());
  await run(c.env.DB, 'INSERT INTO members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role', uid(), b.workspaceId, b.userId, b.role, Date.now());
  return c.json({ ok: true });
});
admin.delete('/members/:workspaceId/:userId', async c => { await run(c.env.DB, 'DELETE FROM members WHERE workspace_id = ? AND user_id = ?', c.req.param('workspaceId'), c.req.param('userId')); return c.json({ ok: true }); });

// Paper inventory
admin.post('/boxes', async c => {
  const Box = z.object({ barcode: z.string().trim().min(1).max(64), label: z.string().trim().min(1).max(300), custodian: z.string().trim().max(200).optional(), dateFrom: z.string().trim().max(20).optional(), dateTo: z.string().trim().max(20).optional(), location: z.string().trim().max(200).optional(), pagesEst: z.number().int().nonnegative().optional(), notes: z.string().trim().max(1000).optional(), matterId: z.string().optional(), folders: z.array(z.object({ barcode: z.string().trim().min(1).max(64), label: z.string().trim().min(1).max(300), pagesEst: z.number().int().nonnegative().optional() })).max(500).optional() });
  const b = z.object({ workspaceId: z.string(), boxes: z.array(Box).min(1).max(200) }).parse(await c.req.json());
  const w = await first<{ tenant_id: string }>(c.env.DB, 'SELECT tenant_id FROM workspaces WHERE id = ?', b.workspaceId); if (!w) throw new HttpError(404, 'No such workspace');
  let boxes = 0, folders = 0;
  for (const bx of b.boxes) {
    const id = uid();
    await run(c.env.DB, 'INSERT INTO boxes (id, workspace_id, matter_id, barcode, label, custodian, date_from, date_to, location, status, folder_count, pages_est, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, barcode) DO UPDATE SET label = excluded.label, custodian = excluded.custodian, date_from = excluded.date_from, date_to = excluded.date_to, location = excluded.location, pages_est = excluded.pages_est, notes = excluded.notes',
      id, b.workspaceId, bx.matterId || null, bx.barcode, bx.label, bx.custodian || null, bx.dateFrom || null, bx.dateTo || null, bx.location || null, 'inventoried', (bx.folders || []).length, bx.pagesEst ?? null, bx.notes || null, Date.now());
    const row = await first<{ id: string }>(c.env.DB, 'SELECT id FROM boxes WHERE workspace_id = ? AND barcode = ?', b.workspaceId, bx.barcode);
    boxes++;
    for (const f of bx.folders || []) {
      await run(c.env.DB, 'INSERT INTO folders (id, workspace_id, box_id, barcode, label, status, pages_est, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, barcode) DO UPDATE SET label = excluded.label, pages_est = excluded.pages_est', uid(), b.workspaceId, row!.id, f.barcode, f.label, 'paper', f.pagesEst ?? null, Date.now());
      folders++;
    }
  }
  const paper = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM folders WHERE workspace_id = ? AND status IN ('paper','requested','scanning')`, b.workspaceId);
  await run(c.env.DB, 'UPDATE workspaces SET paper_folders = ? WHERE id = ?', paper?.n || 0, b.workspaceId);
  await receipt(c.env.DB, w.tenant_id, 'inventory.added', b.workspaceId, { boxes, folders });
  return c.json({ boxes, folders });
});
admin.get('/boxes/:id', async c => {
  const box = await first(c.env.DB, 'SELECT * FROM boxes WHERE id = ?', c.req.param('id')); if (!box) throw new HttpError(404, 'No such box');
  return c.json({ box, folders: await all(c.env.DB, 'SELECT * FROM folders WHERE box_id = ? ORDER BY barcode', c.req.param('id')) });
});
admin.patch('/folders/:id', async c => {
  const b = z.object({ status: z.enum(['paper', 'requested', 'scanning', 'digitised']) }).parse(await c.req.json());
  const f = await first<{ id: string; workspace_id: string }>(c.env.DB, 'SELECT id, workspace_id FROM folders WHERE id = ?', c.req.param('id')); if (!f) throw new HttpError(404, 'No such folder');
  await run(c.env.DB, 'UPDATE folders SET status = ? WHERE id = ?', b.status, f.id);
  const paper = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM folders WHERE workspace_id = ? AND status IN ('paper','requested','scanning')`, f.workspace_id);
  await run(c.env.DB, 'UPDATE workspaces SET paper_folders = ? WHERE id = ?', paper?.n || 0, f.workspace_id);
  return c.json({ ok: true });
});
admin.post('/scan-requests', async c => {
  const b = z.object({ workspaceId: z.string(), folderId: z.string().optional(), boxId: z.string().optional(), note: z.string().max(500).optional() }).parse(await c.req.json());
  const w = await first<{ tenant_id: string }>(c.env.DB, 'SELECT tenant_id FROM workspaces WHERE id = ?', b.workspaceId); if (!w) throw new HttpError(404, 'No such workspace');
  return c.json(await requestScan(c.env, { workspaceId: b.workspaceId, folderId: b.folderId || null, boxId: b.boxId || null, requestedBy: 'staff', via: 'vault', note: b.note || null, tenantId: w.tenant_id }));
});
admin.patch('/scan-requests/:id', async c => {
  const b = z.object({ status: z.enum(['requested', 'scanning', 'done', 'declined']) }).parse(await c.req.json());
  const r = await first<{ id: string; folder_id: string | null; workspace_id: string }>(c.env.DB, 'SELECT id, folder_id, workspace_id FROM scan_requests WHERE id = ?', c.req.param('id')); if (!r) throw new HttpError(404, 'No such request');
  await run(c.env.DB, 'UPDATE scan_requests SET status = ?, done_at = ? WHERE id = ?', b.status, b.status === 'done' || b.status === 'declined' ? Date.now() : null, r.id);
  if (r.folder_id) await run(c.env.DB, 'UPDATE folders SET status = ? WHERE id = ?', b.status === 'scanning' ? 'scanning' : b.status === 'done' ? 'digitised' : 'paper', r.folder_id);
  const paper = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM folders WHERE workspace_id = ? AND status IN ('paper','requested','scanning')`, r.workspace_id);
  await run(c.env.DB, 'UPDATE workspaces SET paper_folders = ? WHERE id = ?', paper?.n || 0, r.workspace_id);
  return c.json({ ok: true });
});

// Batches (staff-side; the uploader uses the batch key on /api/intake)
admin.post('/batches', async c => {
  const b = z.object({ workspaceId: z.string(), matterId: z.string().optional(), folderId: z.string().optional(), kind: z.enum(['electronic', 'scan', 'app']).default('electronic'), name: z.string().trim().min(1).max(200) }).parse(await c.req.json());
  const w = await first<{ tenant_id: string }>(c.env.DB, 'SELECT tenant_id FROM workspaces WHERE id = ?', b.workspaceId); if (!w) throw new HttpError(404, 'No such workspace');
  const batch = await createBatch(c.env, { tenantId: w.tenant_id, workspaceId: b.workspaceId, matterId: b.matterId || null, folderId: b.folderId || null, kind: b.kind, name: b.name, createdBy: 'staff' });
  const key = randomToken(24);
  await run(c.env.DB, 'UPDATE batches SET intake_key_hash = ? WHERE id = ?', await hashToken(key), batch.id);
  return c.json({ batch, intakeKey: key, intakeUrl: `${c.env.APP_BASE_URL}/api/intake/batches/${batch.id}` });
});
admin.get('/batches/:id', async c => {
  const batch = await getBatch(c.env, c.req.param('id')); if (!batch) throw new HttpError(404, 'No such batch');
  const dead = await all(c.env.DB, 'SELECT * FROM dead_letters WHERE batch_id = ? ORDER BY created_at DESC LIMIT 100', batch.id);
  return c.json({ batch, deadLetters: dead });
});
admin.post('/batches/:id/seal', async c => { const batch = await getBatch(c.env, c.req.param('id')); if (!batch) throw new HttpError(404, 'No such batch'); return c.json(await sealBatch(c.env, batch)); });
admin.post('/batches/:id/manifest', async c => { const batch = await getBatch(c.env, c.req.param('id')); if (!batch) throw new HttpError(404, 'No such batch'); const b = z.object({ files: z.array(z.object({ path: z.string(), size: z.number(), sha256: z.string() })).max(50000) }).parse(await c.req.json()); return c.json(await setManifest(c.env, batch, b.files)); });
admin.put('/batches/:id/files', async c => {
  const batch = await getBatch(c.env, c.req.param('id')); if (!batch) throw new HttpError(404, 'No such batch');
  return c.json(await receiveFile(c.env, batch, { path: c.req.query('path') || '', name: c.req.query('name') || undefined, claimedSha256: c.req.query('sha256') || null, bytes: new Uint8Array(await c.req.arrayBuffer()), matterId: c.req.query('matter') || null, folderId: c.req.query('folder') || null }));
});

// Documents and search
admin.get('/workspaces/:id/documents', async c => {
  const wsId = c.req.param('id'); const limit = Math.min(200, +(c.req.query('limit') || 50)); const offset = +(c.req.query('offset') || 0);
  const shards = await listShards(c.env, wsId);
  const filters = { matterId: c.req.query('matter') || null, batchId: c.req.query('batch') || null, status: c.req.query('status') || null, kind: c.req.query('kind') || null, folderId: c.req.query('folder') || null };
  const out: unknown[] = []; let total = 0;
  for (const s of [...shards].reverse()) { const r = await shardStub(c.env, s.workspace_id, s.n).list(filters, limit, offset); total += r.total; out.push(...r.docs); if (out.length >= limit) break; }
  return c.json({ items: out.slice(0, limit), total });
});
admin.get('/search', async c => {
  const wsId = c.req.query('workspace'); const q = c.req.query('q') || ''; if (!wsId || !q.trim()) throw new HttpError(400, 'workspace and q are required');
  const r = await searchWorkspaces(c.env, [wsId], q, { matterId: c.req.query('matter') || null, kind: c.req.query('kind') || null, witness: c.req.query('witness') || null }, Math.min(50, +(c.req.query('limit') || 20)));
  return c.json(r);
});
admin.get('/documents/:id', async c => {
  const d = await getDoc(c.env, c.req.param('id')); if (!d) throw new HttpError(404, 'No such document');
  const t = await loadText(c.env, d.sha256);
  const receipts = await all(c.env.DB, 'SELECT kind, at, hash FROM receipts WHERE subject = ? ORDER BY seq', d.id);
  return c.json({ doc: d, pages: (t?.pages || []).map(p => ({ page: p.page, chars: p.text.length, preview: p.text.slice(0, 240) })), ocr: t?.ocr || null, receipts, link: await signLink(c.env, d.id, null, 3600) });
});
admin.get('/documents/:id/text', async c => { const r = await readDocument(c.env, c.req.param('id'), +(c.req.query('from') || 0) || null, +(c.req.query('to') || 0) || null, 200_000); return c.json({ pages: r.pages, total: r.total, truncated: r.truncated }); });

// Connections, receipts, dead letters
admin.get('/connections', async c => { const t = c.req.query('tenant'); const sql = 'SELECT c.id, c.tenant_id, c.client, c.external_user, c.label, c.workspace_ids, c.status, c.created_at, c.last_used_at, c.revoked_at, u.email FROM connections c JOIN users u ON u.id = c.user_id' + (t ? ' WHERE c.tenant_id = ?' : '') + ' ORDER BY c.created_at DESC LIMIT 500'; return c.json({ items: t ? await all(c.env.DB, sql, t) : await all(c.env.DB, sql) }); });
admin.post('/connections/:id/revoke', async c => c.json({ ok: await revokeConnection(c.env, c.req.param('id'), 'staff') }));
admin.get('/receipts', async c => { const t = c.req.query('tenant'); if (!t) throw new HttpError(400, 'tenant is required'); return c.json({ items: await all(c.env.DB, 'SELECT id, seq, kind, subject, hash, prev_hash, detail, at FROM receipts WHERE tenant_id = ? ORDER BY seq DESC LIMIT ?', t, Math.min(500, +(c.req.query('limit') || 100))) }); });
admin.get('/receipts/verify', async c => { const t = c.req.query('tenant'); if (!t) throw new HttpError(400, 'tenant is required'); return c.json(await verifyChain(c.env.DB, t)); });
admin.get('/access-log', async c => { const t = c.req.query('tenant'); if (!t) throw new HttpError(400, 'tenant is required'); return c.json({ items: await all(c.env.DB, 'SELECT * FROM access_log WHERE tenant_id = ? ORDER BY at DESC LIMIT 300', t) }); });
admin.get('/dead-letters', async c => { const w = c.req.query('workspace'); return c.json({ items: w ? await all(c.env.DB, 'SELECT * FROM dead_letters WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 300', w) : await all(c.env.DB, 'SELECT * FROM dead_letters ORDER BY created_at DESC LIMIT 300') }); });
admin.post('/dead-letters/:id/retry', async c => {
  const dl = await first<{ id: string; doc_id: string; workspace_id: string; batch_id: string | null }>(c.env.DB, 'SELECT * FROM dead_letters WHERE id = ?', c.req.param('id')); if (!dl) throw new HttpError(404, 'No such entry');
  const d = await getDoc(c.env, dl.doc_id); if (!d) throw new HttpError(404, 'The document is gone');
  const w = await first<{ tenant_id: string }>(c.env.DB, 'SELECT tenant_id FROM workspaces WHERE id = ?', dl.workspace_id);
  await c.env.INTAKE.send({ docId: d.id, workspaceId: dl.workspace_id, tenantId: w?.tenant_id || '', batchId: dl.batch_id, sha256: d.sha256, name: d.name, size: d.size });
  await run(c.env.DB, 'DELETE FROM dead_letters WHERE id = ?', dl.id);
  if (dl.batch_id) await run(c.env.DB, 'UPDATE batches SET files_failed = MAX(0, files_failed - 1) WHERE id = ?', dl.batch_id);
  const p = parseDocId(d.id)!; await shardStub(c.env, p.workspaceId, p.n).setStatus(d.id, 'received', null);
  return c.json({ ok: true });
});

export type { BatchRow };
