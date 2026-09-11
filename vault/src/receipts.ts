import { canonical, now, sha256Hex, uid } from './util';
import { first, run } from './db';

/**
 * The receipt chain. Every event that matters to custody (a file received, a batch sealed, a document indexed, a
 * connection made, a read through a connection) is one line, hashed together with the line before it, per tenant.
 * Anyone holding the chain can re-verify it: change one line and every hash after it stops matching.
 */
export async function receipt(db: D1Database, tenantId: string, kind: string, subject: string | null, detail: Record<string, unknown>): Promise<{ id: string; seq: number; hash: string }> {
  const at = now();
  const body = canonical({ kind, subject, detail, at });
  // Read the head, then insert; the UNIQUE (tenant, seq) makes a lost race fail loudly rather than fork the chain.
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await first<{ seq: number; hash: string }>(db, 'SELECT seq, hash FROM receipts WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1', tenantId);
    const seq = (head?.seq ?? 0) + 1;
    const prev = head?.hash ?? null;
    const hash = await sha256Hex((prev || '') + body);
    const id = uid();
    try {
      await run(db, 'INSERT INTO receipts (id, tenant_id, seq, kind, subject, hash, prev_hash, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, tenantId, seq, kind, subject, hash, prev, body, at);
      return { id, seq, hash };
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error('receipt chain busy');
}

/** Walk a tenant's chain and confirm every hash. Returns the first broken sequence number, or null when intact. */
export async function verifyChain(db: D1Database, tenantId: string): Promise<{ ok: boolean; count: number; brokenAt: number | null }> {
  const rows = (await db.prepare('SELECT seq, hash, prev_hash, detail FROM receipts WHERE tenant_id = ? ORDER BY seq ASC').bind(tenantId).all<{ seq: number; hash: string; prev_hash: string | null; detail: string }>()).results || [];
  let prev: string | null = null;
  for (const r of rows) {
    const expect = await sha256Hex((prev || '') + r.detail);
    if (expect !== r.hash || (r.prev_hash || null) !== prev) return { ok: false, count: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
