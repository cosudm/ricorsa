import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError } from '@/lib/http';
import { assertQuota, recordUsage } from '@/lib/usage';
import { createThread, getThreadOwned, makeTurn, saveTurns } from '@/lib/threads';
import { searchPlan, type Source } from '@/lib/search';
import { loadGraph, saveGraph, mergeLearned, graphPromptBlock } from '@/lib/graph';
import { buildMessages, dynamicSystem, systemBlocks } from '@/lib/prompt';
import { streamAnswer } from '@/lib/llm';
import { parseStream } from '@/lib/parse';
import { estimateCostMicros } from '@/lib/plans';
import { db, schema } from '@/lib/db';
import type { Turn } from '@/lib/db/schema';
import { chain } from '@/lib/hash';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  threadId: z.string().optional(),
  question: z.string().trim().min(1).max(4000).optional(),
  mode: z.enum(['search', 'research']).default('search'),
  tier: z.enum(['quick', 'default', 'complex']).default('default'),
  focus: z.enum(['web', 'academic', 'writing', 'math', 'code']).default('web'),
  length: z.enum(['concise', 'balanced', 'detailed']).nullable().optional(),
  spaceId: z.string().nullable().optional(),
  rewrite: z.object({ turnId: z.string(), how: z.enum(['again', 'concise', 'detailed', 'complex', 'research']) }).optional(),
});

/**
 * POST /api/ask  — the answer pipeline, streamed as server-sent events:
 *   meta → status → sources → delta* → done | error
 */
export async function POST(req: Request) {
  let user; try { user = await currentUser(); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message, e.code) : fail(500, 'Sign-in check failed'); }
  const parsed = Body.safeParse(await readJson(req).catch(() => ({})));
  if (!parsed.success) return fail(400, 'Invalid request', 'invalid_request');
  const body = parsed.data;

  // Resolve thread + turn
  let thread, turns: Turn[], turn: Turn, history: Turn[];
  try {
    if (body.rewrite) {
      if (!body.threadId) return fail(400, 'threadId required for a rewrite');
      thread = await getThreadOwned(user.id, body.threadId);
      turns = [...thread.turns];
      const idx = turns.findIndex(t => t.id === body.rewrite!.turnId);
      if (idx < 0) return fail(404, 'Turn not found');
      turn = { ...turns[idx] };
      if (body.rewrite.how === 'concise') turn.length = 'concise';
      if (body.rewrite.how === 'detailed') turn.length = 'detailed';
      if (body.rewrite.how === 'complex') turn.tier = 'complex';
      if (body.rewrite.how === 'research') turn.mode = 'research';
      turns[idx] = turn; history = turns.slice(0, idx);
    } else {
      if (!body.question) return fail(400, 'question required');
      if (body.threadId) { thread = await getThreadOwned(user.id, body.threadId); }
      else { thread = await createThread(user.id, body.question, body.spaceId || null); }
      turns = [...thread.turns]; history = turns.slice();
      turn = makeTurn(body.question, body);
      const prev = history.length ? history[history.length - 1].lineage : (thread.origin?.ideaId || thread.id);
      turn.lineage = await chain(prev, { threadId: thread.id, turnId: turn.id, question: turn.q, mode: turn.mode, at: turn.createdAt });
      turns.push(turn);
    }
    await assertQuota(user, turn.mode, turn.tier);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.code);
    console.error(e); return fail(500, 'Could not start the answer');
  }

  Object.assign(turn, { status: 'running', error: null, answer: '', related: [], sources: [], learned: null, learnedMerged: false, truncated: false, tierApplied: null });
  await saveTurns(thread, turns);

  const ctl = new AbortController();
  req.signal?.addEventListener('abort', () => ctl.abort());
  const enc = new TextEncoder();
  const th = thread;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      let raw = '';
      const finish = async () => { try { await saveTurns(th, turns); } catch (e) { console.error('save failed', e); } try { controller.close(); } catch {} };
      try {
        send('meta', { threadId: th.id, turnId: turn.id, title: th.title });

        // 1. Retrieval happens inside the model call (Anthropic web search); decide how much is allowed.
        const search = searchPlan(turn.mode, turn.focus);
        let sources: Source[] = [];
        send('status', { text: search ? 'Searching the web' : 'Writing' });
        send('sources', []);

        // 2. Context: profile + space
        const graph = await loadGraph(user.id);
        const profile = graphPromptBlock(graph);
        let space = null;
        if (th.spaceId) { const rows = await db().select().from(schema.spaces).where(and(eq(schema.spaces.id, th.spaceId), eq(schema.spaces.userId, user.id))).limit(1); space = rows[0] || null; }
        const system = systemBlocks(dynamicSystem({ mode: turn.mode, focus: turn.focus, length: turn.length, profile, space }));
        const messages = buildMessages(history, turn.q);

        // 3. Generation: the model searches, reads, and writes; sources and citations stream out as they appear
        let wroteText = false;
        const result = await streamAnswer({
          tier: turn.tier, system, messages, signal: ctl.signal, search,
          maxTokens: turn.mode === 'research' ? 9000 : (turn.length === 'detailed' ? 6000 : 4000),
          onStatus: (text) => { if (!wroteText) send('status', { text }); },
          onSources: (list) => { sources = list; turn.sources = list.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url })); send('sources', turn.sources); },
          onText: (delta) => { if (!wroteText) { wroteText = true; send('status', { text: turn.mode === 'research' ? 'Working through the sources' : 'Writing' }); } raw += delta; send('delta', { text: delta }); },
        });
        raw = result.text;
        sources = result.sources;
        turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
        const p = parseStream(raw);
        turn.answer = p.answer; turn.related = p.related; turn.learned = p.learned; turn.truncated = result.truncated; turn.tierApplied = turn.tier; turn.model = result.model;
        turn.usage = { in: result.usage.in, out: result.usage.out, cacheRead: result.usage.cacheRead, searches: result.usage.searches };
        turn.status = 'done';

        // 4. The loop: learn, then meter
        if (turn.learned) { try { const touched = mergeLearned(graph, turn, th.id, { ideaId: th.origin?.ideaId }); if (touched) await saveGraph(user.id, graph); } catch (e) { console.warn('learn failed', e); } }
        await recordUsage(user.id, { questions: 1, research: turn.mode === 'research' ? 1 : 0, searches: result.usage.searches, tokensIn: result.usage.in, tokensOut: result.usage.out, costMicros: estimateCostMicros(turn.tier, result.usage.in, result.usage.out, result.usage.cacheRead, result.usage.searches) });
        send('done', { turn, graphEvents: graph.events });
      } catch (e) {
        const err = e as { name?: string; status?: number; message?: string };
        if (err?.name === 'AbortError' || ctl.signal.aborted) {
          const p = parseStream(raw); turn.answer = p.answer; turn.related = p.related; turn.status = 'stopped';
          if (raw.length > 200) await recordUsage(user.id, { questions: 1 });
          send('done', { turn });
        } else {
          console.error('ask failed', e);
          const p = parseStream(raw); turn.answer = p.answer; turn.status = 'error';
          turn.error = err?.status === 429 ? 'rate_limited' : err?.status === 529 || err?.status === 503 ? 'upstream_error' : 'upstream_error';
          send('error', { code: turn.error, message: turn.error === 'rate_limited' ? 'The model is busy right now. Try again in a moment.' : 'The answer was interrupted. Try again.', turn });
        }
      } finally {
        await finish();
      }
    },
    cancel() { ctl.abort(); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
