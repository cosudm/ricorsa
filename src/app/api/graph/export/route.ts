import { desc, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { loadGraph, graphView } from '@/lib/graph';
import { graphFingerprint, subjectId, short } from '@/lib/hash';
import { planFor } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * GET /api/graph/export: the graph with its provenance, as one JSON document a person (or their auditor) can keep:
 * the graph's SHA-256 fingerprint, the non-reversible subject id, every node with its weight, origin and map anchor,
 * the connections, the intents, and for full-graph plans the lineage chain of every thread (its origin idea, every
 * turn's hash and the nodes each turn added). `?summary=1` returns the numbers and the latest lineage entries for the
 * Graph page's Provenance panel instead of the download.
 */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  const url = new URL(req.url);
  const caps = planFor(user.plan).caps;
  const full = await loadGraph(user.id);
  const view = graphView(full, caps);
  const [fingerprint, subject] = await Promise.all([graphFingerprint(full), subjectId(user.id)]);
  const nodes = Object.values(view.nodes).sort((a, b) => b.weight - a.weight);
  const byTurn = new Map<string, string[]>();
  for (const n of Object.values(full.nodes)) if (n.origin?.turnId) byTurn.set(n.origin.turnId, [...(byTurn.get(n.origin.turnId) || []), n.id]);

  type ThreadChain = { id: string; title: string; createdAt: number; spaceId: string | null; origin: unknown; turns: Array<{ id: string; at: number; question: string; mode: string; lineage: string | null; model?: string; added: string[] }> };
  let threads: ThreadChain[] = [];
  if (caps.graph === 'full') {
    const rows = await db().select({ id: schema.threads.id, title: schema.threads.title, createdAt: schema.threads.createdAt, spaceId: schema.threads.spaceId, origin: schema.threads.origin, turns: schema.threads.turns }).from(schema.threads).where(eq(schema.threads.userId, user.id)).orderBy(desc(schema.threads.updatedAt)).limit(300);
    threads = rows.map(t => ({ id: t.id, title: t.title, createdAt: new Date(t.createdAt).getTime(), spaceId: t.spaceId, origin: t.origin || null, turns: (t.turns || []).map(x => ({ id: x.id, at: x.createdAt, question: String(x.q || '').slice(0, 200), mode: x.mode, lineage: x.lineage || null, model: undefined, added: byTurn.get(x.id) || [] })) }));
  }

  if (url.searchParams.get('summary') === '1') {
    const anchored = nodes.filter(n => n.geo).length;
    const withOrigin = Object.values(full.nodes).filter(n => n.origin).length;
    const fromIdeas = Object.values(full.nodes).filter(n => n.origin?.ideaId).length;
    const latest = threads.flatMap(t => t.turns.map(x => ({ threadId: t.id, thread: t.title, turnId: x.id, at: x.at, lineage: x.lineage, added: x.added.length, fromIdea: !!(t.origin as { ideaId?: string } | null)?.ideaId }))).sort((a, b) => b.at - a.at).slice(0, 8);
    return json({ fingerprint, short: short(fingerprint), subject, events: full.events, nodes: Object.keys(full.nodes).length, edges: Object.keys(full.edges).length, intents: full.intents.length, anchored, withOrigin, fromIdeas, threads: threads.length, turns: threads.reduce((a, t) => a + t.turns.length, 0), latest, full: caps.graph === 'full', updatedAt: full.updatedAt });
  }

  const body = {
    product: 'Ricorsa', format: 'ricorsa-graph-export', version: 2, exportedAt: new Date().toISOString(),
    account: { subject, email: user.email, plan: planFor(user.plan).key, graphAccess: caps.graph },
    provenance: {
      fingerprint,
      how: 'fingerprint = SHA-256 over canonical JSON of {v:1, events, nodes:[id:weight(3dp):count sorted], edges:[keys sorted]}; subject = SHA-256("ricorsa:subject:" + account id); each turn lineage = SHA-256 over canonical JSON of {prev, threadId, turnId, question, mode, at}, chained from the thread origin (the idea id when the thread began in Discover, else the thread id); a Discover idea id = SHA-256 over {v:1, subject, graphHash, category, title, what, prompt, at, curated}.',
    },
    graph: {
      events: full.events, paused: full.paused, votes: full.votes, updatedAt: full.updatedAt,
      nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, weight: Math.round(n.weight * 1000) / 1000, count: n.count, firstSeen: n.firstSeen, lastSeen: n.lastSeen, level: n.level, origin: n.origin || null, place: !!n.place, geo: n.geo || null, geoName: n.geoName, geoKind: n.geoKind, geoBox: n.geoBox })),
      edges: Object.values(view.edges).map(e => ({ a: e.a, b: e.b, weight: Math.round(e.weight * 1000) / 1000, lastSeen: e.lastSeen })),
      intents: view.intents,
    },
    threads,
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="ricorsa-graph-${short(fingerprint)}.json"`, 'Cache-Control': 'private, no-store' } });
});
