import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { extOf, mimeFor } from '@/lib/files';
import { filesBucket } from '@/lib/storage';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Formats a browser could run scripts from get a sandboxing policy when opened directly (the viewer never lets them run anyway). */
const SANDBOXED = new Set(['.html', '.htm', '.svg', '.xml']);

/** One byte range from a Range header (`bytes=a-b`, `bytes=a-`, `bytes=-n`), or null for the whole file. */
function parseRange(h: string | null, size: number): { offset: number; length: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((h || '').trim());
  if (!m || size <= 0) return null;
  if (m[1] === '' && m[2] === '') return null;
  if (m[1] === '') { const n = Math.min(size, +m[2]); return n > 0 ? { offset: size - n, length: n } : null; }
  const start = +m[1]; if (start >= size) return null;
  const end = m[2] === '' ? size - 1 : Math.min(size - 1, +m[2]);
  return end >= start ? { offset: start, length: end - start + 1 } : null;
}

/**
 * GET /api/files/:id/content — the file exactly as it was uploaded, for the owner only. Served inline with the
 * media type its extension implies, so PDFs and images open in the browser's own viewers and the app's viewer
 * can fetch the bytes; `?download=1` saves it under its original name instead. Byte ranges are honoured so a
 * large PDF can be read progressively.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const row = (await db().select({ name: schema.attachments.name, size: schema.attachments.size, r2Key: schema.attachments.r2Key }).from(schema.attachments)
    .where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, user.id))).limit(1))[0];
  if (!row) return fail(404, 'That file is not in your account', 'not_found');
  if (!row.r2Key) return fail(404, 'Only the text of this file was kept; attach it again to open it here', 'not_stored');
  const bucket = filesBucket();
  if (!bucket) return fail(503, 'File storage is not available right now', 'storage_unavailable');

  const range = parseRange(req.headers.get('range'), row.size);
  let obj = null;
  try { obj = await bucket.get(row.r2Key, range ? { range } : undefined); }
  catch { obj = await bucket.get(row.r2Key); } // an unsatisfiable range: answer with the whole file
  if (!obj) return fail(404, 'The stored copy of this file is gone', 'not_found');

  const url = new URL(req.url);
  const download = url.searchParams.get('download') === '1';
  const ascii = row.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const headers = new Headers({
    'Content-Type': mimeFor(row.name),
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Accept-Ranges': 'bytes',
    'ETag': obj.httpEtag,
  });
  if (SANDBOXED.has(extOf(row.name))) headers.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  let status = 200;
  const r = obj.range as { offset?: number; length?: number } | undefined;
  if (range && r && r.offset !== undefined) {
    const length = r.length !== undefined ? r.length : obj.size - r.offset;
    status = 206;
    headers.set('Content-Range', `bytes ${r.offset}-${r.offset + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
  } else headers.set('Content-Length', String(obj.size));
  return new Response(obj.body as unknown as ReadableStream, { status, headers });
});
