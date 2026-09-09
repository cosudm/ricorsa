import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { loadGraph, topNodes } from '@/lib/graph';
import { graphFingerprint } from '@/lib/hash';
import { quickJson } from '@/lib/llm';
import { db, schema } from '@/lib/db';
import type { GraphData } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/prompts  — the suggestion cards on the Home screen.
 * Nothing is suggested until the person has started using Ricorsa. After that the cards are
 * generated from their own identity graph and aimed at the parts of it that are still thin
 * (goals, expertise, entities, style), so each suggested question builds out a specific kind
 * of node. Regenerated whenever the graph changes (keyed by its fingerprint).
 */
export type Prompt = { q: string; aspect: 'topic' | 'entity' | 'goal' | 'expertise' | 'style'; why: string };

const ASPECT_WORDS: Record<Prompt['aspect'], string> = {
  topic: 'a topic they care about', entity: 'a named thing in their world (a tool, company, product, place or project)',
  goal: 'a longer-term goal', expertise: 'their level of expertise in an area', style: 'how they like answers written',
};

export const GET = handle(async () => {
  const user = await currentUser();
  const graph = await loadGraph(user.id);
  const nodeCount = Object.keys(graph.nodes).length;
  if (!graph.events || nodeCount === 0) return json({ items: [], reason: 'new' });

  const hash = await graphFingerprint(graph);
  const key = `${user.id}|prompts:v2`;
  const rows = await db().select().from(schema.discoverCache).where(and(eq(schema.discoverCache.category, key), eq(schema.discoverCache.day, hash.slice(0, 32)))).limit(1);
  if (rows[0]) return json({ items: rows[0].items, graphHash: hash });

  const items = (await generate(graph)) || fallback(graph);
  await db().insert(schema.discoverCache).values({ category: key, day: hash.slice(0, 32), items: items as unknown as Record<string, unknown>[] }).onConflictDoNothing();
  return json({ items, graphHash: hash });
});

/** Which node types are thinnest, so the prompts can aim at them. */
function gaps(g: GraphData): Prompt['aspect'][] {
  const counts: Record<string, number> = { topic: 0, entity: 0, goal: 0, expertise: 0, style: 0 };
  for (const n of Object.values(g.nodes)) counts[n.type] = (counts[n.type] || 0) + 1;
  return (['goal', 'expertise', 'entity', 'style', 'topic'] as Prompt['aspect'][]).sort((a, b) => counts[a] - counts[b]);
}

async function generate(g: GraphData): Promise<Prompt[] | null> {
  const thin = gaps(g).slice(0, 3);
  const summary = [
    'Topics: ' + topNodes(g, 'topic', 8).map(n => n.label).join('; '),
    'Entities: ' + topNodes(g, 'entity', 6).map(n => n.label).join('; '),
    'Goals: ' + topNodes(g, 'goal', 4).map(n => n.label).join('; '),
    'Expertise: ' + topNodes(g, 'expertise', 5).map(n => n.label + (n.level ? ` (${n.level})` : '')).join('; '),
    'Style: ' + topNodes(g, 'style', 3).map(n => n.label).join('; '),
    'Recent intents: ' + g.intents.slice(0, 4).map(i => i.text).join(' | '),
  ].join('\n');
  const data = await quickJson<Prompt[]>(
    `You write the four suggested questions shown on a person's home screen in Ricorsa, an answer engine that learns them through an identity graph. The graph below was learned from their own questions. Write exactly 4 requests they would plausibly type into Ricorsa next, in their own voice (first person, under 100 characters each, natural, specific to their graph, no generic trivia). They must be things the person asks Ricorsa, never questions asked of the person: not "What is your experience with X?" but "Give me an expert-level walkthrough of X"; not "Do you want step-by-step answers?" but "Show me, step by step, how to ...". Each request must be designed so that answering it reveals a particular kind of node for the graph: a request that shows their level reveals expertise; one that names what they are trying to achieve reveals a goal; one that names a tool or company reveals an entity; one that asks for a particular format reveals style. The thinnest parts of the graph right now are: ${thin.join(', ')}; aim at least three questions at those. Aspects: topic = ${ASPECT_WORDS.topic}; entity = ${ASPECT_WORDS.entity}; goal = ${ASPECT_WORDS.goal}; expertise = ${ASPECT_WORDS.expertise}; style = ${ASPECT_WORDS.style}. Reply with only a JSON array of 4 objects {"q": the question, "aspect": one of topic|entity|goal|expertise|style, "why": under 60 characters, addressed to them as "you", saying what this adds to their graph}. Valid JSON only.\n\nIdentity graph:\n${summary}`,
    700,
  );
  if (!Array.isArray(data)) return null;
  const clean = data
    .filter(p => p && typeof p.q === 'string' && p.q.trim().length > 8)
    .map(p => ({ q: p.q.trim().slice(0, 140), aspect: (['topic', 'entity', 'goal', 'expertise', 'style'].includes(p.aspect) ? p.aspect : 'topic') as Prompt['aspect'], why: String(p.why || '').trim().slice(0, 90) }))
    .slice(0, 4);
  return clean.length >= 2 ? clean : null;
}

/** Templated suggestions from the graph when generation is unavailable. */
function fallback(g: GraphData): Prompt[] {
  const topic = topNodes(g, 'topic', 1)[0]?.label || 'what I have been asking about';
  const entity = topNodes(g, 'entity', 1)[0]?.label;
  const out: Prompt[] = [
    { q: `What should I aim for next with ${topic}, and how would I know I got there?`, aspect: 'goal', why: 'Adds a goal to your graph' },
    { q: `Which tools or companies matter most in ${topic} right now?`, aspect: 'entity', why: 'Adds entities to your graph' },
    { q: `Give me an expert-level explanation of the hardest part of ${topic}.`, aspect: 'expertise', why: 'Shows your level in the area' },
    { q: entity ? `Compare ${entity} with its closest alternative for my situation.` : `Explain ${topic} the way I like: short, with numbers.`, aspect: entity ? 'entity' : 'style', why: entity ? 'Connects an entity you use' : 'Teaches Ricorsa your style' },
  ];
  return out;
}
