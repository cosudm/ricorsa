import type { Env } from './env';
import { all, first, run } from './db';
import { receipt } from './receipts';
import { makeDocId, openShard, shardStub, countIntoShard } from './shards';
import { HttpError, mimeFor, sha256Hex, uid } from './util';

export type BatchRow = {
  id: string; tenant_id: string; workspace_id: string; matter_id: string | null; folder_id: string | null; kind: string; name: string; status: string;
  files_expected: number; files_received: number; files_duplicate: number; files_done: number; files_failed: number; files_awaiting_ocr: number; bytes: number;
  manifest_key: string | null; seal: string | null; created_by: string | null; created_at: number; sealed_at: number | null; done_at: number | null;
};
export type ManifestFile = { path: string; size: number; sha256: string };

export const origKey = (workspaceId: string, sha256: string) => `orig/${workspaceId}/${sha256}`;
export const textKey = (sha256: string) => `text/${sha256}.json`;

export async function createBatch(env: Env, o: { tenantId: string; workspaceId: string; matterId?: string | null; folderId?: string | null; kind?: string; name: string; createdBy?: string | null }): Promise<BatchRow> {
  const id = uid();
  await run(env.DB, 'INSERT INTO batches (id, tenant_id, workspace_id, matter_id, folder_id, kind, name, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, o.tenantId, o.workspaceId, o.matterId || null, o.folderId || null, o.kind || 'electronic', o.name, 'open', o.createdBy || null, Date.now());
  await receipt(env.DB, o.tenantId, 'batch.opened', id, { workspaceId: o.workspaceId, matterId: o.matterId || null, folderId: o.folderId || null, kind: o.kind || 'electronic', name: o.name });
  return (await getBatch(env, id))!;
}

export async function getBatch(env: Env, id: string): Promise<BatchRow | null> {
  return first<BatchRow>(env.DB, 'SELECT * FROM batches WHERE id = ?', id);
}

/** Record what a delivery is going to contain and say which files are already held, so the uploader can skip them. */
export async function setManifest(env: Env, batch: BatchRow, files: ManifestFile[]): Promise<{ expected: number; known: Record<string, string> }> {
  if (batch.status !== 'open') throw new HttpError(409, 'This batch is sealed; open a new one');
  const clean = files.map(f => ({ path: String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 1000), size: Math.max(0, Math.floor(+f.size || 0)), sha256: String(f.sha256 || '').toLowerCase() }))
    .filter(f => f.path && /^[0-9a-f]{64}$/.test(f.sha256));
  if (!clean.length) throw new HttpError(400, 'The manifest lists no files with a path and a sha256');
  await env.FILES.put(`manifests/${batch.id}.json`, JSON.stringify({ batchId: batch.id, workspaceId: batch.workspace_id, files: clean, at: Date.now() }), { httpMetadata: { contentType: 'application/json' } });
  const dir = env.HASHDIR.get(env.HASHDIR.idFromName(batch.workspace_id));
  const known = await dir.known([...new Set(clean.map(f => f.sha256))]);
  const dupes = clean.filter(f => known[f.sha256]);
  await run(env.DB, 'UPDATE batches SET files_expected = ?, manifest_key = ?, files_received = files_received + ?, files_duplicate = files_duplicate + ? WHERE id = ?', clean.length, `manifests/${batch.id}.json`, dupes.length, dupes.length, batch.id);
  await receipt(env.DB, batch.tenant_id, 'batch.manifest', batch.id, { files: clean.length, bytes: clean.reduce((n, f) => n + f.size, 0), manifestSha256: await sha256Hex(JSON.stringify(clean)), alreadyHeld: dupes.length, alreadyHeldSha256: dupes.slice(0, 500).map(f => f.sha256) });
  return { expected: clean.length, known };
}

export type Received = { docId: string; duplicate: boolean; sha256: string; queued: boolean };

/**
 * Take one file into the Vault: hash it, keep the bytes exactly as received (content-addressed, so a duplicate
 * shares its bytes), claim the hash in the workspace's directory, register the document in the open shard and
 * queue it for reading. Nothing here alters the bytes.
 */
