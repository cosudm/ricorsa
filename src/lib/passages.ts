/**
 * Passages of the files attached to a question, as numbered sources the answer can cite and the reader can open.
 *
 * The extracted text of a file (src/lib/files.ts) carries its own landmarks: `[Page n]` for PDFs, `[Slide n]` for
 * decks, `[Sheet: name]` for workbooks, paragraphs for everything else. This module cuts the text into passages along
 * those landmarks, picks the ones that bear on the question (the same keyword scoring the memory uses, so a question
 * such as "where does the lease mention renewal" surfaces the clauses that do), and numbers them after the web sources
 * with a location and a link that opens the file in the viewer at that passage, highlighted.
 */
import { terms } from './memory';
import type { Source } from './search';

export type PassageLoc = { page?: number; slide?: number; sheet?: string; rows?: [number, number]; start: number; end: number };
export type FilePassage = { fileId: string; name: string; loc: PassageLoc; text: string; ordinal: number; /** The sentence of the passage that bears most on the question: what the viewer highlights. */ focus?: string };

export const FILES_LABEL = 'Your files';
const SIZE = 650;                 // characters per passage, give or take a sentence
const MAX_PER_FILE = 400;         // passages kept per file for scoring (a very long file is sampled by its first pages)

/** Cut one file's text into passages that remember where they came from. */
export function splitFilePassages(fileId: string, name: string, text: string): FilePassage[] {
  const out: FilePassage[] = [];
  const src = String(text || '');
  if (!src.trim()) return out;
  const push = (t: string, start: number, end: number, loc: Partial<PassageLoc>) => { const s = t.trim(); if (s.length >= 40 && out.length < MAX_PER_FILE) out.push({ fileId, name, loc: { ...loc, start, end }, text: s.slice(0, 1400), ordinal: out.length }); };
  // Landmarks: pages, slides and sheets split the text into sections that keep their own location.
  const landmark = /^\[(Page|Slide) (\d+)\]\s*$|^\[Sheet: (.*?)\]\s*$/gm;
  const sections: Array<{ loc: Partial<PassageLoc>; start: number; end: number }> = [];
  let m: RegExpExecArray | null; let last: { loc: Partial<PassageLoc>; start: number } | null = null;
  while ((m = landmark.exec(src))) {
    if (last) sections.push({ ...last, end: m.index }); else if (m.index > 0) sections.push({ loc: {}, start: 0, end: m.index });
    const loc: Partial<PassageLoc> = m[1] === 'Page' ? { page: Number(m[2]) } : m[1] === 'Slide' ? { slide: Number(m[2]) } : { sheet: m[3] };
    last = { loc, start: m.index + m[0].length };
  }
  if (last) sections.push({ ...last, end: src.length }); else sections.push({ loc: {}, start: 0, end: src.length });
  for (const sec of sections) {
    const body = src.slice(sec.start, sec.end);
    if (sec.loc.sheet) {
      // Workbooks: a passage is a run of rows, so the location can say which rows.
      const lines = body.split('\n'); let row = 0; let buf: string[] = []; let bufStart = sec.start; let bufRow = 1; let pos = sec.start;
      for (const line of lines) {
        const lineStart = pos; pos += line.length + 1;
        if (!line.trim()) continue;
        row++;
        if (!buf.length) { bufStart = lineStart; bufRow = row; }
        buf.push(line);
        if (buf.join('\n').length >= SIZE) { push(buf.join('\n'), bufStart, pos - 1, { sheet: sec.loc.sheet, rows: [bufRow, row] }); buf = []; }
      }
      if (buf.length) push(buf.join('\n'), bufStart, pos - 1, { sheet: sec.loc.sheet, rows: [bufRow, row] });
      continue;
    }
    // Prose: paragraphs, then sentences, grouped to about SIZE characters.
    const paraRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; let p: RegExpExecArray | null; let cur = ''; let curStart = -1; let curEnd = -1;
    const flush = () => { if (cur) push(cur, curStart, curEnd, sec.loc); cur = ''; curStart = -1; };
    while ((p = paraRe.exec(body))) {
      const para = p[0]; const pStart = sec.start + p.index; const pEnd = pStart + para.length;
      if (para.length > SIZE * 1.6) {
        flush();
        const sentRe = /[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g; let s: RegExpExecArray | null;
        while ((s = sentRe.exec(para))) {
          const sStart = pStart + s.index, sEnd = sStart + s[0].length;
          if (cur && (cur.length + s[0].length) > SIZE) flush();
          if (!cur) curStart = sStart; cur += s[0]; curEnd = sEnd;
        }
        flush();
        continue;
      }
      if (cur && (cur.length + para.length + 1) > SIZE) flush();
      if (!cur) curStart = pStart; cur = cur ? cur + '\n' + para : para; curEnd = pEnd;
    }
    flush();
  }
  return out;
}

/** Whether the question is a lookup ("where does it say", "find", "search for"), which wants more passages, not fewer. */
export function isLookup(question: string): boolean {
  return /\b(where|find|search|look ?up|locate|which (?:page|section|clause|paragraph|slide|sheet|row)|what page|highlight|show me where|mention|refer)/i.test(question);
}

/**
 * The passages of the attached files that bear on the question: scored by the share of the question's rarity-weighted
 * terms they carry, with a verbatim phrase of the question as a bonus. Every file the question was asked with keeps at
 * least its two strongest (or first) passages, so a broad question ("summarize this") still has something to point at.
 */
export function selectFilePassages(files: Array<{ id: string; name: string; text: string; current: boolean }>, question: string, limit: number): FilePassage[] {
  const all = files.flatMap(f => splitFilePassages(f.id, f.name, f.text));
  if (!all.length) return [];
  const qTerms = terms(question, 16);
  const df: Record<string, number> = {}; const pTerms = all.map(p => new Set(terms(p.text, 200)));
  for (const set of pTerms) for (const t of qTerms) if (set.has(t)) df[t] = (df[t] || 0) + 1;
  const idf = (t: string) => Math.log(1 + all.length / (1 + (df[t] || 0)));
  const total = qTerms.reduce((a, t) => a + idf(t), 0) || 1;
  const phrases = question.toLowerCase().match(/[a-z0-9][a-z0-9 ]{9,}[a-z0-9]/g) || [];
  const scored = all.map((p, i) => {
    const hit = qTerms.filter(t => pTerms[i].has(t));
    let s = qTerms.length ? hit.reduce((a, t) => a + idf(t), 0) / total : 0;
    const lower = p.text.toLowerCase(); if (phrases.some(ph => lower.includes(ph))) s += 0.3;
    return { p, s };
  });
  const chosen: FilePassage[] = []; const taken = new Set<FilePassage>();
  // The floor: two passages per file the question was asked with, the strongest or else the first.
  for (const f of files.filter(f => f.current)) {
    const mine = scored.filter(x => x.p.fileId === f.id).sort((a, b) => b.s - a.s || a.p.ordinal - b.p.ordinal);
    for (const x of mine.slice(0, 2)) { if (!taken.has(x.p)) { taken.add(x.p); chosen.push(x.p); } }
  }
  for (const x of scored.filter(x => x.s >= 0.28 && !taken.has(x.p)).sort((a, b) => b.s - a.s)) { if (chosen.length >= limit) break; taken.add(x.p); chosen.push(x.p); }
  for (const p of chosen) p.focus = focusSentence(p.text, qTerms, !!(p.loc.sheet && p.loc.rows && p.loc.rows[0] === 1));
  return chosen.sort((a, b) => a.fileId === b.fileId ? a.ordinal - b.ordinal : a.name.localeCompare(b.name)).slice(0, Math.max(limit, 2));
}

/**
 * The sentence (or row) of a passage that carries most of the question's terms; the first when none does. For the
 * top of a sheet the header row is skipped while a data row matches, so the highlight lands on the answer, not the labels.
 */
export function focusSentence(text: string, qTerms: string[], skipHeader = false): string {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+/).map(x => x.trim()).filter(x => x.length >= 8);
  if (!parts.length) return text.replace(/\s+/g, ' ').trim().slice(0, 90);
  const pick = (list: string[]) => { let best = ''; let bestScore = 0; for (const part of list) { const set = new Set(terms(part, 80)); const score = qTerms.filter(t => set.has(t)).length; if (score > bestScore) { best = part; bestScore = score; } } return best; };
  const best = (skipHeader && parts.length > 1 ? pick(parts.slice(1)) : '') || pick(parts) || parts[0];
  return best.replace(/\s+/g, ' ').trim().slice(0, 90);
}

