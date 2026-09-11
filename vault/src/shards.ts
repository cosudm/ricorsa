import type { Env } from './env';
import { all, first, run } from './db';
import { uid } from './util';
import type { DocRow, SearchShard } from './shard-do';

export type ShardRow = { id: string; workspace_id: string; n: number; docs: number; pages: number; bytes: number; status: string; created_at: number };

/** Document ids carry their workspace and shard: "<workspace>.<shard>.<id>", so any id can be routed without a directory. */
export function makeDocId(workspaceId: string, n: number): string { return `${workspaceId}.${n}.${uid()}`; }
export function parseDocId(docId: string): { workspaceId: string; n: number } | null {
  const m = /^([0-9a-z]+)\.(\d+)\.[0-9a-z]+$/.exec(String(docId || ''));
  return m ? { workspaceId: m[1], n: +m[2] } : null;
}

export function shardStub(env: Env, workspaceId: string, n: number): DurableObjectStub<SearchShard> {
  return env.SHARD.get(env.SHARD.idFromName(`${workspaceId}:${n}`));
}

export async function listShards(env: Env, workspaceId: string): Promise<ShardRow[]> {
  return all<ShardRow>(env.DB, 'SELECT * FROM shards WHERE workspace_id = ? ORDER BY n ASC', workspaceId);
}

/** The shard new documents go to, opening the next one when the current one is near its size. */
export async function openShard(env: Env, workspaceId: string): Promise<ShardRow> {
  const maxDocs = +(env.SHARD_MAX_DOCS || 800000); const maxBytes = +(env.SHARD_MAX_BYTES || 7e9);
  let row = await first<ShardRow>(env.DB, `SELECT * FROM shards WHERE workspace_id = ? AND status = 'open' ORDER BY n DESC LIMIT 1`, workspaceId);
  if (row && (row.docs >= maxDocs || row.bytes >= maxBytes)) {
    await run(env.DB, `UPDATE shards SET status = 'full' WHERE id = ?`, row.id);
    row = null;
  }
  if (!row) {
    const last = await first<{ n: number }>(env.DB, 'SELECT MAX(n) AS n FROM shards WHERE workspace_id = ?', workspaceId);
    const n = (last?.n || 0) + 1; const id = `${workspaceId}:${n}`;
    await run(env.DB, 'INSERT OR IGNORE INTO shards (id, workspace_id, n, status, created_at) VALUES (?, ?, ?, ?, ?)', id, workspaceId, n, 'open', Date.now());
    row = (await first<ShardRow>(env.DB, 'SELECT * FROM shards WHERE id = ?', id))!;
  }
  return row;
}

/** Count a document (and later its pages) against its shard and workspace. `bytes` is refreshed from the shard now and then. */
export async function countIntoShard(env: Env, workspaceId: string, n: number, docs: number, pages: number): Promise<void> {
  const id = `${workspaceId}:${n}`;
  await run(env.DB, 'UPDATE shards SET docs = docs + ?, pages = pages + ? WHERE id = ?', docs, pages, id);
  if (docs) await run(env.DB, 'UPDATE workspaces SET doc_count = doc_count + ? WHERE id = ?', docs, workspaceId);
  if (pages) await run(env.DB, 'UPDATE workspaces SET page_count = page_count + ? WHERE id = ?', pages, workspaceId);
}

export async function refreshShardSize(env: Env, workspaceId: string, n: number): Promise<void> {
  const s = await shardStub(env, workspaceId, n).stats();
  await run(env.DB, 'UPDATE shards SET bytes = ?, docs = ?, pages = ? WHERE id = ?', s.bytes, s.docs, s.pages, `${workspaceId}:${n}`);
}

/** Fetch one document by id from its shard (null when the id does not parse or the document is gone). */
export async function getDoc(env: Env, docId: string): Promise<DocRow | null> {
  const p = parseDocId(docId); if (!p) return null;
  const d = await shardStub(env, p.workspaceId, p.n).get(docId);
  return d && d.status !== 'removed' ? d : null;
}
