/**
 * The identity graph: the recursive learning loop. Every answered turn emits what it revealed
 * about the person; that merges into a weighted graph; the graph is folded into every later prompt.
 * Same algorithm as the client build, now living in the database so it follows the person across devices.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import type { GraphData, GraphNode, Turn } from './db/schema';
import { slugify, truncate } from './http';

export const NODE_TYPES = {
  topic: { label: 'Topics' }, entity: { label: 'Entities' }, goal: { label: 'Goals' }, expertise: { label: 'Expertise' }, style: { label: 'Style' },
} as const;

export function emptyGraph(): GraphData {
  return { v: 1, nodes: {}, edges: {}, intents: [], events: 0, paused: false, votes: { up: 0, down: 0 }, updatedAt: 0 };
}

export async function loadGraph(userId: string): Promise<GraphData> {
  const rows = await db().select().from(schema.graphs).where(eq(schema.graphs.userId, userId)).limit(1);
  const g = rows[0]?.data;
  return g && g.nodes && g.edges ? { ...emptyGraph(), ...g } : emptyGraph();
}

export async function saveGraph(userId: string, g: GraphData): Promise<void> {
  g.updatedAt = Date.now();
  await db().insert(schema.graphs).values({ userId, data: g, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.graphs.userId, set: { data: g, updatedAt: new Date() } });
}

function cleanLabel(v: unknown): string {
  const s = typeof v === 'string' ? v : (v && typeof v === 'object' && ((v as Record<string, unknown>).area || (v as Record<string, unknown>).label || (v as Record<string, unknown>).name || (v as Record<string, unknown>).text)) || '';
  return truncate(String(s).replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim(), 60);
}
export function normList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of v) { const s = cleanLabel(x); const k = slugify(s); if (s.length < 2 || !k || seen.has(k)) continue; seen.add(k); out.push(s); if (out.length >= max) break; }
  return out;
}

/** Merge one turn's <learned> block into the graph. Returns the touched nodes, or null when nothing was learned. */
export function mergeLearned(g: GraphData, turn: Turn, threadId: string, origin?: { ideaId?: string }): GraphNode[] | null {
  const L = turn.learned as Record<string, unknown> | null;
  if (!L || g.paused || turn.learnedMerged) return null;
  const now = Date.now();
  for (const n of Object.values(g.nodes)) n.weight = Math.max(0.04, n.weight * 0.97);   // the picture drifts toward the present
  for (const e of Object.values(g.edges)) e.weight = Math.max(0.02, e.weight * 0.95);
  const touched: GraphNode[] = [];
  const bump = (type: string, label: string, extra?: Partial<GraphNode>) => {
    const k = slugify(label); if (!k) return;
    const id = type + ':' + k; let n = g.nodes[id];
    if (n) { n.count++; n.weight = Math.min(1, n.weight + (1 - n.weight) * 0.38); n.lastSeen = now; if (extra) Object.assign(n, extra); }
    else { n = g.nodes[id] = { id, type, label, weight: 0.36, count: 1, firstSeen: now, lastSeen: now, origin: { threadId, turnId: turn.id, ideaId: origin?.ideaId, lineage: turn.lineage }, ...(extra || {}) }; }
    touched.push(n);
  };
  normList(L.topics, 4).forEach(t => bump('topic', t));
  normList(L.entities, 4).forEach(t => bump('entity', t));
  normList(L.goals, 2).forEach(t => bump('goal', t));
  (Array.isArray(L.expertise) ? L.expertise : []).slice(0, 3).forEach((x: unknown) => {
    const area = cleanLabel(x);
    const lvl = x && typeof x === 'object' ? String((x as Record<string, unknown>).level || '') : '';
    const level = /^(novice|intermediate|expert)$/.test(lvl) ? lvl : undefined;
    if (area.length >= 2) bump('expertise', area, level ? { level } : undefined);
  });
  normList(L.style, 3).forEach(t => bump('style', t));
  const subst = touched.filter(n => n.type !== 'style');
  for (let i = 0; i < subst.length; i++) for (let j = i + 1; j < subst.length; j++) {
    const key = [subst[i].id, subst[j].id].sort().join('|'); const ed = g.edges[key];
    if (ed) { ed.weight = Math.min(1, ed.weight + 0.3); ed.lastSeen = now; } else g.edges[key] = { a: subst[i].id, b: subst[j].id, weight: 0.3, lastSeen: now };
  }
  const intent = truncate(typeof L.intent === 'string' ? L.intent : '', 220);
  if (intent.length >= 8) { g.intents.unshift({ text: intent, at: now, threadId, turnId: turn.id }); g.intents = g.intents.slice(0, 25); }
  for (const [id, n] of Object.entries(g.nodes)) if (n.weight < 0.07 && now - n.lastSeen > 7 * 864e5) delete g.nodes[id];
  for (const [k, e] of Object.entries(g.edges)) if (!g.nodes[e.a] || !g.nodes[e.b] || e.weight < 0.05) delete g.edges[k];
  g.events++;
  turn.learnedMerged = true;
  return touched;
}

export function topNodes(g: GraphData, type: string, n = 8): GraphNode[] {
  return Object.values(g.nodes).filter(x => x.type === type).sort((a, b) => b.weight - a.weight || b.lastSeen - a.lastSeen).slice(0, n);
}

/** The profile paragraph folded into every prompt. Empty until something has been learned. */
export function graphPromptBlock(g: GraphData): string {
  if (!g || g.paused) return '';
  if (!Object.keys(g.nodes).length && !g.intents.length) return '';
  const fmt = (type: string, n: number) => topNodes(g, type, n).map(x => x.label + (x.weight > 0.7 ? ' (strong)' : '') + (x.level ? ` (${x.level})` : '')).join('; ');
  const lines = ['About the person asking, learned from their earlier conversations here. Use it to read the intent behind the question and to pitch the answer; never mention, list, or allude to this profile unless they ask about it. The current question always outranks it.'];
  if (g.intents.length) lines.push('Recent intents: ' + g.intents.slice(0, 3).map(i => i.text).join(' | '));
  const parts: Array<[string, number, string]> = [['topic', 8, 'Topics they care about'], ['entity', 6, 'Entities in their world'], ['goal', 4, 'Goals'], ['expertise', 5, 'Expertise'], ['style', 4, 'How they like answers']];
  for (const [t, n, label] of parts) { const s = fmt(t, n); if (s) lines.push(label + ': ' + s); }
  if (g.votes.down >= 2 && g.votes.down > g.votes.up) lines.push('They have marked several recent answers unhelpful: answer the literal question first, be more direct, and check the intent line before elaborating.');
  return lines.join('\n').slice(0, 1600);
}

export function forgetNode(g: GraphData, id: string) {
  delete g.nodes[id];
  for (const [k, e] of Object.entries(g.edges)) if (e.a === id || e.b === id) delete g.edges[k];
}
