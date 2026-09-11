import { unzipSync, strFromU8 } from 'fflate';
import type { Page } from '../shard-do';
import { paginate, tidy } from './text';

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
}

export type OfficeResult = { pages: Page[]; sheets?: string[][][] };

/** Word: paragraphs of word/document.xml, split at the page breaks Word recorded (or by length when it recorded none). */
export function docxPages(zip: Record<string, Uint8Array>): Page[] {
  const doc = zip['word/document.xml']; if (!doc) return [];
  const xml = strFromU8(doc);
  const marked = xml
    .replace(/<w:lastRenderedPageBreak\/>/g, '').replace(/<w:br w:type="page"\/>/g, '')
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');
  const text = decodeXml(marked);
  const parts = text.split('').map(tidy).filter(Boolean);
  if (parts.length > 1) return parts.map((t, i) => ({ page: i + 1, text: t }));
  return paginate(parts[0] || '');
}

/** PowerPoint: one page per slide, in order. */
export function pptxPages(zip: Record<string, Uint8Array>): Page[] {
  const slides = Object.keys(zip).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => +a.match(/(\d+)\.xml$/)![1] - +b.match(/(\d+)\.xml$/)![1]);
  return slides.map((k, i) => {
    const xml = strFromU8(zip[k]).replace(/<\/a:p>/g, '\n').replace(/<a:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
    return { page: i + 1, text: tidy(decodeXml(xml)) };
  });
}

/** Excel: one page per sheet, rows as tab-separated cells, with the raw grid kept for typed readers. */
export function xlsxPages(zip: Record<string, Uint8Array>): OfficeResult {
  const shared: string[] = [];
  if (zip['xl/sharedStrings.xml']) for (const m of strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decodeXml(m[1].replace(/<[^>]+>/g, '')));
  const names: string[] = zip['xl/workbook.xml'] ? [...strFromU8(zip['xl/workbook.xml']).matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => decodeXml(m[1])) : [];
  const sheets = Object.keys(zip).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => +a.match(/(\d+)\.xml$/)![1] - +b.match(/(\d+)\.xml$/)![1]);
  const pages: Page[] = []; const grids: string[][][] = [];
  sheets.forEach((k, si) => {
    const xml = strFromU8(zip[k]); const rows: string[][] = [];
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
        if (v !== '') cells.push([col, v.replace(/\s+/g, ' ').trim()]);
      }
      if (cells.length) { cells.sort((a, b) => a[0] - b[0]); const max = cells[cells.length - 1][0]; const arr = new Array(max).fill(''); for (const [col, v] of cells) arr[col - 1] = v; rows.push(arr); }
      if (rows.length >= 20000) break;
    }
    grids.push(rows);
    const title = names[si] || k.replace(/^xl\/worksheets\//, '');
    pages.push({ page: si + 1, text: tidy(`[Sheet: ${title}]\n` + rows.map(r => r.join('\t')).join('\n')) });
  });
  return { pages, sheets: grids };
}

export function unzip(bytes: Uint8Array): Record<string, Uint8Array> { return unzipSync(bytes); }
