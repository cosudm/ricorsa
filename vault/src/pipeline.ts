import type { Env, IntakeMessage } from './env';
import { run } from './db';
import { extract } from './extract';
import { classify, type Learned } from './extract/classify';
import { ocrProvider } from './extract/ocr';
import { origKey, textKey } from './intake';
import { receipt } from './receipts';
import { countIntoShard, parseDocId, refreshShardSize, shardStub } from './shards';
import type { Page } from './shard-do';
import { uid } from './util';

export type Outcome = { kind: 'done' } | { kind: 'requeue'; message: IntakeMessage; delaySeconds: number } | { kind: 'retry'; error: string } | { kind: 'failed'; error: string };

/** How long to keep polling an OCR operation before giving up on it. */
const OCR_MAX_WAIT_MS = 30 * 60_000;

/**
 * One file through the pipeline: read the bytes, get pages of text (from the file itself or from OCR), learn what
 * the document is, write the text next to the original, index the pages in the shard, count it, write the receipt.
 */
export async function processMessage(env: Env, msg: IntakeMessage): Promise<Outcome> {
  const p = parseDocId(msg.docId); if (!p) return { kind: 'failed', error: 'bad document id' };
  const shard = shardStub(env, p.workspaceId, p.n);
  const ocr = ocrProvider(env);

  if (msg.ocr) {
    if (Date.now() - msg.ocr.since > OCR_MAX_WAIT_MS) return await fail(env, msg, 'ocr', 'OCR did not finish in 30 minutes');
    const r = await ocr.poll(msg.ocr.operation);
    if (r.kind === 'pending') return { kind: 'requeue', message: msg, delaySeconds: 30 };
    if (r.kind === 'done') return await finish(env, msg, r.pages, undefined, undefined, { provider: r.provider, confidence: r.confidence });
    if (r.kind === 'failed') return await fail(env, msg, 'ocr', r.error);
    return await awaitingOcr(env, msg);
  }

  await shard.setStatus(msg.docId, 'processing');
  const obj = await env.FILES.get(origKey(p.workspaceId, msg.sha256));
  if (!obj) return await fail(env, msg, 'read', 'the original is missing from storage');
  const bytes = new Uint8Array(await obj.arrayBuffer());

  let ex;
  try { ex = await extract(msg.name, bytes); }
  catch (e) { return await fail(env, msg, 'extract', String((e as Error)?.message || e)); }

  if (ex.needsConversion) {
    await shard.setStatus(msg.docId, 'needs_conversion', ex.note || null);
    await receipt(env.DB, msg.tenantId, 'doc.kept', msg.docId, { batchId: msg.batchId, name: msg.name, note: ex.note || 'needs conversion' });
    if (msg.batchId) await run(env.DB, 'UPDATE batches SET files_done = files_done + 1 WHERE id = ?', msg.batchId);
    return { kind: 'done' };
  }
  if (ex.needsOcr) {
    const r = await ocr.start(bytes, obj.httpMetadata?.contentType || 'application/octet-stream', msg.name);
    if (r.kind === 'done') return await finish(env, msg, mergePages(ex.pages, r.pages), ex.grids, ex.date, { provider: r.provider, confidence: r.confidence });
    if (r.kind === 'pending') return { kind: 'requeue', message: { ...msg, ocr: { provider: r.provider, operation: r.operation, since: Date.now() } }, delaySeconds: 20 };
    if (r.kind === 'failed') return await fail(env, msg, 'ocr', r.error);
    return await awaitingOcr(env, msg, ex.pages);
  }
  return await finish(env, msg, ex.pages, ex.grids, ex.date, null);
}

/** A scan's own text layer (often partial) and the OCR pages, page by page: OCR wins where it has text. */
function mergePages(own: Page[], ocr: Page[]): Page[] {
  if (!own.length) return ocr;
  const byPage = new Map(own.map(p => [p.page, p.text]));
  for (const p of ocr) if (p.text) byPage.set(p.page, p.text);
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([page, text]) => ({ page, text }));
}

