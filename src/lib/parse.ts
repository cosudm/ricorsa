/**
 * Tolerant, progressive parser for the model's tagged output:
 *   <answer>…</answer><related>…</related><learned>{…}</learned>
 * Sources come from retrieval, not from the model, so there is no <sources> block server-side.
 */
import { truncate } from './http';

export type Parsed = { answer: string; answerDone: boolean; related: string[]; relatedDone: boolean; learned: Record<string, unknown> | null };

function trimPartialTag(s: string) { return s.replace(/<\/?[a-z]{0,9}$/i, '').replace(/\s+$/, ''); }

export function parseRelated(block: string): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const raw of String(block).split('\n')) {
    const line = raw.trim().replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, '').replace(/^["“]|["”]$/g, '').trim();
    if (!line || line.length < 8 || line.startsWith('<')) continue;
    const key = line.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    out.push(truncate(line, 180));
    if (out.length >= 6) break;
  }
  return out;
}

export function parseLearned(block: string): Record<string, unknown> | null {
  const s = String(block); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(s.slice(a, b + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

export function parseStream(raw: string): Parsed {
  let text = String(raw || '');
  text = text.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '');
  const res: Parsed = { answer: '', answerDone: false, related: [], relatedDone: false, learned: null };
  const aO = text.indexOf('<answer>'), aC = text.indexOf('</answer>');
  const rO = text.indexOf('<related>'), rC = text.indexOf('</related>');
  const lO = text.indexOf('<learned>'), lC = text.indexOf('</learned>');
  if (aO >= 0) {
    let a = aC > aO ? text.slice(aO + 8, aC) : text.slice(aO + 8);
    if (aC < 0 && rO > aO) a = text.slice(aO + 8, rO);
    else if (aC < 0 && lO > aO) a = text.slice(aO + 8, lO);
    res.answer = (aC > aO ? a : trimPartialTag(a)).replace(/^\s+/, '');
    res.answerDone = aC > aO;
  } else {
    // The model skipped the tags: everything before <related> is the answer.
    const a = rO >= 0 ? text.slice(0, rO) : (lO >= 0 ? text.slice(0, lO) : text);
    if (!/^\s*<[a-z]{0,9}$/i.test(a)) res.answer = trimPartialTag(a).replace(/^\s+/, '');
  }
  if (rO >= 0) {
    const r = rC > rO ? text.slice(rO + 9, rC) : text.slice(rO + 9);
    res.related = parseRelated(rC > rO ? r : r.replace(/[^\n]*$/, ''));
    res.relatedDone = rC > rO;
  }
  if (lO >= 0 && lC > lO) res.learned = parseLearned(text.slice(lO + 9, lC));
  else if (lO >= 0 && /\}\s*$/.test(text)) res.learned = parseLearned(text.slice(lO + 9));
  return res;
}
