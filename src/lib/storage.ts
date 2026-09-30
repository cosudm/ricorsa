/**
 * Object storage for uploaded files: Cloudflare R2 through the `FILES` binding declared in wrangler.jsonc.
 * Under `next dev` the binding is a local miniflare bucket kept in `.wrangler/state`. Every function here is
 * safe to call when the binding is missing: writes report false, reads return null, deletes do nothing, so the
 * rest of the app keeps working with the extracted text alone.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';

export function filesBucket(): R2Bucket | null {
  try {
    const { env } = getCloudflareContext();
    return (env as unknown as { FILES?: R2Bucket }).FILES || null;
  } catch { return null; }
}

/** Store a file as uploaded. Returns false when there is no bucket or the write failed (logged). */
export async function putFile(key: string, bytes: ArrayBuffer, contentType: string, name: string): Promise<boolean> {
  const bucket = filesBucket();
  if (!bucket) return false;
  try {
    await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { name: name.slice(0, 200) } });
    return true;
  } catch (e) {
    console.error('[storage] put failed', key, String((e as Error)?.message || e));
    return false;
  }
}

export async function getFile(key: string): Promise<R2ObjectBody | null> {
  const bucket = filesBucket();
  if (!bucket) return null;
  try { return await bucket.get(key); }
  catch (e) { console.error('[storage] get failed', key, String((e as Error)?.message || e)); return null; }
}

/** Remove objects, best effort, in the batches R2 accepts. Missing keys and nulls are ignored. */
export async function deleteFiles(keys: Array<string | null | undefined>): Promise<void> {
  const list = keys.filter((k): k is string => !!k);
  if (!list.length) return;
  const bucket = filesBucket();
  if (!bucket) return;
  for (let i = 0; i < list.length; i += 1000) {
    try { await bucket.delete(list.slice(i, i + 1000)); }
    catch (e) { console.error('[storage] delete failed', String((e as Error)?.message || e)); }
  }
}

/** Remove every object under a prefix (a turn's screenshots, an account's), best effort, page by page. */
export async function deletePrefix(prefix: string): Promise<void> {
  if (!prefix || prefix.length < 8) return;
  const bucket = filesBucket();
  if (!bucket) return;
  try {
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const page = await bucket.list({ prefix, cursor, limit: 1000 });
      if (page.objects.length) await bucket.delete(page.objects.map(o => o.key));
      if (!page.truncated) break;
      cursor = page.cursor;
    }
  } catch (e) { console.error('[storage] delete prefix failed', prefix, String((e as Error)?.message || e)); }
}
