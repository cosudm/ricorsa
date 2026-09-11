import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

/**
 * A search shard: the documents of one slice of a workspace (about a million files) with a page-level FTS5
 * index, in SQLite next to its own compute. The text of the pages is not kept here (it lives in R2, keyed by the
 * file's hash); the index is contentless, so a shard stays well under the 10 GB an object may hold. A search
 * fans out to a workspace's shards in parallel and merges their best hits.
 */

export type DocMeta = {
  id: string; workspaceId: string; matterId: string | null; folderId: string | null; boxId: string | null; batchId: string | null;
  name: string; path: string | null; mime: string; size: number; sha256: string;
  kind?: string; witness?: string | null; docDate?: string | null; volume?: string | null; defendants?: string[] | null; extra?: Record<string, unknown> | null;
};
export type DocRow = {
  id: string; workspace_id: string; matter_id: string | null; folder_id: string | null; box_id: string | null; batch_id: string | null;
  name: string; path: string | null; mime: string; size: number; sha256: string; kind: string; pages: number; chars: number;
  witness: string | null; doc_date: string | null; volume: string | null; defendants: string | null; extra: string | null;
  status: string; error: string | null; created_at: number; indexed_at: number | null;
};
export type Page = { page: number; text: string };
export type SearchFilters = { matterId?: string | null; kind?: string | null; witness?: string | null; folderId?: string | null; boxId?: string | null; dateFrom?: string | null; dateTo?: string | null; docId?: string | null };
export type Hit = { docId: string; page: number; score: number; name: string; kind: string; matterId: string | null; folderId: string | null; boxId: string | null; witness: string | null; volume: string | null; docDate: string | null; pages: number; sha256: string; mime: string; size: number };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, matter_id TEXT, folder_id TEXT, box_id TEXT, batch_id TEXT,
  name TEXT NOT NULL, path TEXT, mime TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'document', pages INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0,
  witness TEXT, doc_date TEXT, volume TEXT, defendants TEXT, extra TEXT,
  status TEXT NOT NULL DEFAULT 'received', error TEXT, created_at INTEGER NOT NULL, indexed_at INTEGER
);
CREATE INDEX IF NOT EXISTS docs_matter ON docs(matter_id);
CREATE INDEX IF NOT EXISTS docs_folder ON docs(folder_id);
CREATE INDEX IF NOT EXISTS docs_batch ON docs(batch_id);
CREATE INDEX IF NOT EXISTS docs_kind ON docs(kind);
CREATE INDEX IF NOT EXISTS docs_status ON docs(status);
CREATE INDEX IF NOT EXISTS docs_name ON docs(name);
CREATE TABLE IF NOT EXISTS pages (rowid INTEGER PRIMARY KEY, doc_id TEXT NOT NULL, page INTEGER NOT NULL, chars INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS pages_doc ON pages(doc_id, page);
CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(body, content='', tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS name_fts USING fts5(name, content='', tokenize='unicode61');
CREATE TABLE IF NOT EXISTS name_rows (rowid INTEGER PRIMARY KEY, doc_id TEXT NOT NULL UNIQUE);
`;

export class SearchShard extends DurableObject<Env> {
  private ready = false;
  private ensure() {
    if (this.ready) return;
    this.ctx.storage.sql.exec(SCHEMA);
    this.ready = true;
  }

  /** Record a received file so it can be found by name and counted, before its text is read. */
  register(doc: DocMeta): { created: boolean } {
    this.ensure();
    const exists = this.ctx.storage.sql.exec('SELECT id FROM docs WHERE id = ?', doc.id).toArray().length > 0;
    if (exists) return { created: false };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO docs (id, workspace_id, matter_id, folder_id, box_id, batch_id, name, path, mime, size, sha256, kind, witness, doc_date, volume, defendants, extra, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        doc.id, doc.workspaceId, doc.matterId, doc.folderId, doc.boxId, doc.batchId, doc.name, doc.path, doc.mime, doc.size, doc.sha256,
        doc.kind || 'document', doc.witness ?? null, doc.docDate ?? null, doc.volume ?? null, doc.defendants ? JSON.stringify(doc.defendants) : null, doc.extra ? JSON.stringify(doc.extra) : null, 'received', Date.now());
      const r = this.ctx.storage.sql.exec('INSERT INTO name_rows (doc_id) VALUES (?) RETURNING rowid', doc.id).one() as { rowid: number };
      this.ctx.storage.sql.exec('INSERT INTO name_fts (rowid, name) VALUES (?, ?)', r.rowid, nameTokens(doc.name, doc.path));
    });
    return { created: true };
  }

  /** Index the text of a document's pages and record what was learned about it. Re-indexing replaces the pages. */
  index(docId: string, pages: Page[], learned: { kind?: string; witness?: string | null; docDate?: string | null; volume?: string | null; defendants?: string[] | null; extra?: Record<string, unknown> | null }): { pages: number; chars: number } {
    this.ensure();
    let chars = 0;
    this.ctx.storage.transactionSync(() => {
      // Contentless FTS rows cannot be deleted one by one; pages of an earlier run are orphaned by dropping their map rows,
      // and orphans are ignored at query time (the join to pages drops them).
      this.ctx.storage.sql.exec('DELETE FROM pages WHERE doc_id = ?', docId);
      for (const p of pages) {
        const text = (p.text || '').trim();
        chars += text.length;
        const r = this.ctx.storage.sql.exec('INSERT INTO pages (doc_id, page, chars) VALUES (?, ?, ?) RETURNING rowid', docId, p.page, text.length).one() as { rowid: number };
        if (text) this.ctx.storage.sql.exec('INSERT INTO page_fts (rowid, body) VALUES (?, ?)', r.rowid, text.slice(0, 200_000));
      }
      this.ctx.storage.sql.exec(
        `UPDATE docs SET pages = ?, chars = ?, status = 'indexed', error = NULL, indexed_at = ?,
           kind = COALESCE(?, kind), witness = COALESCE(?, witness), doc_date = COALESCE(?, doc_date), volume = COALESCE(?, volume),
           defendants = COALESCE(?, defendants), extra = COALESCE(?, extra) WHERE id = ?`,
        pages.length, chars, Date.now(), learned.kind ?? null, learned.witness ?? null, learned.docDate ?? null, learned.volume ?? null,
        learned.defendants ? JSON.stringify(learned.defendants) : null, learned.extra ? JSON.stringify(learned.extra) : null, docId);
    });
    return { pages: pages.length, chars };
  }

  setStatus(docId: string, status: string, error?: string | null): void {
    this.ensure();
    this.ctx.storage.sql.exec('UPDATE docs SET status = ?, error = ? WHERE id = ?', status, error ?? null, docId);
  }

  get(docId: string): DocRow | null {
    this.ensure();
    const rows = this.ctx.storage.sql.exec('SELECT * FROM docs WHERE id = ?', docId).toArray() as unknown as DocRow[];
    return rows[0] || null;
  }

  getMany(ids: string[]): DocRow[] {
    this.ensure();
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return this.ctx.storage.sql.exec(`SELECT * FROM docs WHERE id IN (${marks})`, ...ids).toArray() as unknown as DocRow[];
  }

  /** Full-text search over pages, best page per document first, with filters on what was learned about each document. */
  search(query: string, filters: SearchFilters, limit: number): { hits: Hit[]; total: number; mode: 'and' | 'or' | 'name' } {
    this.ensure();
    const { where, params } = filterSql(filters);
    const run = (match: string, mode: 'and' | 'or'): Hit[] => {
      const sql = `SELECT p.doc_id AS docId, p.page AS page, bm25(page_fts) AS score, d.name, d.kind, d.matter_id AS matterId, d.folder_id AS folderId, d.box_id AS boxId,
          d.witness, d.volume, d.doc_date AS docDate, d.pages, d.sha256, d.mime, d.size
        FROM page_fts JOIN pages p ON p.rowid = page_fts.rowid JOIN docs d ON d.id = p.doc_id
        WHERE page_fts MATCH ? AND d.status <> 'removed' ${where}
        ORDER BY score ASC LIMIT ?`;
      return this.ctx.storage.sql.exec(sql, match, ...params, Math.min(limit * 4, 400)).toArray() as unknown as Hit[];
    };
    let mode: 'and' | 'or' | 'name' = 'and';
    let rows: Hit[] = [];
    const m = matchExpr(query);
    if (m.and) { try { rows = run(m.and, 'and'); } catch { rows = []; } }
    if (!rows.length && m.or && m.or !== m.and) { mode = 'or'; try { rows = run(m.or, 'or'); } catch { rows = []; } }
    if (!rows.length && m.or) {
      // Nothing in the text: try file names (also what a folder of scans not yet OCR'd can be found by).
      mode = 'name';
      try {
        const sql = `SELECT d.id AS docId, 1 AS page, bm25(name_fts) AS score, d.name, d.kind, d.matter_id AS matterId, d.folder_id AS folderId, d.box_id AS boxId,
            d.witness, d.volume, d.doc_date AS docDate, d.pages, d.sha256, d.mime, d.size
          FROM name_fts JOIN name_rows n ON n.rowid = name_fts.rowid JOIN docs d ON d.id = n.doc_id
          WHERE name_fts MATCH ? AND d.status <> 'removed' ${where} ORDER BY score ASC LIMIT ?`;
        rows = this.ctx.storage.sql.exec(sql, m.or, ...params, Math.min(limit * 2, 200)).toArray() as unknown as Hit[];
      } catch { rows = []; }
    }
    // Best page per document; keep at most two pages of the same document so one long transcript does not fill the list.
    const perDoc = new Map<string, number>(); const hits: Hit[] = [];
    for (const r of rows) {
      const n = perDoc.get(r.docId) || 0; if (n >= 2) continue;
      perDoc.set(r.docId, n + 1); hits.push({ ...r, score: Number(r.score) });
      if (hits.length >= limit) break;
    }
    return { hits, total: rows.length, mode };
  }

  /** Documents of a folder, batch or matter, newest first. */
  list(filters: SearchFilters & { batchId?: string | null; status?: string | null }, limit: number, offset: number): { docs: DocRow[]; total: number } {
    this.ensure();
    const { where, params } = filterSql(filters);
    let extra = ''; const p2: unknown[] = [];
    if (filters.batchId) { extra += ' AND d.batch_id = ?'; p2.push(filters.batchId); }
    if (filters.status) { extra += ' AND d.status = ?'; p2.push(filters.status); }
    const total = (this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM docs d WHERE d.status <> 'removed' ${where}${extra}`, ...params, ...p2).one() as { n: number }).n;
    const docs = this.ctx.storage.sql.exec(`SELECT * FROM docs d WHERE d.status <> 'removed' ${where}${extra} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, ...params, ...p2, limit, offset).toArray() as unknown as DocRow[];
    return { docs, total };
  }

  stats(): { docs: number; indexed: number; awaiting: number; failed: number; pages: number; bytes: number } {
    this.ensure();
    const r = this.ctx.storage.sql.exec(`SELECT COUNT(*) AS docs, SUM(status = 'indexed') AS indexed, SUM(status IN ('received','processing','awaiting_ocr')) AS awaiting, SUM(status = 'failed') AS failed, COALESCE(SUM(pages), 0) AS pages FROM docs WHERE status <> 'removed'`).one() as { docs: number; indexed: number; awaiting: number; failed: number; pages: number };
    return { docs: r.docs || 0, indexed: r.indexed || 0, awaiting: r.awaiting || 0, failed: r.failed || 0, pages: r.pages || 0, bytes: this.ctx.storage.sql.databaseSize };
  }

  /** Counts per status and kind for a matter or a whole shard. */
  breakdown(matterId?: string | null): { kinds: Array<{ kind: string; n: number }>; statuses: Array<{ status: string; n: number }> } {
    this.ensure();
    const w = matterId ? ' AND matter_id = ?' : ''; const p = matterId ? [matterId] : [];
    const kinds = this.ctx.storage.sql.exec(`SELECT kind, COUNT(*) AS n FROM docs WHERE status <> 'removed'${w} GROUP BY kind ORDER BY n DESC`, ...p).toArray() as unknown as Array<{ kind: string; n: number }>;
    const statuses = this.ctx.storage.sql.exec(`SELECT status, COUNT(*) AS n FROM docs WHERE status <> 'removed'${w} GROUP BY status`, ...p).toArray() as unknown as Array<{ status: string; n: number }>;
    return { kinds, statuses };
  }

  remove(docId: string): void {
    this.ensure();
    this.ctx.storage.sql.exec(`UPDATE docs SET status = 'removed' WHERE id = ?`, docId);
  }
}

function filterSql(f: SearchFilters): { where: string; params: unknown[] } {
  let where = ''; const params: unknown[] = [];
  if (f.matterId) { where += ' AND d.matter_id = ?'; params.push(f.matterId); }
  if (f.kind) { where += ' AND d.kind = ?'; params.push(f.kind); }
  if (f.witness) { where += ' AND d.witness LIKE ?'; params.push('%' + f.witness + '%'); }
  if (f.folderId) { where += ' AND d.folder_id = ?'; params.push(f.folderId); }
  if (f.boxId) { where += ' AND d.box_id = ?'; params.push(f.boxId); }
  if (f.dateFrom) { where += ' AND d.doc_date >= ?'; params.push(f.dateFrom); }
  if (f.dateTo) { where += ' AND d.doc_date <= ?'; params.push(f.dateTo); }
  if (f.docId) { where += ' AND d.id = ?'; params.push(f.docId); }
  return { where, params };
}

/** Turn a person's words into FTS5 match expressions: quoted phrases kept, other words as terms (AND, and an OR fallback). */
export function matchExpr(q: string): { and: string | null; or: string | null } {
  const phrases: string[] = []; const rest = String(q || '').replace(/"([^"]{2,})"/g, (_, p) => { phrases.push(p); return ' '; });
  const words = rest.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2).slice(0, 24);
  const terms = [...phrases.map(p => '"' + p.replace(/"/g, '') + '"'), ...words.map(w => '"' + w + '"')];
  if (!terms.length) return { and: null, or: null };
  return { and: terms.join(' '), or: terms.join(' OR ') };
}

function nameTokens(name: string, path: string | null): string {
  const base = (path || name).replace(/[\\/]/g, ' ').replace(/[_\-.]+/g, ' ');
  return base + ' ' + name.replace(/[_\-.]+/g, ' ');
}
