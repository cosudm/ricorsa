import type { Page } from '../shard-do';

export type Learned = { kind: string; witness: string | null; volume: string | null; docDate: string | null; defendants: string[] | null; extra: Record<string, unknown> | null };

const KINDS: Array<[RegExp, string]> = [
  [/deposition\s+summary|depo\s+summary|summary\s+of\s+(the\s+)?deposition/i, 'summary'],
  [/deposition|depo\b|transcript|videotaped|court\s+reporter|examination\s+by/i, 'transcript'],
  [/exhibit|ex\.\s*\d+|plaintiff'?s?\s+ex|defendant'?s?\s+ex/i, 'exhibit'],
  [/medical|pathology|radiolog|discharge\s+summary|patient|diagnos|oncolog|biopsy/i, 'medical'],
  [/ship\s+record|deck\s+log|vessel|boiler\s+registry|equipment\s+registry|registry/i, 'registry'],
  [/invoice|purchase\s+order|receipt|statement\s+of\s+account|remittance/i, 'invoice'],
  [/^re:|dear\s+|sincerely|correspondence|letter|memo(randum)?\b|from:\s|subject:\s/im, 'correspondence'],
  [/complaint|motion|order|brief|petition|answer\s+to|affidavit|declaration|interrogator|subpoena|notice\s+of/i, 'pleading'],
];

/** What a document is, who it is about and when, from its name, path and the start of its text. Cheap and revisable. */
export function classify(name: string, path: string | null, pages: Page[], grids?: string[][][]): Learned {
  const head = pages.slice(0, 3).map(p => p.text).join('\n').slice(0, 6000);
  const label = `${path || ''} ${name}`;
  let kind = 'document';
  for (const [re, k] of KINDS) { if (re.test(label) || re.test(head.slice(0, 1500))) { kind = k; break; } }
  if (grids && grids.some(g => g.some(r => r.some(c => /^defendant$/i.test(c.trim()))))) kind = 'summary';

  let witness: string | null = null;
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
  const stop = new Set(['deposition', 'depo', 'summary', 'transcript', 'volume', 'vol', 'of', 'the', 'exhibit', 'exhibits', 'part', 'day', 'session', 'and', 'in', 're']);
  const pick = (m: RegExpExecArray | null): string | null => {
    if (!m) return null;
    const words = m[1].split(/\s+/).filter(Boolean);
    while (words.length && stop.has(words[words.length - 1].toLowerCase().replace(/[.,;:]+$/, ''))) words.pop();
    const w = words.slice(0, 3).join(' ').replace(/[.,;:]+$/, '').trim();
    return w.length >= 2 ? w : null;
  };
  const who = /[Dd]eposition(?:\s+[Ss]ummary)?\s+[Oo]f\s+(?:[Mm]r\.?|[Mm]s\.?|[Mm]rs\.?|[Dd]r\.?)?\s*([A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|[A-Z]\.))*)/;
  witness = pick(who.exec(base)) || pick(who.exec(head.slice(0, 2500)));
  if (!witness) { const v = /(?:witness|deponent)\s*:\s*([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})/.exec(head); if (v) witness = v[1].trim(); }

  // The volume of a transcript comes from its name, or from the first lines of a transcript itself; a summary quotes
  // many volumes, so its text is never used.
  let volume: string | null = null;
  const vol = /\bvol(?:ume)?\.?\s*([IVX]+|\d+)\b/i.exec(label) || (kind === 'transcript' ? /\bvol(?:ume)?\.?\s*([IVX]+|\d+)\b/i.exec(head.slice(0, 800)) : null);
  if (vol) volume = vol[1].toUpperCase();

  let docDate: string | null = null;
  const iso = /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/.exec(label + ' ' + head);
  if (iso) docDate = iso[0];
  else {
    const us = /\b(0?[1-9]|1[0-2])[\/.-](0?[1-9]|[12]\d|3[01])[\/.-]((?:19|20)?\d{2})\b/.exec(head) || /\b(0?[1-9]|1[0-2])[\/.-](0?[1-9]|[12]\d|3[01])[\/.-]((?:19|20)?\d{2})\b/.exec(label);
    if (us) { const y = us[3].length === 2 ? (+us[3] > 40 ? '19' : '20') + us[3] : us[3]; docDate = `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`; }
    else {
      const long = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/i.exec(head);
      if (long) { const m = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(long[1].toLowerCase()) + 1; docDate = `${long[3]}-${String(m).padStart(2, '0')}-${long[2].padStart(2, '0')}`; }
    }
  }

  let defendants: string[] | null = null; let extra: Record<string, unknown> | null = null;
  if (grids) {
    const rec = summaryGrid(grids);
    if (rec) { defendants = rec.defendants; extra = { profile: rec.profile, exposures: rec.rows.length, rows: rec.rows.slice(0, 200) }; }
  }
  return { kind, witness, volume, docDate, defendants, extra };
}

/**
 * The deposition-summary grid: a header row with "Defendant" and columns like product, employer, site, years,
 * frequency, exposure summary and supporting cites; label/value rows above it describe the witness.
 */
export function summaryGrid(grids: string[][][]): { profile: Record<string, string>; rows: Array<Record<string, string>>; defendants: string[] } | null {
  for (const g of grids) {
    const hi = g.findIndex(r => r.some(c => /^defendant$/i.test(c.trim())));
    if (hi < 0) continue;
    const header = g[hi].map(h => h.trim());
    const profile: Record<string, string> = {};
    for (const r of g.slice(0, hi)) { const k = (r[0] || '').trim(); if (k && k.length < 40) profile[k] = (r.slice(1).find(x => x) || '').trim(); }
    const rows: Array<Record<string, string>> = []; const defendants: string[] = [];
    for (const r of g.slice(hi + 1)) {
      if (!r.some(x => x)) continue;
      const rec: Record<string, string> = {};
      header.forEach((h, i) => { if (h && r[i]) rec[h] = String(r[i]).trim(); });
      if (!Object.keys(rec).length) continue;
      const d = (rec['Defendant'] || '').replace(/\s+/g, ' ').trim(); if (d) defendants.push(d);
      rows.push(rec);
    }
    return { profile, rows, defendants };
  }
  return null;
}