export async function receiveFile(env: Env, batch: BatchRow, o: { path: string; name?: string; claimedSha256?: string | null; bytes: Uint8Array; matterId?: string | null; folderId?: string | null }): Promise<Received> {
  if (batch.status !== 'open') throw new HttpError(409, 'This batch is sealed; open a new one');
  const path = String(o.path || '').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 1000);
  const name = (o.name || path.split('/').pop() || 'file').slice(0, 300);
  if (!name) throw new HttpError(400, 'A file needs a name');
  const sha256 = await sha256Hex(o.bytes);
  if (o.claimedSha256 && o.claimedSha256.toLowerCase() !== sha256) throw new HttpError(400, `The file's hash does not match the manifest (got ${sha256.slice(0, 12)}, expected ${o.claimedSha256.slice(0, 12)})`, 'hash_mismatch');

  const key = origKey(batch.workspace_id, sha256);
  const head = await env.FILES.head(key);
  if (!head) await env.FILES.put(key, o.bytes, { httpMetadata: { contentType: mimeFor(name), contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` }, customMetadata: { name, batch: batch.id, sha256 } });

  const shard = await openShard(env, batch.workspace_id);
  const docId = makeDocId(batch.workspace_id, shard.n);
  const dir = env.HASHDIR.get(env.HASHDIR.idFromName(batch.workspace_id));
  const claim = await dir.claim(sha256, docId);
  if (claim.existing) {
    await run(env.DB, 'UPDATE batches SET files_received = files_received + 1, files_duplicate = files_duplicate + 1 WHERE id = ?', batch.id);
    await receipt(env.DB, batch.tenant_id, 'file.duplicate', claim.existing, { batchId: batch.id, path, name, sha256, size: o.bytes.byteLength });
    return { docId: claim.existing, duplicate: true, sha256, queued: false };
  }

  const folderId = o.folderId || batch.folder_id || null;
  let boxId: string | null = null;
  if (folderId) { const f = await first<{ box_id: string }>(env.DB, 'SELECT box_id FROM folders WHERE id = ?', folderId); boxId = f?.box_id || null; }
  await shardStub(env, batch.workspace_id, shard.n).register({
    id: docId, workspaceId: batch.workspace_id, matterId: o.matterId || batch.matter_id || null, folderId, boxId, batchId: batch.id,
    name, path, mime: mimeFor(name), size: o.bytes.byteLength, sha256,
  });
  await countIntoShard(env, batch.workspace_id, shard.n, 1, 0);
  await run(env.DB, 'UPDATE batches SET files_received = files_received + 1, bytes = bytes + ? WHERE id = ?', o.bytes.byteLength, batch.id);
  if (folderId) await run(env.DB, 'UPDATE folders SET doc_count = doc_count + 1 WHERE id = ?', folderId);
  if (o.matterId || batch.matter_id) await run(env.DB, 'UPDATE matters SET doc_count = doc_count + 1 WHERE id = ?', o.matterId || batch.matter_id);
  await receipt(env.DB, batch.tenant_id, 'file.received', docId, { batchId: batch.id, path, name, sha256, size: o.bytes.byteLength, shard: shard.n });
  await env.INTAKE.send({ docId, workspaceId: batch.workspace_id, tenantId: batch.tenant_id, batchId: batch.id, sha256, name, size: o.bytes.byteLength });
  return { docId, duplicate: false, sha256, queued: true };
}

/** Close a batch: the seal is a hash over every file hash it delivered, in order, written to the receipt chain. */
export async function sealBatch(env: Env, batch: BatchRow): Promise<{ seal: string; files: number; missing: string[] }> {
  if (batch.status !== 'open') throw new HttpError(409, 'This batch is already sealed');
  let hashes: string[] = []; let missing: string[] = [];
  if (batch.manifest_key) {
    const m = await env.FILES.get(batch.manifest_key);
    const manifest = m ? (await m.json() as { files: ManifestFile[] }) : { files: [] };
    hashes = manifest.files.map(f => f.sha256).sort();
    const have = new Set((await all<{ sha256: string }>(env.DB, `SELECT json_extract(detail, '$.detail.sha256') AS sha256 FROM receipts WHERE kind IN ('file.received', 'file.duplicate') AND json_extract(detail, '$.detail.batchId') = ?`, batch.id)).map(r => r.sha256));
    const dir = env.HASHDIR.get(env.HASHDIR.idFromName(batch.workspace_id));
    const held = await dir.known([...new Set(manifest.files.map(f => f.sha256))]);
    missing = manifest.files.filter(f => !have.has(f.sha256) && !held[f.sha256]).map(f => f.path);
  } else {
    hashes = (await all<{ sha256: string }>(env.DB, `SELECT json_extract(detail, '$.detail.sha256') AS sha256 FROM receipts WHERE kind IN ('file.received', 'file.duplicate') AND json_extract(detail, '$.detail.batchId') = ?`, batch.id)).map(r => r.sha256).filter(Boolean).sort();
  }
  const seal = await sha256Hex(hashes.join('\n'));
  await run(env.DB, `UPDATE batches SET status = 'sealed', seal = ?, sealed_at = ? WHERE id = ?`, seal, Date.now(), batch.id);
  await receipt(env.DB, batch.tenant_id, 'batch.sealed', batch.id, { seal, files: hashes.length, missing: missing.length, received: batch.files_received, duplicates: batch.files_duplicate });
  return { seal, files: hashes.length, missing };
}
