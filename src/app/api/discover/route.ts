import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, truncate } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { quickJson } from '@/lib/llm';
import { loadGraph, topNodes } from '@/lib/graph';
import { graphFingerprint, sha256Hex, canonical, subjectId } from '@/lib/hash';
import { planFor } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const CATS = ['For you', 'Apps', 'Agents', 'Tools', 'Decentralized', 'Data & credentials', 'Content'] as const;
type Cat = typeof CATS[number];
/** What the card's preview shows: the screen the thing would open on, in the person's own terms. */
type Preview = { layout: 'dashboard' | 'list' | 'chat' | 'form' | 'table' | 'map' | 'editor' | 'cards' | 'profile' | 'timeline'; name: string; nav: string[]; items: string[]; stat?: { label: string; value: string } | null; cta?: string };
type Idea = { kind: string; title: string; what: string; builds: string[]; prompt: string; preview?: Preview; id?: string; graphHash?: string; at?: number; curated?: boolean };
const LAYOUTS = ['dashboard', 'list', 'chat', 'form', 'table', 'map', 'editor', 'cards', 'profile', 'timeline'] as const;
function cleanPreview(p: unknown): Preview | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const x = p as Record<string, unknown>;
  const layout = (LAYOUTS as readonly string[]).includes(String(x.layout)) ? String(x.layout) as Preview['layout'] : undefined;
  const strs = (v: unknown, n: number, max: number) => Array.isArray(v) ? v.map(i => truncate(String(i ?? ''), max)).filter(Boolean).slice(0, n) : [];
  const stat = x.stat && typeof x.stat === 'object' && (x.stat as Record<string, unknown>).value !== undefined ? { label: truncate(String((x.stat as Record<string, unknown>).label || ''), 18), value: truncate(String((x.stat as Record<string, unknown>).value), 8) } : null;
  if (!layout) return undefined;
  return { layout, name: truncate(String(x.name || ''), 20), nav: strs(x.nav, 4, 14), items: strs(x.items, 5, 34), stat, cta: truncate(String(x.cta || ''), 14) || undefined };
}

const Body = z.object({ category: z.string().refine(c => (CATS as readonly string[]).includes(c)), refresh: z.boolean().optional() });

/**
 * Discover: what the person's identity graph can become. Ideas are generated from their own
 * graph (topics, entities, goals, expertise, style, recent intents) and cached per person per
 * category per day. With a thin graph, curated examples show what a graph makes possible.
 */
/**
 * Every idea gets a SHA-256 id derived from who it was generated for, the exact graph fingerprint it
 * was drawn from, the category, the idea itself and the moment of generation. Threads started from
 * the idea carry the id, and nodes the thread adds to the graph carry it too, so lineage can be walked
 * back to where the idea first originated.
 */
