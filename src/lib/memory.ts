/**
 * Institutional memory: what the person has already worked out in Ricorsa, recalled into later answers.
 *
 * Every finished answer and every attached file is cut into passages and kept in the `memories` table (their own
 * account only). When a new question comes in, the passages that bear on it are numbered after the web sources, so the
 * model can cite "your earlier answer" or "your file" with a number the reader can open: the source link goes to the
 * thread and the turn it came from.
 *
 * Recall is lexical here (keywords over the passage table, scored in code by term overlap, phrase match and recency), which
 * needs nothing beyond D1. When the Worker also has a Vectorize index (VECTORS) and Workers AI (AI) bound in
 * wrangler.jsonc, the same passages are embedded (bge-base-en-v1.5) and recalled by meaning as well; both bindings are
 * detected at run time, so nothing changes until they are added. MEMORY=off turns recall and remembering off.
 */
import { and, desc, eq, inArray, or, like, sql } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { db, schema } from './db';
import { uid } from './http';
import type { Source } from './search';
import type { MemoryKind } from './db/schema';

export type Recalled = { id: string; kind: MemoryKind; threadId: string | null; turnId: string | null; fileId: string | null; title: string; text: string; at: number; score: number };

export const THREADS_LABEL = 'Your threads';
export const FILES_LABEL = 'Your files';
const MIN_TEXT = 80;              // shorter passages carry nothing worth recalling
const CHUNK = 700;                // characters per passage, give or take a sentence
const MAX_CHUNKS = { answer: 12, file: 40 } as const;
const CANDIDATES = 240;           // passages the lexical pass reads before scoring
const HALF_LIFE_DAYS = 120;       // recency: a passage this old counts half

export function memoryEnabled(): boolean { return process.env.MEMORY !== 'off'; }

const STOP = new Set(('a an and are as at be been but by for from has have how i if in into is it its of on or that the their them then there these they this to was we were what when where which who why will with would you your yours about after again all also am any because before being below between both can could did do does doing down during each few further had having here hers herself him himself his me more most my myself nor not now off once only other our ours ourselves out over own same she should so some such than through too under until up very while whom yourself yourselves just like get got make made need want give take tell say said one two three many much well way thing things something anything everything please help know let us').split(/\s+/));

/** The words of a text that carry meaning: lowercase, letters and digits, no stopwords, light stemming, no repeats. */
export function terms(text: string, max = 400): string[] {
  const out: string[] = []; const seen = new Set<string>();
  for (const raw of String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw) && raw.length < 4) continue;
    const t = stem(raw); if (t.length < 3 || seen.has(t)) continue;
    seen.add(t); out.push(t); if (out.length >= max) break;
  }
  return out;
}
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && (w.endsWith('ing') || w.endsWith('ers'))) return w.slice(0, -3);
  if (w.length > 4 && (w.endsWith('es') || w.endsWith('ed') || w.endsWith('ly') || w.endsWith('er'))) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Cut a text into passages of about CHUNK characters along paragraph, then sentence, boundaries. */
export function chunk(text: string, size = CHUNK): string[] {
  const clean = String(text || '').replace(/\r/g, '').replace(/```[\s\S]*?```/g, (m) => m.slice(0, 600)).replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}|\n(?=#{1,6} )|\n(?=[-*] )|\n(?=\|)/).map(p => p.trim()).filter(Boolean);
  const out: string[] = []; let cur = '';
  const push = () => { if (cur.trim().length >= MIN_TEXT) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > size * 1.6) {
      push();
      const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
      for (const s of sentences) { if ((cur + ' ' + s).length > size && cur) push(); cur = cur ? cur + ' ' + s : s; }
      push();
      continue;
    }
    if ((cur + '\n' + p).length > size && cur) push();
    cur = cur ? cur + '\n' + p : p;
  }
  push();
  return out;
}

type Env = { VECTORS?: { upsert: (rows: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>) => Promise<unknown>; query: (v: number[], o: { topK: number; filter?: Record<string, string>; returnMetadata?: string }) => Promise<{ matches: Array<{ id: string; score: number }> }>; deleteByIds: (ids: string[]) => Promise<unknown> }; AI?: { run: (model: string, input: { text: string[] }) => Promise<{ data: number[][] }> } };
function env(): Env { try { return getCloudflareContext().env as unknown as Env; } catch { return {}; } }
/** Whether the Worker can also recall by meaning (Vectorize index and Workers AI both bound). */
export function vectorsEnabled(): boolean { const e = env(); return !!(e.VECTORS && e.AI); }
async function embed(texts: string[]): Promise<number[][] | null> {
  const e = env(); if (!e.AI || !texts.length) return null;
  try { const r = await e.AI.run('@cf/baai/bge-base-en-v1.5', { text: texts.map(t => t.slice(0, 2000)) }); return Array.isArray(r?.data) ? r.data : null; } catch (err) { console.warn('[memory] embed failed', String((err as Error)?.message || err)); return null; }
}

