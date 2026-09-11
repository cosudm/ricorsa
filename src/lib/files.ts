/**
 * Files attached to questions. A file is turned into text once, at upload. Plain text and code are read
 * directly; PDFs, Word, PowerPoint and Excel files are read here first (pdf.js for PDFs, the Office XML
 * inside the zip for the rest); anything that yields no text (a scanned PDF), an image, or an older binary
 * format goes through the model provider's file extraction service (Moonshot Files API, purpose
 * "file-extract", which also reads text out of images), and the upload there is deleted as soon as its
 * text is back. The text is kept on the thread it was used in, so a follow-up can still lean on it, and the
 * file itself is kept in object storage (src/lib/storage.ts) so it can be opened in the app's viewer.
 */
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { db, schema } from './db';
import { deleteFiles } from './storage';
import type { AttachmentMeta } from './db/schema';

/** What the picker offers and the server accepts (the extraction service reads all of these). */
export const ACCEPT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.rtf', '.epub', '.log', '.yaml', '.yml', '.ini', '.conf', '.toml',
  '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rb', '.rs', '.c', '.h', '.cpp', '.cs', '.php', '.sql', '.sh',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg'];
const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.log', '.yaml', '.yml', '.ini', '.conf', '.toml', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rb', '.rs', '.c', '.h', '.cpp', '.cs', '.php', '.sql', '.sh', '.svg']);
/** The most text kept from one file (about 100k tokens); the rest is dropped with a note. */
export const MAX_TEXT_CHARS = 400_000;
/** How much attached text one question may carry into the model, across all its files. */
export const PROMPT_BUDGET_CHARS = 160_000;
/** Pending uploads (never used in a question) are dropped after this long. */
const PENDING_TTL_MS = 24 * 3600_000;

export class FileError extends Error { constructor(public status: number, message: string, public code = 'file_error') { super(message); } }

export function extOf(name: string): string { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? '.' + m[1].toLowerCase() : ''; }
export function isAccepted(name: string): boolean { return ACCEPT.includes(extOf(name)); }
/** The media type a stored file is served with, decided by its extension (the browser's guess is not trusted for HTML, SVG or XML). */
const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Markdown and delimited text are served as plain text so "Open" shows them in a tab instead of downloading them.
  '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/plain', '.tsv': 'text/plain', '.json': 'application/json', '.xml': 'text/xml',
  '.html': 'text/html', '.htm': 'text/html', '.rtf': 'application/rtf', '.epub': 'application/epub+zip', '.log': 'text/plain', '.yaml': 'text/plain', '.yml': 'text/plain',
  '.ini': 'text/plain', '.conf': 'text/plain', '.toml': 'text/plain', '.js': 'text/javascript', '.ts': 'text/plain', '.tsx': 'text/plain', '.jsx': 'text/plain', '.py': 'text/plain',
  '.java': 'text/plain', '.go': 'text/plain', '.rb': 'text/plain', '.rs': 'text/plain', '.c': 'text/plain', '.h': 'text/plain', '.cpp': 'text/plain', '.cs': 'text/plain',
  '.php': 'text/plain', '.sql': 'text/plain', '.sh': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.svg': 'image/svg+xml',
};
export function mimeFor(name: string): string {
  const m = MIME[extOf(name)] || 'application/octet-stream';
  return /^text\/|json$|xml$/.test(m) ? m + '; charset=utf-8' : m;
}
const BINARY_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.epub', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);
/** Plain text by extension, or by a text MIME type when the extension is not a known binary format (Office MIME types mention "xml" but are zips). */
function isTextLike(name: string, type: string): boolean {
  const ext = extOf(name);
  if (BINARY_EXT.has(ext)) return false;
  return TEXT_EXT.has(ext) || /^text\//.test(type) || ['application/json', 'application/xml', 'application/javascript', 'application/x-yaml', 'application/yaml'].includes(type);
}

function apiBase(): string { return (process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, ''); }
function apiKey(): string { const k = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY; if (!k) throw new FileError(503, 'File reading is not configured', 'files_unconfigured'); return k; }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** The provider's file service is shared and sometimes busy: a 429 or 5xx is retried a couple of times before giving up. */
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
      console.warn('[files] provider busy', res.status, 'attempt', i + 1);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      console.warn('[files] provider unreachable', String((e as Error)?.message || e), 'attempt', i + 1);
      if (i === tries - 1) throw e;
    }
    if (i < tries - 1) await sleep(1500 * (i + 1));
  }
  return last as Response;
}

