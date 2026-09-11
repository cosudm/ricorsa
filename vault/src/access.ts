import type { Env } from './env';
import { all, first, jsonArray, run } from './db';
import { textKey } from './intake';
import { receipt } from './receipts';
import { getDoc, listShards, parseDocId, shardStub } from './shards';
import type { DocRow, Hit, SearchFilters } from './shard-do';
import { HttpError, hmacHex, sha256Hex, timingSafeEqual, truncate, twoBusinessDays, uid } from './util';

export type Conn = { id: string; tenant_id: string; user_id: string; client: string; external_user: string | null; label: string | null; workspace_ids: string; token_hash: string; status: string; created_at: number; last_used_at: number | null };
export type WorkspaceRow = { id: string; tenant_id: string; name: string; description: string | null; doc_count: number; page_count: number; paper_folders: number; created_at: number };
export type MatterRow = { id: string; workspace_id: string; name: string; caption: string | null; court: string | null; status: string; doc_count: number };

export async function hashToken(token: string): Promise<string> { return sha256Hex('vault-token:' + token); }

/** The connection behind a bearer token, or null. Touches last_used_at at most once a minute. */
export async function connectionFromRequest(env: Env, req: Request): Promise<Conn | null> {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth); if (!m) return null;
  const token = m[1].trim(); if (token.length < 20) return null;
  const conn = await first<Conn>(env.DB, `SELECT * FROM connections WHERE token_hash = ? AND status = 'active'`, await hashToken(token));
  if (!conn) return null;
  if (!conn.last_used_at || Date.now() - conn.last_used_at > 60_000) await run(env.DB, 'UPDATE connections SET last_used_at = ? WHERE id = ?', Date.now(), conn.id).catch(() => {});
  return conn;
}

export function scopeOf(conn: Conn): string[] { return jsonArray(conn.workspace_ids); }
export function inScope(conn: Conn, workspaceId: string): boolean { return scopeOf(conn).includes(workspaceId); }
export function assertDocInScope(conn: Conn, docId: string): { workspaceId: string; n: number } {
  const p = parseDocId(docId); if (!p || !inScope(conn, p.workspaceId)) throw new HttpError(404, 'No such document in the connected workspaces');
  return p;
}

export async function workspacesFor(env: Env, ids: string[]): Promise<Array<WorkspaceRow & { matters: MatterRow[]; tenant: string }>> {
  if (!ids.length) return [];
  const ws = await all<WorkspaceRow & { tenant: string }>(env.DB, `SELECT w.*, t.name AS tenant FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.id IN (${ids.map(() => '?').join(',')}) ORDER BY w.name`, ...ids);
  const matters = ws.length ? await all<MatterRow>(env.DB, `SELECT * FROM matters WHERE workspace_id IN (${ws.map(() => '?').join(',')}) ORDER BY name`, ...ws.map(w => w.id)) : [];
  return ws.map(w => ({ ...w, matters: matters.filter(m => m.workspace_id === w.id) }));
}

export type SearchHit = Hit & { workspaceId: string; snippet: string; matter: string | null; folder: string | null; box: string | null; onPaper: boolean };

/** Search several workspaces: every shard of each in parallel, merged by score, the best pages with a snippet each. */
export async function searchWorkspaces(env: Env, workspaceIds: string[], query: string, filters: SearchFilters, limit: number): Promise<{ hits: SearchHit[]; searched: number; mode: string }> {
  const shards = (await Promise.all(workspaceIds.map(id => listShards(env, id)))).flat();
  if (!shards.length) return { hits: [], searched: 0, mode: 'none' };
  const results = await Promise.all(shards.map(s => shardStub(env, s.workspace_id, s.n).search(query, filters, limit).then(r => ({ ws: s.workspace_id, ...r })).catch(e => { console.warn('shard search failed', s.id, String(e)); return { ws: s.workspace_id, hits: [] as Hit[], total: 0, mode: 'and' as const }; })));
  const modes = new Set(results.map(r => r.mode));
  const merged = results.flatMap(r => r.hits.map(h => ({ ...h, workspaceId: r.ws }))).sort((a, b) => a.score - b.score).slice(0, limit);
  const named = await nameThings(env, merged.map(h => h.matterId), merged.map(h => h.folderId), merged.map(h => h.boxId));
  const terms = queryTerms(query);
  const texts = new Map<string, Promise<PageText | null>>();
  const hits: SearchHit[] = [];
  for (const h of merged) {
    if (!texts.has(h.sha256)) texts.set(h.sha256, loadText(env, h.sha256));
    const t = await texts.get(h.sha256)!;
    const page = t?.pages.find(p => p.page === h.page);
    hits.push({ ...h, snippet: page ? snippet(page.text, terms) : '', matter: h.matterId ? named.matters.get(h.matterId) || null : null, folder: h.folderId ? named.folders.get(h.folderId) || null : null, box: h.boxId ? named.boxes.get(h.boxId) || null : null, onPaper: false });
  }
  return { hits, searched: shards.length, mode: modes.has('and') ? 'text' : modes.has('or') ? 'text (any word)' : 'file names' };
}