/** Where a passage sits, in words a reader understands. */
export function passageWhere(p: FilePassage): string {
  if (p.loc.page) return `page ${p.loc.page}`;
  if (p.loc.slide) return `slide ${p.loc.slide}`;
  if (p.loc.sheet) return `${p.loc.sheet}${p.loc.rows ? ` rows ${p.loc.rows[0]}–${p.loc.rows[1]}` : ''}`;
  return `"${(p.focus || p.text).replace(/\s+/g, ' ').split(' ').slice(0, 7).join(' ')}…"`;
}

/** The snippet the viewer searches for to highlight the passage: the sentence that bears on the question, or the first words. */
export function passageSnippet(p: FilePassage): string {
  return (p.focus || p.text).replace(/\s+/g, ' ').trim().slice(0, 90);
}

/** The in-app link: the thread, the file, the page and the snippet to highlight. */
export function passageUrl(threadId: string, turnId: string, p: FilePassage): string {
  const q = new URLSearchParams({ turn: turnId, file: p.fileId });
  if (p.loc.page) q.set('p', String(p.loc.page)); if (p.loc.slide) q.set('slide', String(p.loc.slide)); if (p.loc.sheet) q.set('sheet', p.loc.sheet);
  q.set('hl', passageSnippet(p));
  return `/app#/thread/${encodeURIComponent(threadId)}?${q.toString()}`;
}

/** Passages as numbered sources, continuing from `from`; the passage text rides along so the model reads it. */
export function numberFilePassages(passages: FilePassage[], from: number, threadId: string, turnId: string): Source[] {
  return passages.map((p, i) => ({ n: from + i + 1, title: `${p.name} · ${passageWhere(p)}`, domain: FILES_LABEL, url: passageUrl(threadId, turnId, p), snippet: p.text.slice(0, 240), text: p.text }));
}