async function finish(env: Env, msg: IntakeMessage, pages: Page[], grids: string[][][] | undefined, date: string | null | undefined, ocrInfo: { provider: string; confidence: number | null } | null): Promise<Outcome> {
  const p = parseDocId(msg.docId)!;
  const shard = shardStub(env, p.workspaceId, p.n);
  const doc = await shard.get(msg.docId);
  if (!doc) return { kind: 'failed', error: 'document vanished from its shard' };
  const learned: Learned = classify(msg.name, doc.path, pages, grids);
  if (!learned.docDate && date) learned.docDate = date;
  await env.FILES.put(textKey(msg.sha256), JSON.stringify({ docId: msg.docId, sha256: msg.sha256, pages, ocr: ocrInfo, learned: { kind: learned.kind, witness: learned.witness, volume: learned.volume, docDate: learned.docDate, defendants: learned.defendants }, at: Date.now() }), { httpMetadata: { contentType: 'application/json' } });
  const r = await shard.index(msg.docId, pages, { kind: learned.kind, witness: learned.witness, docDate: learned.docDate, volume: learned.volume, defendants: learned.defendants, extra: ocrInfo ? { ...(learned.extra || {}), ocr: ocrInfo } : learned.extra });
  await countIntoShard(env, p.workspaceId, p.n, 0, r.pages);
  if (msg.batchId) await run(env.DB, 'UPDATE batches SET files_done = files_done + 1 WHERE id = ?', msg.batchId);
  await receipt(env.DB, msg.tenantId, 'doc.indexed', msg.docId, { batchId: msg.batchId, name: msg.name, sha256: msg.sha256, pages: r.pages, chars: r.chars, kind: learned.kind, witness: learned.witness, ocr: ocrInfo });
  if (Math.random() < 0.01) await refreshShardSize(env, p.workspaceId, p.n).catch(() => {});
  return { kind: 'done' };
}

async function awaitingOcr(env: Env, msg: IntakeMessage, ownPages: Page[] = []): Promise<Outcome> {
  const p = parseDocId(msg.docId)!;
  const shard = shardStub(env, p.workspaceId, p.n);
  if (ownPages.length) await shard.index(msg.docId, ownPages, {});
  await shard.setStatus(msg.docId, 'awaiting_ocr', 'No OCR provider is configured yet');
  if (msg.batchId) await run(env.DB, 'UPDATE batches SET files_awaiting_ocr = files_awaiting_ocr + 1 WHERE id = ?', msg.batchId);
  await receipt(env.DB, msg.tenantId, 'doc.awaiting_ocr', msg.docId, { batchId: msg.batchId, name: msg.name, sha256: msg.sha256 });
  return { kind: 'done' };
}

async function fail(env: Env, msg: IntakeMessage, stage: string, error: string): Promise<Outcome> {
  return { kind: 'retry', error: `${stage}: ${error}` };
}

/** After the last retry: park the file where it is visible, mark the document, count it against its batch. */
export async function deadLetter(env: Env, msg: IntakeMessage, error: string, attempts: number): Promise<void> {
  const p = parseDocId(msg.docId);
  if (p) await shardStub(env, p.workspaceId, p.n).setStatus(msg.docId, 'failed', error.slice(0, 500)).catch(() => {});
  await run(env.DB, 'INSERT INTO dead_letters (id, workspace_id, batch_id, doc_id, stage, error, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', uid(), msg.workspaceId, msg.batchId, msg.docId, error.split(':')[0] || 'process', error.slice(0, 2000), attempts, Date.now());
  if (msg.batchId) await run(env.DB, 'UPDATE batches SET files_failed = files_failed + 1 WHERE id = ?', msg.batchId);
  await receipt(env.DB, msg.tenantId, 'doc.failed', msg.docId, { batchId: msg.batchId, name: msg.name, error: error.slice(0, 300), attempts });
}