/** Paper that matches the words: folders and boxes still to be digitised, by their labels. */
export async function paperMatches(env: Env, workspaceIds: string[], query: string, limit = 5): Promise<Array<{ folderId: string | null; boxId: string; label: string; box: string; barcode: string; status: string; location: string | null; pagesEst: number | null; workspaceId: string }>> {
  const terms = queryTerms(query).slice(0, 6); if (!terms.length || !workspaceIds.length) return [];
  const ws = workspaceIds.map(() => '?').join(',');
  const like = terms.map(() => `(f.label LIKE ? OR b.label LIKE ? OR b.custodian LIKE ?)`).join(' OR ');
  const params = [...workspaceIds, ...terms.flatMap(t => [`%${t}%`, `%${t}%`, `%${t}%`])];
  const rows = await all<{ folderId: string | null; boxId: string; label: string; box: string; barcode: string; status: string; location: string | null; pagesEst: number | null; workspaceId: string }>(env.DB,
    `SELECT f.id AS folderId, b.id AS boxId, f.label AS label, b.label AS box, f.barcode AS barcode, f.status AS status, b.location AS location, f.pages_est AS pagesEst, f.workspace_id AS workspaceId
       FROM folders f JOIN boxes b ON b.id = f.box_id WHERE f.workspace_id IN (${ws}) AND f.status IN ('paper', 'requested', 'scanning') AND (${like}) LIMIT ?`, ...params, limit);
  return rows;
}

type PageText = { pages: Array<{ page: number; text: string }>; ocr?: { provider: string; confidence: number | null } | null };
export async function loadText(env: Env, sha256: string): Promise<PageText | null> {
  const o = await env.FILES.get(textKey(sha256)); if (!o) return null;
  try { return await o.json() as PageText; } catch { return null; }
}

/** The text of a document's pages (all, or a range), with the document itself. */
export async function readDocument(env: Env, docId: string, from?: number | null, to?: number | null, maxChars = 60_000): Promise<{ doc: DocRow; pages: Array<{ page: number; text: string }>; truncated: boolean; total: number }> {
  const doc = await getDoc(env, docId); if (!doc) throw new HttpError(404, 'No such document');
  const t = await loadText(env, doc.sha256);
  let pages = t?.pages || [];
  const total = pages.length;
  if (from || to) pages = pages.filter(p => (!from || p.page >= from) && (!to || p.page <= to));
  let used = 0; const out: Array<{ page: number; text: string }> = []; let truncated = false;
  for (const p of pages) { if (used + p.text.length > maxChars) { const room = maxChars - used; if (room > 200) out.push({ page: p.page, text: p.text.slice(0, room) + ' […]' }); truncated = true; break; } out.push(p); used += p.text.length; }
  return { doc, pages: out, truncated, total };
}