/**
 * Keep a text as passages. Earlier passages for the same turn (a rewrite) or file are replaced. Returns how many were kept.
 */
export async function remember(userId: string, m: { kind: MemoryKind; threadId?: string | null; turnId?: string | null; fileId?: string | null; title: string; text: string; at?: number; /** Known to be new (the backfill): skip the replace step. */ fresh?: boolean }): Promise<number> {
  if (!memoryEnabled()) return 0;
  const parts = chunk(m.text).slice(0, MAX_CHUNKS[m.kind]);
  const d = db();
  if (!m.fresh && m.kind === 'answer' && m.turnId) await d.delete(schema.memories).where(and(eq(schema.memories.userId, userId), eq(schema.memories.turnId, m.turnId), eq(schema.memories.kind, 'answer')));
  if (!m.fresh && m.kind === 'file' && m.fileId) await d.delete(schema.memories).where(and(eq(schema.memories.userId, userId), eq(schema.memories.fileId, m.fileId)));
  if (!parts.length) return 0;
  const at = m.at ? new Date(m.at) : new Date();
  const rows = parts.map((text, i) => ({ id: uid(), userId, kind: m.kind, threadId: m.threadId || null, turnId: m.turnId || null, fileId: m.fileId || null, title: String(m.title || '').slice(0, 200), text: text.slice(0, 2000), terms: ' ' + terms(m.title + ' ' + text).join(' ') + ' ', ordinal: i, embedded: false, createdAt: at }));
  for (let i = 0; i < rows.length; i += 20) await d.insert(schema.memories).values(rows.slice(i, i + 20));
  if (vectorsEnabled()) {
    const vecs = await embed(rows.map(r => r.title + '\n' + r.text));
    if (vecs && vecs.length === rows.length) {
      try { await env().VECTORS!.upsert(rows.map((r, i) => ({ id: r.id, values: vecs[i], metadata: { userId, kind: r.kind, threadId: r.threadId || '' } }))); await d.update(schema.memories).set({ embedded: true }).where(inArray(schema.memories.id, rows.map(r => r.id))); }
      catch (err) { console.warn('[memory] upsert failed', String((err as Error)?.message || err)); }
    }
  }
  return rows.length;
}

/** Drop everything remembered from a thread (its answers and its files). */
export async function forgetThread(userId: string, threadId: string): Promise<void> {
  const d = db();
  const ids = (await d.select({ id: schema.memories.id }).from(schema.memories).where(and(eq(schema.memories.userId, userId), eq(schema.memories.threadId, threadId)))).map(r => r.id);
  if (!ids.length) return;
  await d.delete(schema.memories).where(inArray(schema.memories.id, ids));
  if (vectorsEnabled()) { try { await env().VECTORS!.deleteByIds(ids); } catch (err) { console.warn('[memory] vector delete failed', String((err as Error)?.message || err)); } }
}
/** Drop everything remembered from one file. */
export async function forgetFile(userId: string, fileId: string): Promise<void> {
  const d = db();
  const ids = (await d.select({ id: schema.memories.id }).from(schema.memories).where(and(eq(schema.memories.userId, userId), eq(schema.memories.fileId, fileId)))).map(r => r.id);
  if (!ids.length) return;
  await d.delete(schema.memories).where(inArray(schema.memories.id, ids));
  if (vectorsEnabled()) { try { await env().VECTORS!.deleteByIds(ids); } catch (err) { console.warn('[memory] vector delete failed', String((err as Error)?.message || err)); } }
}
/** Drop the whole memory of an account (the graph reset does this too). */
export async function forgetAll(userId: string): Promise<void> {
  const d = db();
  const ids = (await d.select({ id: schema.memories.id }).from(schema.memories).where(eq(schema.memories.userId, userId))).map(r => r.id);
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 100) await d.delete(schema.memories).where(inArray(schema.memories.id, ids.slice(i, i + 100)));
  if (vectorsEnabled()) { try { await env().VECTORS!.deleteByIds(ids); } catch (err) { console.warn('[memory] vector delete failed', String((err as Error)?.message || err)); } }
}