async function stamp(items: Idea[], userId: string, graph: Awaited<ReturnType<typeof loadGraph>>, cat: string, curated: boolean): Promise<Idea[]> {
  const [subject, graphHash] = await Promise.all([subjectId(userId), graphFingerprint(graph)]);
  const at = Date.now();
  return Promise.all(items.map(async (it) => ({
    ...it, curated, graphHash, at,
    id: await sha256Hex(canonical({ v: 1, subject, graphHash, category: cat, title: it.title, what: it.what, prompt: it.prompt, at, curated })),
  })));
}

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Unknown category');
  const cat = b.data.category as Cat;
  const graph = await loadGraph(user.id);
  const nodeCount = Object.keys(graph.nodes).length;
  const caps = planFor(user.plan).caps;
  // Discover is generated from the graph on the Team plan; other plans see the curated examples of what it does.
  if (caps.discover !== 'full') return json({ items: await stamp(CURATED[cat], user.id, graph, cat, true), personal: false, locked: true, graphHash: await graphFingerprint(graph) });
  if (nodeCount < 3) return json({ items: await stamp(CURATED[cat], user.id, graph, cat, true), personal: false, graphHash: await graphFingerprint(graph) });

  const day = new Date().toISOString().slice(0, 10);
  const key = `${user.id}|${cat}`;
  const cached = await db().select().from(schema.discoverCache).where(and(eq(schema.discoverCache.category, key), eq(schema.discoverCache.day, day))).limit(1);
  if (cached[0] && !b.data.refresh) return json({ items: cached[0].items, personal: true, graphHash: (cached[0].items[0] as Idea | undefined)?.graphHash });

  const summary = [
    'Topics: ' + topNodes(graph, 'topic', 10).map(n => n.label).join('; '),
    'Entities: ' + topNodes(graph, 'entity', 6).map(n => n.label).join('; '),
    'Goals: ' + topNodes(graph, 'goal', 4).map(n => n.label).join('; '),
    'Expertise: ' + topNodes(graph, 'expertise', 5).map(n => n.label + (n.level ? ` (${n.level})` : '')).join('; '),
    'Style: ' + topNodes(graph, 'style', 3).map(n => n.label).join('; '),
    'Recent intents: ' + graph.intents.slice(0, 4).map(i => i.text).join(' | '),
  ].join('\n');
  const focus = CATEGORY_BRIEF[cat];
  const data = await quickJson<Idea[]>(`You help a person see what their personal identity graph makes possible. The graph below was learned from their own questions. Propose exactly 6 things they could create from it${focus}. Reply with only a JSON array of 6 objects: {"kind": short label for the type of thing (e.g. "Agent", "dApp", "Tool", "Credential", "Dataset", "Course"), "title": a specific name or headline under 70 characters, "what": one or two sentences (under 160 characters) saying what it is and what it does for them, "builds": 2 to 4 short labels naming the graph nodes it draws on, "prompt": the first question they should ask Ricorsa to start specifying or building it (a complete sentence), "preview": what its main screen would show, as {"layout": one of dashboard|list|chat|form|table|map|editor|cards|profile|timeline (the screen shape that fits it best), "name": the product's own short name (under 18 characters, no quotes), "nav": 3 short menu labels it would have, "items": 3 to 5 short, specific things that would appear on that screen (real row titles, message snippets, field names, card names or headings, drawn from the graph, under 30 characters each), "stat": for dashboards only, {"label", "value"} for the headline number, else null, "cta": the main button label (one or two words)}}. Make each idea concrete and grounded in the graph, not generic. Vary the ideas and the layouts. No markdown, valid JSON only.\n\nIdentity graph:\n${summary}`, 2600);
  const items = (Array.isArray(data) ? data : []).filter(x => x && typeof x.title === 'string' && typeof x.what === 'string').slice(0, 6).map(x => ({
    kind: truncate(x.kind || cat, 24), title: truncate(x.title, 90), what: truncate(x.what, 200),
    builds: Array.isArray(x.builds) ? x.builds.map(s => truncate(String(s), 40)).filter(Boolean).slice(0, 4) : [],
    prompt: truncate(x.prompt || x.title, 300),
    preview: cleanPreview(x.preview),
  }));
  if (items.length < 3) return json({ items: await stamp(CURATED[cat], user.id, graph, cat, true), personal: false, fallback: true, graphHash: await graphFingerprint(graph) });
  const stamped = await stamp(items, user.id, graph, cat, false);
  await db().insert(schema.discoverCache).values({ category: key, day, items: stamped })
    .onConflictDoUpdate({ target: [schema.discoverCache.category, schema.discoverCache.day], set: { items: stamped } });
  return json({ items: stamped, personal: true, graphHash: stamped[0]?.graphHash });
});

const CATEGORY_BRIEF: Record<Cat, string> = {
  'For you': ', mixing applications, agents, tools, decentralized services, portable data and content',
  'Apps': ' as applications (web or mobile) that use the graph as their data model or personalization layer',
  'Agents': ' as autonomous or semi-autonomous agents that act on their behalf using what the graph knows',
  'Tools': ' as small, focused tools and utilities (calculators, generators, checkers, templates) keyed to their graph',
  'Decentralized': ' as decentralized applications and services: self-owned identity, verifiable credentials, DID-linked profiles, token-gated communities, data unions, peer-to-peer marketplaces',
  'Data & credentials': ' as portable data products and credentials: exports, schemas, badges, verifiable claims, datasets they own and can license',
  'Content': ' as content they could author from their expertise: courses, newsletters, guides, talks, playbooks',
};

