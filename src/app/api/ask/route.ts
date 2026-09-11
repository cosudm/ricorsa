import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError } from '@/lib/http';
import { assertQuota, recordUsage } from '@/lib/usage';
import { createThread, getThreadOwned, makeTurn, saveTurns } from '@/lib/threads';
import { searchPlan, planQueries, retrieve, readPages, sourcesBlock, type Source } from '@/lib/search';
import { loadGraph, saveGraph, mergeLearned, graphPromptBlock } from '@/lib/graph';
import { buildMessages, dynamicSystem, systemBlocks } from '@/lib/prompt';
import { streamAnswer, describeProviderError } from '@/lib/llm';
import { parseStream } from '@/lib/parse';
import { estimateCostMicros } from '@/lib/plans';
import { db, schema } from '@/lib/db';
import type { Turn } from '@/lib/db/schema';
import { chain } from '@/lib/hash';
import { connectorsForModel, connectorsPromptBlock } from '@/lib/connectors';
import { planFor } from '@/lib/plans';
import { loadAttachments, claimAttachments, filesBlock, metaOf } from '@/lib/files';
import { isVaultConnector, numberVaultHits, numberVaultPages } from '@/lib/vault';

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
  /** Ids of files uploaded through /api/files for this question. */
  attachments: z.array(z.string().max(60)).max(20).optional(),
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
      if (body.attachments?.length) {
        // Files uploaded for this question: only the person's own, only pending or already on this thread, within the plan's count.
        const cap = user.admin ? 20 : planFor(user.plan).caps.files.perQuestion;
        const rows = (await loadAttachments(user.id, body.attachments, thread.id)).slice(0, cap);
        if (rows.length) { await claimAttachments(rows.map(r => r.id), thread.id); turn.attachments = rows.map(metaOf); }
      }
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

        // 0. Attached files: this question's and, for follow-ups, earlier ones on the thread (newest first), within the budget.
        const attIds = [...(turn.attachments || []).map(a => a.id), ...history.slice().reverse().flatMap(h => (h.attachments || []).map(a => a.id))].filter((v, i, a) => a.indexOf(v) === i);
        const attRows = attIds.length ? await loadAttachments(user.id, attIds, th.id) : [];
        const currentIds = new Set((turn.attachments || []).map(a => a.id));
        const attached = attIds.map(id => attRows.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).map(r => ({ name: r.name, text: r.text, chars: r.chars, current: currentIds.has(r.id) }));
        const fileText = filesBlock(attached);
        // With files on the question, the web is only searched when the person asks for it (or in Research mode).
        const wantsWeb = /\b(search|web|online|internet|latest|current|recent|news|look up|compare (?:with|to|against) (?:the )?(?:web|market|industry|others))\b/i.test(turn.q);
        const filesFirst = !!(turn.attachments && turn.attachments.length) && turn.mode !== 'research' && !wantsWeb;

        // 1. Retrieval: Ricorsa searches the web itself and numbers what it finds; the model reads and cites it.
        const search = filesFirst ? null : searchPlan(turn.mode, turn.focus);
        let sources: Source[] = [];
        let searches = 0;
        send('status', { text: filesFirst ? `Reading ${attached.length === 1 ? attached[0].name : `${attached.length} files`}` : search ? 'Searching the web' : 'Writing' });
        send('sources', []);
        if (search) {
          try {
            const queries = await planQueries(turn.q, turn.mode, turn.focus, history.slice(-3).map(h => h.q));
            for (const q of queries.slice(0, 2)) send('status', { text: `Searching: ${q.replace(/\s*\(site:[^)]*\)/, '').slice(0, 80)}` });
            const r = await retrieve(queries.slice(0, search.maxUses), turn.mode === 'research' ? 6 : 8, ctl.signal);
            sources = r.sources; searches = r.searches;
            turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
            send('sources', turn.sources);
            if (turn.mode === 'research' && sources.length) { send('status', { text: 'Reading the top pages' }); await readPages(sources, 5, ctl.signal); }
          } catch (e) { console.warn('[search] retrieval failed', String((e as Error)?.message || e)); }
        }

        // 2. Context: profile + space + connectors
        const graph = await loadGraph(user.id);
        const profile = graphPromptBlock(graph);
        let space = null;
        if (th.spaceId) { const rows = await db().select().from(schema.spaces).where(and(eq(schema.spaces.id, th.spaceId), eq(schema.spaces.userId, user.id))).limit(1); space = rows[0] || null; }
        let mcp: Awaited<ReturnType<typeof connectorsForModel>> = [];
        try { mcp = await connectorsForModel(user.id, user.admin ? 100 : planFor(user.plan).caps.connectors); } catch (e) { console.warn('connectors unavailable', e); }
        // Vault connectors: their search hits and read pages become numbered sources the answer can cite and the reader can open.
        const vaultByServer = new Map(mcp.filter(m => isVaultConnector({ preset: m.preset, url: m.url })).map(m => [m.name, m.id]));
        const system = systemBlocks(dynamicSystem({ mode: turn.mode, focus: turn.focus, length: turn.length, profile, space, connectors: connectorsPromptBlock(mcp), files: attached.map(a => a.name) }));
        const messages = buildMessages(history, turn.q, sourcesBlock(sources), fileText);
        turn.tools = [];

        // 3. Generation: the model reads the sources, calls connector tools when it needs them, and writes
        let wroteText = false;
        send('status', { text: turn.mode === 'research' ? 'Working through the sources' : attached.length ? 'Reading the files and writing' : 'Writing' });
        const result = await streamAnswer({
          tier: turn.tier, system, messages, signal: ctl.signal, search,
          mcp: mcp.map(m => ({ name: m.name, label: m.label, url: m.url, token: m.token, allowedTools: m.allowedTools, tools: m.tools })),
          maxTokens: turn.mode === 'research' ? 9000 : (turn.length === 'detailed' || attached.length ? 6000 : 4000),
          onStatus: (text) => { if (!wroteText) send('status', { text }); },
          onToolResult: (call, r) => {
            const connId = vaultByServer.get(call.server); if (!connId) return;
            const out = call.name === 'vault_search' ? numberVaultHits(connId, r.text, r.structured, sources.length, sources) : (call.name === 'vault_read' || call.name === 'vault_document') ? numberVaultPages(connId, r.text, r.structured, sources.length, sources) : null;
            if (!out || !out.added.length) return out?.text;
            sources = [...sources, ...out.added];
            turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
            send('sources', turn.sources);
            return out.text;
          },
          onTool: (call) => { const label = mcp.find(m => m.name === call.server)?.label || call.server; const i = (turn.tools || []).findIndex(t => t.server === label && t.name === call.name && t.error === undefined); const rec = { server: label, name: call.name, error: call.error }; if (i >= 0) turn.tools![i] = rec; else if (!(turn.tools || []).some(t => t.server === label && t.name === call.name && t.error === call.error)) turn.tools = [...(turn.tools || []), rec]; send('tools', turn.tools); },
          onText: (delta) => { if (!wroteText) { wroteText = true; send('status', { text: turn.mode === 'research' ? 'Writing the report' : 'Writing' }); } raw += delta; send('delta', { text: delta }); },
        });
        result.sources = sources; result.usage.searches = searches;
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
        const err = e as { name?: string };
        if (err?.name === 'AbortError' || ctl.signal.aborted) {
          const p = parseStream(raw); turn.answer = p.answer; turn.related = p.related; turn.status = 'stopped';
          if (raw.length > 200) await recordUsage(user.id, { questions: 1 });
          send('done', { turn });
        } else {
          const why = describeProviderError(e);
          console.error('ask failed', JSON.stringify({ code: why.code, status: why.status, type: why.type, message: why.message, user: user.id }));
          const p = parseStream(raw); turn.answer = p.answer; turn.status = 'error';
          turn.error = why.code;
          send('error', { code: turn.error, message: user.admin ? why.forAdmin : why.forUser, turn });
        }
      } finally {
        await finish();
      }
    },
    cancel() { ctl.abort(); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