export async function memoryCount(userId: string): Promise<number> {
  const r = await db().select({ n: sql<number>`count(*)` }).from(schema.memories).where(eq(schema.memories.userId, userId));
  return Number(r[0]?.n || 0);
}

/**
 * The passages that bear on a question: at most `limit`, at most two from one thread, never from the thread being
 * answered (its own history is already in the prompt), each scored by how many of the question's terms it carries
 * (rarer terms count more), whether a phrase of the question appears verbatim, and how recent it is.
 */
export async function recall(userId: string, question: string, opts: { limit?: number; excludeThreadId?: string | null } = {}): Promise<Recalled[]> {
  if (!memoryEnabled()) return [];
  const limit = opts.limit ?? 3;
  const qTerms = terms(question, 14);
  if (qTerms.length < 2) return [];
  const d = db();
  const conds = qTerms.map(t => like(schema.memories.terms, `% ${t} %`));
  const rows = await d.select().from(schema.memories).where(and(eq(schema.memories.userId, userId), or(...conds))).orderBy(desc(schema.memories.createdAt)).limit(CANDIDATES);
  const now = Date.now();
  // Rarity among the candidates: a term found in most of them tells little.
  const df: Record<string, number> = {}; for (const r of rows) for (const t of qTerms) if (r.terms.includes(' ' + t + ' ')) df[t] = (df[t] || 0) + 1;
  const idf = (t: string) => Math.log(1 + rows.length / (1 + (df[t] || 0)));
  const total = qTerms.reduce((a, t) => a + idf(t), 0) || 1;
  const phrases = question.toLowerCase().match(/[a-z0-9][a-z0-9 ]{11,}[a-z0-9]/g) || [];
  let scored: Recalled[] = [];
  for (const r of rows) {
    if (opts.excludeThreadId && r.threadId === opts.excludeThreadId) continue;
    const hit = qTerms.filter(t => r.terms.includes(' ' + t + ' '));
    if (hit.length < Math.min(2, qTerms.length)) continue;
    let s = hit.reduce((a, t) => a + idf(t), 0) / total;                       // 0..1 share of the question's weight
    const lower = (r.title + ' ' + r.text).toLowerCase();
    if (phrases.some(p => lower.includes(p))) s += 0.25;                        // a phrase of the question, verbatim
    const ageDays = Math.max(0, now - r.createdAt.getTime()) / 864e5;
    s *= 0.6 + 0.4 * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);                    // recent counts a little more
    if (r.kind === 'file') s *= 1.05;                                            // a file the person brought is evidence
    scored.push({ id: r.id, kind: r.kind, threadId: r.threadId, turnId: r.turnId, fileId: r.fileId, title: r.title, text: r.text, at: r.createdAt.getTime(), score: s });
  }
  // Recall by meaning, when the Worker has the bindings: matches are merged in with their similarity as the score.
  if (vectorsEnabled()) {
    try {
      const v = await embed([question]);
      if (v && v[0]) {
        const m = await env().VECTORS!.query(v[0], { topK: 12, filter: { userId }, returnMetadata: 'none' });
        const ids = m.matches.filter(x => x.score >= 0.6).map(x => x.id).filter(id => !scored.some(s => s.id === id));
        if (ids.length) {
          const extra = await d.select().from(schema.memories).where(inArray(schema.memories.id, ids));
          for (const r of extra) { if (opts.excludeThreadId && r.threadId === opts.excludeThreadId) continue; const sim = m.matches.find(x => x.id === r.id)?.score || 0; scored.push({ id: r.id, kind: r.kind, threadId: r.threadId, turnId: r.turnId, fileId: r.fileId, title: r.title, text: r.text, at: r.createdAt.getTime(), score: (sim - 0.5) * 2 }); }
        }
        for (const s of scored) { const sim = m.matches.find(x => x.id === s.id)?.score; if (sim) s.score = Math.max(s.score, (sim - 0.5) * 2) + 0.1; }
      }
    } catch (err) { console.warn('[memory] vector recall failed', String((err as Error)?.message || err)); }
  }
  scored = scored.filter(s => s.score >= 0.34).sort((a, b) => b.score - a.score);
  // One source per turn (a second matching passage from the same turn rides along in its text), at most two turns per thread.
  const out: Recalled[] = []; const perThread: Record<string, number> = {}; const byTurn: Record<string, Recalled> = {};
  for (const s of scored) {
    const tk = s.turnId ? `${s.turnId}|${s.fileId || ''}` : s.id;
    if (byTurn[tk]) { if (byTurn[tk].text.length < 1400) byTurn[tk].text += '\n[…]\n' + s.text; continue; }
    const k = s.threadId || s.id; if ((perThread[k] || 0) >= 2) continue;
    perThread[k] = (perThread[k] || 0) + 1; byTurn[tk] = { ...s }; out.push(byTurn[tk]); if (out.length >= limit) break;
  }
  return out;
}