const CURATED: Record<Cat, Idea[]> = {
  'For you': [
    { kind: 'dApp', title: 'A profile you own, readable by any app you allow', what: 'Your graph as a self-owned identity document that services read with your consent instead of building their own profile of you.', builds: ['identity graph', 'consent'], prompt: 'How would I turn my Ricorsa identity graph into a self-owned profile that other apps can read with my permission?', preview: { layout: 'profile', name: 'My Profile', nav: ['Profile', 'Consent', 'Apps'], items: ['Topics: 14', 'Entities: 9', 'Expertise: 5', '3 apps allowed'], cta: 'Share' } },
    { kind: 'Agent', title: 'A research agent that briefs you on your topics', what: 'An agent that watches the subjects you keep returning to and sends a short, sourced brief when something changes.', builds: ['topics', 'recent intents'], prompt: 'Design a weekly research agent that uses my identity graph to decide what to watch and brief me on.', preview: { layout: 'chat', name: 'Brief', nav: ['Brief', 'Watchlist', 'Sources'], items: ['Two changes on your topics since Monday.', 'Go deeper on the second one.', 'Done. Three sources, one caveat.'], cta: 'Send' } },
    { kind: 'Credential', title: 'A verifiable credential for what you know', what: 'Expertise nodes that reach a threshold become a signed, portable claim you can present to a client, employer or community.', builds: ['expertise', 'topics'], prompt: 'How could repeated expertise in my graph become a verifiable credential I control?', preview: { layout: 'profile', name: 'Credential', nav: ['Claim', 'Evidence', 'Present'], items: ['Expert: primary area', 'Issued today', 'Signed by Ricorsa', 'Verifiable'], cta: 'Present' } },
    { kind: 'Tool', title: 'A prompt kit tuned to how you like answers', what: 'Your style nodes turned into reusable instructions for any assistant you use, so every tool answers you the same way.', builds: ['style', 'expertise'], prompt: 'Generate a reusable prompt kit from the style preferences in my graph.', preview: { layout: 'form', name: 'Prompt Kit', nav: ['Kit', 'Presets', 'Export'], items: ['Tone', 'Length', 'Format'], cta: 'Generate' } },
    { kind: 'Dataset', title: 'Your questions as a licensable dataset', what: 'An anonymized record of what you ask and why, exportable in a standard schema, yours to license or keep private.', builds: ['intents', 'topics'], prompt: 'What would it take to package my anonymized question history as a dataset I own and could license?', preview: { layout: 'table', name: 'Intent Data', nav: ['Rows', 'Schema', 'License'], items: ['Anonymized intents', 'Topics', 'Timestamps', 'Consent state'], cta: 'Export' } },
    { kind: 'Course', title: 'A short course from your strongest subjects', what: 'The topics with the most weight in your graph, organized into a syllabus you could teach or sell.', builds: ['topics', 'expertise'], prompt: 'Turn the strongest topics in my identity graph into a six-lesson course outline.', preview: { layout: 'editor', name: 'Course', nav: ['Outline', 'Lessons', 'Publish'], items: ['Lesson 1: Foundations', 'Lesson 2: The hard part', 'Lesson 3: In practice', 'Lesson 4: Your questions'], cta: 'Publish' } },
  ],
  'Apps': [
    { kind: 'App', title: 'A reading queue ranked by your graph', what: 'Anything you save gets scored against your topics and goals so the most relevant reading rises to the top.', builds: ['topics', 'goals'], prompt: 'Spec a reading queue app that ranks saved articles using my identity graph.', preview: { layout: 'list', name: 'Queue', nav: ['Queue', 'Saved', 'Done'], items: ['Ranked 1: matches 3 goals', 'Ranked 2: core topic', 'Ranked 3: new entity', 'Ranked 4: skim'], cta: 'Add' } },
    { kind: 'App', title: 'A meeting prep companion', what: 'Before a call, the app pulls the entities and goals in your graph that relate to the other party and drafts your talking points.', builds: ['entities', 'goals'], prompt: 'Design a meeting prep app that uses the entities and goals in my graph.', preview: { layout: 'dashboard', name: 'Prep', nav: ['Today', 'People', 'Notes'], items: ['Shared entities', 'Open goals', 'Talking points'], stat: { label: 'meetings today', value: '3' }, cta: 'Prepare' } },
    { kind: 'App', title: 'A personal knowledge base that files itself', what: 'Notes are auto-tagged with your graph nodes, so retrieval works the way you already think.', builds: ['topics', 'entities'], prompt: 'How would a notes app use my identity graph to auto-organize what I write?', preview: { layout: 'list', name: 'Notes', nav: ['All', 'Topics', 'Entities'], items: ['Auto-tagged: 2 topics', 'Filed under a goal', 'Linked to an entity', 'Untagged: 0'], cta: 'New note' } },
    { kind: 'App', title: 'A learning tracker with real levels', what: 'Expertise nodes and their levels become a skills map with suggested next steps.', builds: ['expertise'], prompt: 'Build a skills map app from the expertise nodes and levels in my graph.', preview: { layout: 'dashboard', name: 'Skills', nav: ['Map', 'Levels', 'Next'], items: ['Expert: 2 areas', 'Intermediate: 3', 'Suggested next step'], stat: { label: 'skills tracked', value: '5' }, cta: 'Review' } },
  ],
  'Agents': [
    { kind: 'Agent', title: 'An agent that negotiates with your goals in mind', what: 'Give it a purchase or a deal; it uses your stated goals and constraints to negotiate on your behalf and reports back.', builds: ['goals', 'entities'], prompt: 'Design an agent that negotiates on my behalf using the goals in my identity graph.', preview: { layout: 'chat', name: 'Negotiator', nav: ['Deal', 'Limits', 'Report'], items: ['Counter-offer sent, within your limit.', 'Hold at that number.', 'Holding. Their reply is due at 4pm.'], cta: 'Send' } },
    { kind: 'Agent', title: 'A drafting agent that writes in your voice', what: 'Style nodes and expertise levels shape every draft so you edit less.', builds: ['style', 'expertise'], prompt: 'How would a drafting agent use my style nodes to write the way I do?', preview: { layout: 'editor', name: 'Drafts', nav: ['Draft', 'Voice', 'History'], items: ['Cover note', 'Proposal intro', 'Follow-up email', 'Voice: short, numbers'], cta: 'Draft' } },
    { kind: 'Agent', title: 'A watchdog for the things in your world', what: 'It monitors the entities in your graph (companies, tools, places) and flags what changed and why it matters to your goals.', builds: ['entities', 'goals'], prompt: 'Spec a monitoring agent for the entities in my identity graph.', preview: { layout: 'timeline', name: 'Watchdog', nav: ['Alerts', 'Entities', 'Rules'], items: ['Pricing change at a tool you use', 'A company you follow hired', 'New release, breaking change', 'Quiet week'], cta: 'Review' } },
    { kind: 'Agent', title: 'A tutor that knows where you are', what: 'It teaches from your current expertise level toward the goal you named, and adjusts as the graph moves.', builds: ['expertise', 'goals'], prompt: 'Design a tutoring agent that adapts to the expertise levels in my graph.', preview: { layout: 'chat', name: 'Tutor', nav: ['Lesson', 'Progress', 'Goal'], items: ['You are intermediate here; skipping basics.', 'Show me the tricky case.', 'Here it is, with one worked example.'], cta: 'Send' } },
  ],
  'Tools': [
    { kind: 'Tool', title: 'A prompt kit from your style', what: 'Reusable instructions for any assistant, generated from how you like answers.', builds: ['style'], prompt: 'Generate a reusable prompt kit from the style preferences in my graph.', preview: { layout: 'form', name: 'Prompt Kit', nav: ['Kit', 'Presets', 'Export'], items: ['Tone', 'Length', 'Format'], cta: 'Generate' } },
    { kind: 'Tool', title: 'A glossary of your world', what: 'Definitions for the entities and topics in your graph, kept current, for onboarding people who work with you.', builds: ['entities', 'topics'], prompt: 'Create a glossary tool from the entities and topics in my identity graph.', preview: { layout: 'table', name: 'Glossary', nav: ['Terms', 'Entities', 'Share'], items: ['Core topic', 'A tool you use', 'A company', 'A project'], cta: 'Export' } },
    { kind: 'Tool', title: 'A decision checklist keyed to your goals', what: 'Before a decision, the tool asks the questions your goals and past intents say you forget.', builds: ['goals', 'intents'], prompt: 'Build a decision checklist generator from the goals and intents in my graph.', preview: { layout: 'form', name: 'Checklist', nav: ['Decide', 'Past', 'Goals'], items: ['What are you deciding?', 'Which goal does it serve?', 'What did you forget last time?'], cta: 'Generate' } },
    { kind: 'Tool', title: 'A weekly review generator', what: 'It reads what changed in your graph this week and drafts a review: what you explored, what you are working toward.', builds: ['intents', 'topics'], prompt: 'Design a weekly review tool that reads changes in my identity graph.', preview: { layout: 'timeline', name: 'Weekly', nav: ['This week', 'Trends', 'Export'], items: ['New topic explored', 'Goal moved forward', 'Entity added', 'Style noted'], cta: 'Review' } },
  ],
  'Decentralized': [
    { kind: 'dApp', title: 'A DID-linked profile that ports your graph', what: 'Your graph attached to a decentralized identifier, so you carry it between services instead of rebuilding it each time.', builds: ['identity graph', 'entities'], prompt: 'How would I link my identity graph to a decentralized identifier so it ports between services?', preview: { layout: 'profile', name: 'Portable ID', nav: ['DID', 'Graph', 'Services'], items: ['did:web:you', 'Graph attached', '4 services', 'Revocable'], cta: 'Connect' } },
    { kind: 'Credential', title: 'Verifiable claims of expertise', what: 'Expertise nodes that cross a threshold become W3C verifiable credentials you present anywhere.', builds: ['expertise'], prompt: 'How could expertise nodes in my graph become verifiable credentials?', preview: { layout: 'profile', name: 'Claims', nav: ['Claims', 'Issue', 'Verify'], items: ['Expert: main area', 'Intermediate: second', 'W3C VC', 'Signed'], cta: 'Present' } },
    { kind: 'dApp', title: 'A token-gated community for a shared topic', what: 'People whose graphs share a strong topic node can prove it without revealing the rest and join a gated space.', builds: ['topics'], prompt: 'Design a token-gated community where membership is proven from a topic node in an identity graph.', preview: { layout: 'cards', name: 'Circle', nav: ['Rooms', 'Members', 'Proofs'], items: ['Core topic room', 'Weekly call', 'Reading list', 'Proof of topic'], cta: 'Join' } },
    { kind: 'dApp', title: 'A data union for anonymized signals', what: 'Members pool anonymized graph signals, license them together, and share the revenue.', builds: ['intents', 'topics'], prompt: 'What would a data union built on anonymized identity graph signals look like?', preview: { layout: 'dashboard', name: 'Data Union', nav: ['Pool', 'Licenses', 'Payouts'], items: ['Members pooling', 'Active licenses', 'Your share'], stat: { label: 'members', value: '1,240' }, cta: 'Pool' } },
    { kind: 'dApp', title: 'A peer-to-peer expert marketplace', what: 'Match questions to people whose graphs show real expertise, with reputation carried by the graph rather than a platform.', builds: ['expertise', 'topics'], prompt: 'Spec a peer-to-peer expert marketplace that matches on identity graph expertise.', preview: { layout: 'cards', name: 'Experts', nav: ['Matches', 'Asks', 'Reputation'], items: ['Expert in your topic', 'Question matched', 'Reputation 4.9', 'Book a slot'], cta: 'Match' } },
    { kind: 'dApp', title: 'Consent receipts for every read', what: 'Every time an app reads part of your graph, a signed receipt records what, when and why, and you can revoke it.', builds: ['identity graph', 'consent'], prompt: 'Design a consent receipt system for apps that read my identity graph.', preview: { layout: 'timeline', name: 'Receipts', nav: ['Receipts', 'Apps', 'Revoke'], items: ['App read topics (why: ranking)', 'App read style', 'Revoked: old app', 'Nothing read'], cta: 'Revoke' } },
  ],
  'Data & credentials': [
    { kind: 'Export', title: 'Your graph as a schema.org Person', what: 'A standards-based export other systems already understand, generated from your nodes.', builds: ['entities', 'expertise'], prompt: 'Map my identity graph to a schema.org Person document.', preview: { layout: 'table', name: 'Person Export', nav: ['Fields', 'Preview', 'Export'], items: ['knowsAbout', 'affiliation', 'hasSkill', 'sameAs'], cta: 'Export' } },
    { kind: 'Badge', title: 'Expertise badges you can embed', what: 'Signed badges for the subjects your graph shows you know, embeddable on a site or profile.', builds: ['expertise'], prompt: 'How could I issue expertise badges from the levels in my graph?', preview: { layout: 'cards', name: 'Badges', nav: ['Badges', 'Embed', 'Verify'], items: ['Expert badge', 'Intermediate badge', 'Embed code', 'Verified'], cta: 'Embed' } },
    { kind: 'Dataset', title: 'An anonymized intent dataset', what: 'Your question history stripped of identifiers, structured, and yours to license or keep.', builds: ['intents'], prompt: 'Package my anonymized intents as a dataset I own.', preview: { layout: 'table', name: 'Intents', nav: ['Rows', 'Schema', 'License'], items: ['Intent (anonymized)', 'Topic', 'When', 'License'], cta: 'Export' } },
    { kind: 'Schema', title: 'A JSON-LD vocabulary for your domain', what: 'The topics and entities in your graph turned into a small vocabulary you can reuse across tools.', builds: ['topics', 'entities'], prompt: 'Create a JSON-LD vocabulary from the topics and entities in my graph.', preview: { layout: 'table', name: 'Vocabulary', nav: ['Terms', 'Context', 'Export'], items: ['Topic term', 'Entity term', 'Relation', '@context'], cta: 'Export' } },
  ],
  'Content': [
    { kind: 'Course', title: 'A course from your strongest topics', what: 'Your heaviest topics arranged into lessons, with the questions you asked as the exercises.', builds: ['topics', 'expertise'], prompt: 'Turn the strongest topics in my graph into a six-lesson course outline.', preview: { layout: 'editor', name: 'Course', nav: ['Outline', 'Lessons', 'Publish'], items: ['Lesson 1: Foundations', 'Lesson 2: The hard part', 'Lesson 3: In practice', 'Exercises: your questions'], cta: 'Publish' } },
    { kind: 'Newsletter', title: 'A newsletter only you could write', what: 'The intersection of your topics, framed by your goals, on a schedule.', builds: ['topics', 'goals'], prompt: 'Outline a newsletter based on the topic intersections in my identity graph.', preview: { layout: 'editor', name: 'Newsletter', nav: ['Issue', 'Subscribers', 'Send'], items: ['Issue 1: where two topics meet', 'Issue 2: a goal, honestly', 'Issue 3: what changed', 'Schedule: weekly'], cta: 'Send' } },
    { kind: 'Talk', title: 'A conference talk from your intents', what: 'The problems you keep trying to solve, told as a story with what you learned.', builds: ['intents', 'expertise'], prompt: 'Draft a talk abstract from the recurring intents in my graph.', preview: { layout: 'editor', name: 'Talk', nav: ['Abstract', 'Slides', 'Notes'], items: ['The problem I kept hitting', 'What I tried', 'What worked', 'What I would tell you'], cta: 'Export' } },
    { kind: 'Playbook', title: 'A playbook for people like you', what: 'What your graph shows you had to figure out, written as steps for the next person.', builds: ['goals', 'intents'], prompt: 'Write a playbook outline from the goals and intents in my identity graph.', preview: { layout: 'editor', name: 'Playbook', nav: ['Steps', 'Pitfalls', 'Share'], items: ['Step 1: what to decide first', 'Step 2: the trap', 'Step 3: the shortcut', 'Checklist'], cta: 'Publish' } },
  ],
};
