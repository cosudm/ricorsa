import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

/**
 * One per workspace: the hash of every file received, so a duplicate is recognised at intake wherever it turns
 * up in the archive. Millions of rows of (hash, document) fit comfortably in one object's SQLite storage.
 */
export class HashDirectory extends DurableObject<Env> {
  private ready = false;
  private ensure() {
    if (this.ready) return;
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS hashes (sha256 TEXT PRIMARY KEY, doc_id TEXT NOT NULL, at INTEGER NOT NULL)');
    this.ready = true;
  }

  /** Claim a hash for a document. Returns the document that already holds it when there is one. */
  claim(sha256: string, docId: string): { existing: string | null } {
    this.ensure();
    const row = this.ctx.storage.sql.exec('SELECT doc_id FROM hashes WHERE sha256 = ?', sha256).toArray()[0] as { doc_id: string } | undefined;
    if (row) return { existing: row.doc_id };
    this.ctx.storage.sql.exec('INSERT INTO hashes (sha256, doc_id, at) VALUES (?, ?, ?)', sha256, docId, Date.now());
    return { existing: null };
  }

  /** Which of these hashes are already held (the uploader skips them). */
  known(hashes: string[]): Record<string, string> {
    this.ensure();
    const out: Record<string, string> = {};
    for (let i = 0; i < hashes.length; i += 200) {
      const slice = hashes.slice(i, i + 200);
      const rows = this.ctx.storage.sql.exec(`SELECT sha256, doc_id FROM hashes WHERE sha256 IN (${slice.map(() => '?').join(',')})`, ...slice).toArray() as unknown as Array<{ sha256: string; doc_id: string }>;
      for (const r of rows) out[r.sha256] = r.doc_id;
    }
    return out;
  }

  lookup(sha256: string): string | null {
    this.ensure();
    const row = this.ctx.storage.sql.exec('SELECT doc_id FROM hashes WHERE sha256 = ?', sha256).toArray()[0] as { doc_id: string } | undefined;
    return row?.doc_id ?? null;
  }

  count(): number {
    this.ensure();
    return (this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM hashes').one() as { n: number }).n;
  }
}