/** Text out of a document, spreadsheet, presentation, PDF or image, through the provider's extraction service. */
async function extractRemote(file: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('purpose', 'file-extract');
  const up = await fetchRetry(`${apiBase()}/files`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey()}` }, body: form, signal });
  if (!up.ok) {
    const body = await up.text().catch(() => '');
    let msg = ''; try { msg = (JSON.parse(body) as { error?: { message?: string } })?.error?.message || ''; } catch { /* not json */ }
    console.warn('[files] upload rejected', up.status, msg || body.slice(0, 200));
    if (up.status === 400 || up.status === 415 || /unsupported|not supported|type/i.test(msg)) throw new FileError(415, `This file could not be read (${msg || 'unsupported format'}).`, 'unsupported');
    if (up.status === 429 || /overloaded|busy/i.test(msg)) throw new FileError(503, 'The file reader is busy right now. Try again in a moment.', 'file_service_busy');
    throw new FileError(502, 'The file service did not accept the upload. Try again in a moment.', 'file_service');
  }
  const meta = await up.json() as { id?: string; status?: string; status_details?: string };
  if (!meta.id) throw new FileError(502, 'The file service returned no file id.', 'file_service');
  try {
    const res = await fetchRetry(`${apiBase()}/files/${meta.id}/content`, { headers: { Authorization: `Bearer ${apiKey()}` }, signal });
    const raw = await res.text();
    if (!res.ok) { console.warn('[files] content', res.status, raw.slice(0, 200)); throw new FileError(422, 'The file was uploaded but no text could be read from it.', 'unreadable'); }
    let text = raw;
    try { const j = JSON.parse(raw) as { content?: string; text?: string }; if (typeof j.content === 'string') text = j.content; else if (typeof j.text === 'string') text = j.text; } catch { /* plain text */ }
    return text;
  } finally {
    // Nothing stays with the provider: the upload is removed as soon as its text is back.
    fetch(`${apiBase()}/files/${meta.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey()}` } }).catch(() => {});
  }
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
}
function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** A PDF's text layer, page by page. Scanned PDFs come back nearly empty and fall through to the extraction service. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText: pdfExtract } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await pdfExtract(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text)]).map(t => String(t || '').trim());
  return tidy(pages.map((t, i) => pages.length > 1 ? `[Page ${i + 1}]\n${t}` : t).join('\n\n'));
}
/** Word: the paragraphs of word/document.xml. */
function docxText(zip: Record<string, Uint8Array>): string {
  const doc = zip['word/document.xml']; if (!doc) return '';
  const xml = strFromU8(doc);
  const body = xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n').replace(/<[^>]+>/g, '');
  return tidy(decodeXml(body));
}
/** PowerPoint: the text runs of each slide, in slide order. */
function pptxText(zip: Record<string, Uint8Array>): string {
  const slides = Object.keys(zip).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => +a.match(/(\d+)\.xml$/)![1] - +b.match(/(\d+)\.xml$/)![1]);
  return tidy(slides.map((k, i) => {
    const xml = strFromU8(zip[k]).replace(/<\/a:p>/g, '\n').replace(/<a:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
    return `[Slide ${i + 1}]\n${decodeXml(xml)}`;
  }).join('\n\n'));
}
/** Excel: every sheet as tab-separated rows, with shared strings resolved. */
function xlsxText(zip: Record<string, Uint8Array>): string {
  const shared: string[] = [];
  if (zip['xl/sharedStrings.xml']) for (const m of strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decodeXml(m[1].replace(/<[^>]+>/g, '')));
  const names: string[] = zip['xl/workbook.xml'] ? [...strFromU8(zip['xl/workbook.xml']).matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => decodeXml(m[1])) : [];
  const sheets = Object.keys(zip).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => +a.match(/(\d+)\.xml$/)![1] - +b.match(/(\d+)\.xml$/)![1]);
  const out: string[] = [];
  sheets.forEach((k, si) => {
    const xml = strFromU8(zip[k]); const lines: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Array<[number, string]> = [];
      for (const c of row[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]; const inner = c[2] || '';
        const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || ''; const type = (attrs.match(/\bt="(\w+)"/) || [])[1] || '';
        let v = '';
        if (type === 's') { const idx = +((inner.match(/<v>([^<]*)<\/v>/) || [])[1] || -1); v = shared[idx] ?? ''; }
        else if (type === 'inlineStr') v = decodeXml(inner.replace(/<[^>]+>/g, ''));
        else v = decodeXml((inner.match(/<v>([^<]*)<\/v>/) || [])[1] || '');
        let col = 0; for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
        if (v !== '') cells.push([col, v]);
      }
      if (cells.length) { cells.sort((a, b) => a[0] - b[0]); const max = cells[cells.length - 1][0]; const arr = new Array(max).fill(''); for (const [col, v] of cells) arr[col - 1] = v; lines.push(arr.join('\t')); }
      if (lines.length >= 5000) { lines.push('[more rows not shown]'); break; }
    }
    if (lines.length) out.push(`[Sheet: ${names[si] || k.replace(/^xl\/worksheets\//, '')}]\n${lines.join('\n')}`);
  });
  return tidy(out.join('\n\n'));
}
/** Office documents and PDFs read here, without any outside service. Returns '' when nothing readable is found. */
async function extractLocal(file: File, ext: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === '.pdf') return pdfText(bytes);
  const zip = unzipSync(bytes);
  if (ext === '.docx') return docxText(zip);
  if (ext === '.pptx') return pptxText(zip);
  if (ext === '.xlsx') return xlsxText(zip);
  return '';
}
const LOCAL_EXT = new Set(['.pdf', '.docx', '.pptx', '.xlsx']);
/** Enough real characters to count as read; below this a PDF is treated as scanned and sent for OCR. */
const MIN_LOCAL_CHARS = 40;

