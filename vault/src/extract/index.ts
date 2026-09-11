import type { Page } from '../shard-do';
import { extOf } from '../util';
import { docxPages, pptxPages, xlsxPages, unzip } from './office';
import { pdfPages } from './pdf';
import { decodeText, emlPages, paginate, tidy } from './text';

export type Extracted = {
  /** Pages of text; empty when the file needs OCR or cannot be read here. */
  pages: Page[];
  /** Cell grids of a spreadsheet, for typed readers. */
  grids?: string[][][];
  /** True when the bytes are an image or a scan: the text has to come from OCR. */
  needsOcr: boolean;
  /** True for formats this Worker cannot read (legacy .doc/.xls/.ppt, Outlook .msg): kept, named, and queued for conversion. */
  needsConversion: boolean;
  date?: string | null;
  note?: string;
};

const TEXT_EXT = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'html', 'htm', 'log', 'rtf']);
const IMAGE_EXT = new Set(['tif', 'tiff', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic']);
const LEGACY_EXT = new Set(['doc', 'xls', 'ppt', 'msg', 'wpd']);

/** Read a file into pages here, in the Worker, without any outside service. */
export async function extract(name: string, bytes: Uint8Array): Promise<Extracted> {
  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return { pages: [], needsOcr: true, needsConversion: false };
  if (LEGACY_EXT.has(ext)) return { pages: [], needsOcr: false, needsConversion: true, note: `${ext} files are kept as received and converted for reading in a later pass` };
  if (ext === 'pdf') {
    const r = await pdfPages(bytes);
    if (r.scanned) return { pages: r.pages.filter(p => p.text), needsOcr: true, needsConversion: false, note: `${r.pageCount} pages, no text layer` };
    return { pages: r.pages, needsOcr: false, needsConversion: false };
  }
  if (ext === 'eml') { const r = emlPages(decodeText(bytes)); return { pages: r.pages, needsOcr: false, needsConversion: false, date: r.date }; }
  if (TEXT_EXT.has(ext)) {
    let text = decodeText(bytes);
    if (ext === 'html' || ext === 'htm') text = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '');
    if (ext === 'rtf') text = rtfText(text);
    return { pages: paginate(text), needsOcr: false, needsConversion: false };
  }
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    let zip: Record<string, Uint8Array>;
    try { zip = unzip(bytes); } catch { return { pages: [], needsOcr: false, needsConversion: true, note: 'the file is not a readable Office package' }; }
    if (ext === 'docx') return { pages: docxPages(zip), needsOcr: false, needsConversion: false };
    if (ext === 'pptx') return { pages: pptxPages(zip), needsOcr: false, needsConversion: false };
    const r = xlsxPages(zip); return { pages: r.pages, grids: r.sheets, needsOcr: false, needsConversion: false };
  }
  // Unknown type: if it decodes as text, take it; else keep it named.
  const text = decodeText(bytes.subarray(0, 200_000));
  const printable = text.replace(/[\s\p{L}\p{N}\p{P}\p{S}]/gu, '').length;
  if (text.trim() && printable / Math.max(1, text.length) < 0.05) return { pages: paginate(tidy(text)), needsOcr: false, needsConversion: false };
  return { pages: [], needsOcr: false, needsConversion: true, note: 'unrecognised format' };
}

/** Plain text out of RTF: control words dropped, escapes decoded. Good enough for search; the original is kept. */
function rtfText(rtf: string): string {
  let depth = 0; let out = ''; let i = 0; const skipGroups = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer'];
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') { depth++; const m = /^\{\\\*?\\?(\w+)/.exec(rtf.slice(i, i + 24)); if (m && skipGroups.includes(m[1])) { let d = 0; for (; i < rtf.length; i++) { if (rtf[i] === '{') d++; else if (rtf[i] === '}') { d--; if (d === 0) { i++; break; } } } depth--; continue; } i++; continue; }
    if (ch === '}') { depth--; i++; continue; }
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i));
      if (m) { if (m[1] === 'par' || m[1] === 'line') out += '\n'; else if (m[1] === 'tab') out += '\t'; else if (m[1] === 'u' && m[2]) out += String.fromCharCode(+m[2] < 0 ? +m[2] + 65536 : +m[2]); i += m[0].length; continue; }
      const h = /^\\'([0-9a-f]{2})/i.exec(rtf.slice(i)); if (h) { out += String.fromCharCode(parseInt(h[1], 16)); i += 4; continue; }
      out += rtf[i + 1] || ''; i += 2; continue;
    }
    if (ch !== '\n' && ch !== '\r') out += ch; i++;
  }
  return out;
}
