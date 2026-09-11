import type { Page } from '../shard-do';
import { tidy } from './text';

/** Enough real characters on a page to count as text; below this across the document, the PDF is a scan and goes to OCR. */
const MIN_CHARS_PER_PAGE = 25;

/** A PDF's text layer, page by page, and whether it looks scanned (little or no text). */
export async function pdfPages(bytes: Uint8Array): Promise<{ pages: Page[]; scanned: boolean; pageCount: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const arr = (Array.isArray(text) ? text : [String(text)]).map(t => tidy(String(t || '')));
  const pages: Page[] = arr.map((t, i) => ({ page: i + 1, text: t }));
  const chars = arr.reduce((n, t) => n + t.replace(/\s+/g, '').length, 0);
  const scanned = chars < MIN_CHARS_PER_PAGE * Math.max(1, arr.length) * 0.5;
  return { pages, scanned, pageCount: totalPages || arr.length };
}