/** Read the file into text: directly for text and code, here for PDFs and Office files, through the extraction service for the rest. */
export async function extractText(file: File, signal?: AbortSignal): Promise<{ text: string; via: 'direct' | 'local' | 'moonshot' }> {
  if (!isAccepted(file.name)) throw new FileError(415, `Files of type "${extOf(file.name) || 'unknown'}" are not supported. Attach a PDF, Word, Excel or PowerPoint file, text, code or an image.`, 'unsupported');
  const ext = extOf(file.name);
  let text = ''; let via: 'direct' | 'local' | 'moonshot' = 'moonshot';
  if (isTextLike(file.name, file.type)) { text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer()); via = 'direct'; }
  else {
    if (LOCAL_EXT.has(ext)) {
      try { text = await extractLocal(file, ext); via = 'local'; }
      catch (e) { console.warn('[files] local read failed, using the file service', file.name, String((e as Error)?.message || e)); text = ''; }
    }
    if (text.replace(/\s+/g, '').length < MIN_LOCAL_CHARS) { text = await extractRemote(file, signal); via = 'moonshot'; }
  }
  text = text.replace(/\r\n?/g, '\n').replace(/ /g, '').trim();
  if (!text) throw new FileError(422, `No readable text was found in ${file.name}. If it is a scanned document, a clearer scan usually helps.`, 'empty');
  if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS) + `\n\n[The file continues; the first ${MAX_TEXT_CHARS.toLocaleString('en-US')} characters are kept.]`;
  return { text, via };
}

export function metaOf(row: { id: string; name: string; type: string; size: number; chars: number; r2Key?: string | null }): AttachmentMeta {
  return { id: row.id, name: row.name, type: row.type, size: row.size, chars: row.chars, stored: !!row.r2Key };
}

/** The person's attachments by id, optionally limited to those not yet used or used in one thread. */
export async function loadAttachments(userId: string, ids: string[], threadId?: string | null) {
  if (!ids.length) return [];
  const rows = await db().select().from(schema.attachments).where(and(eq(schema.attachments.userId, userId), inArray(schema.attachments.id, ids)));
  return rows.filter(r => !r.threadId || !threadId || r.threadId === threadId);
}

/** Tie pending uploads to the thread they were used in. */
export async function claimAttachments(ids: string[], threadId: string): Promise<void> {
  if (!ids.length) return;
  await db().update(schema.attachments).set({ threadId }).where(and(inArray(schema.attachments.id, ids), isNull(schema.attachments.threadId)));
}

/** Uploads nobody used within a day are dropped, rows and stored files (called from the upload route, best effort). */
export async function sweepPending(userId: string): Promise<void> {
  try {
    const gone = await db().delete(schema.attachments).where(and(eq(schema.attachments.userId, userId), isNull(schema.attachments.threadId), lt(schema.attachments.createdAt, new Date(Date.now() - PENDING_TTL_MS)))).returning({ r2Key: schema.attachments.r2Key });
    await deleteFiles(gone.map(g => g.r2Key));
  } catch { /* best effort */ }
}

/** Drop every attachment of a thread, rows and stored files (the thread itself is deleted by the caller). */
export async function deleteThreadAttachments(threadId: string): Promise<void> {
  const gone = await db().delete(schema.attachments).where(eq(schema.attachments.threadId, threadId)).returning({ r2Key: schema.attachments.r2Key });
  await deleteFiles(gone.map(g => g.r2Key));
}

/** The storage keys of everything a person uploaded, for account deletion (the rows go with the user row's cascade). */
export async function storageKeysFor(userId: string): Promise<string[]> {
  const rows = await db().select({ r2Key: schema.attachments.r2Key }).from(schema.attachments).where(eq(schema.attachments.userId, userId));
  return rows.map(r => r.r2Key).filter((k): k is string => !!k);
}

/**
 * The block of attached text the model reads, newest question's files first, within the budget. Each file
 * is fenced with its name so the model can refer to it. Returns '' when there is nothing.
 */
export function filesBlock(files: Array<{ name: string; text: string; chars: number; current: boolean }>): string {
  if (!files.length) return '';
  let budget = PROMPT_BUDGET_CHARS;
  const parts: string[] = [];
  for (const f of files) {
    if (budget <= 2000) break;
    let body = f.text;
    if (body.length > budget) body = body.slice(0, budget) + `\n[${f.name} continues beyond what fits here.]`;
    budget -= body.length;
    parts.push(`=== File: ${f.name}${f.current ? '' : ' (attached earlier in this conversation)'} ===\n${body}\n=== End of ${f.name} ===`);
  }
  return `Files the person attached. They are the primary material for the answer: read them fully, answer from them, refer to them by file name, and say plainly when they do not contain what was asked.\n\n${parts.join('\n\n')}`;
}