export async function signLink(env: Env, docId: string, page: number | null, ttlSeconds = 900): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacHex(env.LINK_SECRET || 'dev-link-secret', `${docId}:${exp}`);
  const u = new URL(`/v/${encodeURIComponent(docId)}`, env.APP_BASE_URL); u.searchParams.set('e', String(exp)); u.searchParams.set('s', sig); if (page) u.searchParams.set('p', String(page));
  return u.toString();
}
export async function verifyLink(env: Env, docId: string, exp: string | null, sig: string | null): Promise<boolean> {
  if (!exp || !sig || +exp < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(sig, await hmacHex(env.LINK_SECRET || 'dev-link-secret', `${docId}:${exp}`));
}

export async function logAccess(env: Env, conn: Conn | null, action: string, docId: string | null, detail: Record<string, unknown>, userId?: string | null): Promise<void> {
  const tenantId = conn?.tenant_id || (detail.tenantId as string) || '';
  if (!tenantId) return;
  await run(env.DB, 'INSERT INTO access_log (id, tenant_id, connection_id, user_id, action, doc_id, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', uid(), tenantId, conn?.id || null, userId || conn?.user_id || null, action, docId, JSON.stringify(detail).slice(0, 2000), Date.now()).catch(() => {});
}

export async function requestScan(env: Env, o: { workspaceId: string; folderId?: string | null; boxId?: string | null; requestedBy: string; via: 'vault' | 'ricorsa'; note?: string | null; tenantId: string }): Promise<{ id: string; dueAt: number; label: string }> {
  let label = '';
  if (o.folderId) {
    const f = await first<{ id: string; label: string; status: string; box_id: string }>(env.DB, 'SELECT id, label, status, box_id FROM folders WHERE id = ? AND workspace_id = ?', o.folderId, o.workspaceId);
    if (!f) throw new HttpError(404, 'No such folder');
    if (f.status === 'digitised') throw new HttpError(409, 'This folder is already digitised');
    label = f.label; o.boxId = f.box_id;
    if (f.status === 'paper') await run(env.DB, `UPDATE folders SET status = 'requested' WHERE id = ?`, f.id);
  } else if (o.boxId) {
    const b = await first<{ id: string; label: string }>(env.DB, 'SELECT id, label FROM boxes WHERE id = ? AND workspace_id = ?', o.boxId, o.workspaceId);
    if (!b) throw new HttpError(404, 'No such box'); label = b.label;
  } else throw new HttpError(400, 'Name a folder or a box');
  const id = uid(); const dueAt = twoBusinessDays();
  await run(env.DB, 'INSERT INTO scan_requests (id, workspace_id, folder_id, box_id, requested_by, via, note, status, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, o.workspaceId, o.folderId || null, o.boxId || null, o.requestedBy, o.via, truncate(o.note || '', 500) || null, 'requested', dueAt, Date.now());
  await receipt(env.DB, o.tenantId, 'scan.requested', id, { workspaceId: o.workspaceId, folderId: o.folderId || null, boxId: o.boxId || null, via: o.via, by: o.requestedBy, dueAt });
  return { id, dueAt, label };
}

async function nameThings(env: Env, matterIds: Array<string | null>, folderIds: Array<string | null>, boxIds: Array<string | null>) {
  const uniq = (a: Array<string | null>) => [...new Set(a.filter((x): x is string => !!x))];
  const m = uniq(matterIds), f = uniq(folderIds), b = uniq(boxIds);
  const [mr, fr, br] = await Promise.all([
    m.length ? all<{ id: string; name: string }>(env.DB, `SELECT id, name FROM matters WHERE id IN (${m.map(() => '?').join(',')})`, ...m) : [],
    f.length ? all<{ id: string; label: string; barcode: string }>(env.DB, `SELECT id, label, barcode FROM folders WHERE id IN (${f.map(() => '?').join(',')})`, ...f) : [],
    b.length ? all<{ id: string; label: string; barcode: string }>(env.DB, `SELECT id, label, barcode FROM boxes WHERE id IN (${b.map(() => '?').join(',')})`, ...b) : [],
  ]);
  return { matters: new Map(mr.map(r => [r.id, r.name])), folders: new Map(fr.map(r => [r.id, `${r.label} (${r.barcode})`])), boxes: new Map(br.map(r => [r.id, `${r.label} (${r.barcode})`])) };
}

export function queryTerms(q: string): string[] {
  const phrases: string[] = []; const rest = String(q || '').replace(/"([^"]{2,})"/g, (_, p) => { phrases.push(p.toLowerCase()); return ' '; });
  return [...phrases, ...rest.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3)].slice(0, 24);
}

/** A window of the page around the first words that match, collapsed to one line. */
export function snippet(text: string, terms: string[], width = 320): string {
  const t = text.replace(/\s+/g, ' ');
  const low = t.toLowerCase();
  let at = -1;
  for (const term of terms) { const i = low.indexOf(term); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return truncate(t, width);
  const start = Math.max(0, at - Math.floor(width / 3)); const end = Math.min(t.length, start + width);
  return (start > 0 ? '…' : '') + t.slice(start, end).trim() + (end < t.length ? '…' : '');
}