/** Where a recalled passage opens: the thread, scrolled to the turn (and the file it came with). */
export function memoryUrl(m: Pick<Recalled, 'threadId' | 'turnId' | 'fileId'>): string {
  if (!m.threadId) return '';
  const q = new URLSearchParams(); if (m.turnId) q.set('turn', m.turnId); if (m.fileId) q.set('file', m.fileId);
  const s = q.toString();
  return `/app#/thread/${encodeURIComponent(m.threadId)}${s ? '?' + s : ''}`;
}

/** Recalled passages as numbered sources, continuing from `from`; the passage text rides along so the model reads it. */
export function numberRecalled(recalled: Recalled[], from: number): Source[] {
  return recalled.map((m, i) => ({
    n: from + i + 1,
    title: m.kind === 'file' ? `Your file: ${m.title}` : `Your earlier answer: ${m.title}`,
    domain: m.kind === 'file' ? FILES_LABEL : THREADS_LABEL,
    url: memoryUrl(m),
    snippet: m.text.slice(0, 240),
    text: m.text,
  }));
}

/**
 * Fill the memory from what the account already holds, once: the answers of the most recent threads and the files
 * attached to them. Guarded by a config flag so it runs a single time per account.
 */
export async function backfillOnce(userId: string, maxThreads = 100): Promise<number> {
  if (!memoryEnabled()) return 0;
  const key = `memory:backfilled:${userId}`;
  const d = db();
  const flag = (await d.select().from(schema.config).where(eq(schema.config.key, key)).limit(1))[0];
  if (flag) return 0;
  await d.insert(schema.config).values({ key, value: { at: Date.now(), state: 'running' }, updatedAt: new Date() }).onConflictDoNothing();
  let kept = 0;
  try {
    const threads = await d.select({ id: schema.threads.id, turns: schema.threads.turns }).from(schema.threads).where(eq(schema.threads.userId, userId)).orderBy(desc(schema.threads.updatedAt)).limit(maxThreads);
    const had = await d.select({ turnId: schema.memories.turnId, fileId: schema.memories.fileId, kind: schema.memories.kind }).from(schema.memories).where(eq(schema.memories.userId, userId));
    const have = new Set<string | null>(had.filter(r => r.kind === 'answer').map(r => r.turnId).concat(had.filter(r => r.fileId).map(r => 'file:' + r.fileId)));
    for (const t of threads) for (const x of t.turns || []) {
      if (x.status !== 'done' || !x.answer || x.answer.length < MIN_TEXT || have.has(x.id)) continue;
      kept += await remember(userId, { kind: 'answer', threadId: t.id, turnId: x.id, title: x.q, text: x.answer, at: x.createdAt, fresh: true });
    }
    const files = await d.select({ id: schema.attachments.id, threadId: schema.attachments.threadId, name: schema.attachments.name, text: schema.attachments.text, createdAt: schema.attachments.createdAt }).from(schema.attachments).where(eq(schema.attachments.userId, userId)).orderBy(desc(schema.attachments.createdAt)).limit(60);
    for (const f of files) { if (!f.threadId || f.text.length < MIN_TEXT) continue; const turnId = threads.find(t => t.id === f.threadId)?.turns?.find(x => (x.attachments || []).some(a => a.id === f.id))?.id || null; if (have.has('file:' + f.id)) continue; kept += await remember(userId, { kind: 'file', threadId: f.threadId, turnId, fileId: f.id, title: f.name, text: f.text, at: f.createdAt.getTime(), fresh: true }); }
    await d.update(schema.config).set({ value: { at: Date.now(), state: 'done', kept }, updatedAt: new Date() }).where(eq(schema.config.key, key));
  } catch (err) {
    console.warn('[memory] backfill failed', String((err as Error)?.message || err));
    await d.delete(schema.config).where(eq(schema.config.key, key));   // so it is tried again next time
  }
  return kept;
}
