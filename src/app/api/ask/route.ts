import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError } from '@/lib/http';
import { assertQuota, assertBrowseQuota, recordUsage, chargeGas, questionCost, type GasReceipt, capabilityPlan } from '@/lib/usage';
import { GAS } from '@/lib/plans';
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
import { loadAttachments, claimAttachments, filesBlock, metaOf } from '@/lib/files';
import { isVaultConnector, numberVaultHits, numberVaultPages } from '@/lib/vault';
import { CONSOLE_GUIDE, consoleContext } from '@/lib/console';
import { SITE_PRESET, numberSiteHits, numberSitePage } from '@/lib/sites';
import { geocodePending } from '@/lib/geo';
import { recall, remember, numberRecalled, backfillOnce, memoryEnabled } from '@/lib/memory';
import { selectFilePassages, numberFilePassages, isLookup } from '@/lib/passages';
import { BrowseSession, browserGuide, browserAvailable, MAX_ACTIONS_PER_ANSWER } from '@/lib/browse';
import { resumableSession, registerLiveSession, closeOtherSessions, rememberedSites } from '@/lib/browse-live';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  threadId: z.string().optional(),
  question: z.string().trim().min(1).max(4000).optional(),
  mode: z.enum(['search', 'research']).default('search'),
  tier: z.enum(['quick', 'default', 'complex']).default('default'),
  focus: z.enum(['web', 'academic', 'technical', 'legal', 'writing', 'math', 'code']).default('web'),
  length: z.enum(['concise', 'balanced', 'detailed']).nullable().optional(),
  spaceId: z.string().nullable().optional(),
  rewrite: z.object({ turnId: z.string(), how: z.enum(['again', 'concise', 'detailed', 'complex', 'research']) }).optional(),
  /** Ids of files uploaded through /api/files for this question. */
  attachments: z.array(z.string().max(60)).max(20).optional(),
  /** Open the site and work it in Ricorsa's browser while the person watches (Professional and Enterprise). */
  browse: z.boolean().optional(),
  /** Carry on from the page an earlier turn of this thread left open (after the person took it over and handed it back). */
  resumeTurnId: z.string().max(60).optional(),
});

/** Whether the question names a website to open, so the web need not be searched first. */
const NAMES_A_SITE = /https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|ai|app|dev|gov|edu|us|uk|ca|au|de|fr|es|it|nl|info|biz|me|tv|xyz|shop|store|online|site)\b(?:\/\S*)?/i;

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
  let browseCap = 0;
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
      if (body.browse) { turn.browse = true; if (turn.tier === 'quick') turn.tier = 'default'; }
      if (body.attachments?.length) {
        // Files uploaded for this question: only the person's own, only pending or already on this thread, within the plan's count.
        const cap = user.admin ? 20 : capabilityPlan(user).caps.files.perQuestion;
        const rows = (await loadAttachments(user.id, body.attachments, thread.id)).slice(0, cap);
        if (rows.length) { await claimAttachments(rows.map(r => r.id), thread.id); turn.attachments = rows.map(metaOf); }
      }
      const prev = history.length ? history[history.length - 1].lineage : (thread.origin?.ideaId || thread.id);
      turn.lineage = await chain(prev, { threadId: thread.id, turnId: turn.id, question: turn.q, mode: turn.mode, at: turn.createdAt });
      turns.push(turn);
    }
    await assertQuota(user, turn.mode, turn.tier);
    if (turn.browse) {
      const q = await assertBrowseQuota(user);
      browseCap = Math.max(1, Math.min(MAX_ACTIONS_PER_ANSWER, Number.isFinite(q.remaining) ? q.remaining : MAX_ACTIONS_PER_ANSWER));
      if (!browserAvailable()) return fail(503, "Ricorsa's browser is not available right now. Try again in a little while, or ask without opening the site.", 'browser_unavailable');
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, e.code);
    console.error(e); return fail(500, 'Could not start the answer');
  }

  Object.assign(turn, { status: 'running', error: null, answer: '', related: [], sources: [], learned: null, learnedMerged: false, truncated: false, tierApplied: null, browser: undefined });
  await saveTurns(thread, turns);

  const ctl = new AbortController();
  req.signal?.addEventListener('abort', () => ctl.abort());
  const enc = new TextEncoder();
  const th = thread;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      let raw = '';
      let browse: BrowseSession | null = null;
      let resumedFrom: string | null = null;
      // A browsing answer leaves its page open for a few minutes, for the person to take over or a follow-up to carry on from.
      const leavePage = async () => {
        const b = browse; if (!b) return; browse = null;
        try {
          const live = b.hasPage ? await b.release() : (await b.close(), null);
          if (live && turn.browser) { const until = await registerLiveSession({ userId: user.id, threadId: th.id, turnId: turn.id, sessionId: live.sessionId, url: live.url, title: live.title, replaces: resumedFrom }); turn.browser.live = { until }; }
        } catch (e) { console.warn('[browse] could not leave the page open', String((e as Error)?.message || e).slice(0, 160)); try { await b.close(); } catch {} }
      };
      const finish = async () => { await leavePage(); try { await saveTurns(th, turns); } catch (e) { console.error('save failed', e); } try { controller.close(); } catch {} };
      // The gauge: what this answer cost (the question, plus one gas per browser action) and what is left afterwards.
      const charge = async (browserActions: number, counted: boolean): Promise<GasReceipt | null> => {
        const cost = (counted ? questionCost(turn.mode, turn.tier) : 0) + GAS.browserAction * browserActions;
        if (!cost) return null;
        try { const r = await chargeGas(user, cost); turn.gas = (turn.gas || 0) + r.cost; return r; } catch (e) { console.warn('[gas] not charged', String((e as Error)?.message || e).slice(0, 160)); return null; }
      };
      const receipt = (r: GasReceipt | null) => r ? { cost: r.cost, remaining: r.unlimited ? null : r.remaining, unlimited: r.unlimited } : null;
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
        //    When the person asked Ricorsa to open a site they named, the browser goes straight there instead.
        const search = filesFirst || (turn.browse && NAMES_A_SITE.test(turn.q)) ? null : searchPlan(turn.mode, turn.focus);
        let sources: Source[] = [];
        let searches = 0;
        send('status', { text: filesFirst ? `Reading ${attached.length === 1 ? attached[0].name : `${attached.length} files`}` : search ? 'Searching the web' : turn.browse ? 'Opening the browser' : 'Writing' });
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

        // 1a. The attached files, passage by passage: the ones that bear on the question are numbered after the web sources,
        //     each with its page, slide or rows and a link that opens the file in the viewer at that passage, highlighted.
        if (attRows.length) {
          try {
            const picks = selectFilePassages(attIds.map(id => attRows.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).map(r => ({ id: r.id, name: r.name, text: r.text, current: currentIds.has(r.id) })), turn.q, turn.mode === 'research' || isLookup(turn.q) ? 12 : 6);
            if (picks.length) {
              sources = [...sources, ...numberFilePassages(picks, sources.length, th.id, turn.id)];
              turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
              send('sources', turn.sources);
            }
          } catch (e) { console.warn('[files] passages failed', String((e as Error)?.message || e)); }
        }

        // 1b. Institutional memory: passages from the person's own earlier answers and files that bear on this question,
        //     numbered after the web sources so the answer can cite them and the reader can open them.
        if (memoryEnabled() && !body.rewrite) {
          try {
            const recalled = await recall(user.id, turn.q, { limit: turn.mode === 'research' ? 4 : 3, excludeThreadId: th.id });
            if (recalled.length) {
              sources = [...sources, ...numberRecalled(recalled, sources.length)];
              turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
              send('sources', turn.sources);
              console.log('[memory] recalled', JSON.stringify({ n: recalled.length, kinds: recalled.map(r => r.kind), scores: recalled.map(r => Math.round(r.score * 100) / 100) }));
            }
          } catch (e) { console.warn('[memory] recall failed', String((e as Error)?.message || e)); }
        }

        // 2. Context: profile + space + connectors
        const graph = await loadGraph(user.id);
        const profile = graphPromptBlock(graph);
        let space = null;
        if (th.spaceId) { const rows = await db().select().from(schema.spaces).where(and(eq(schema.spaces.id, th.spaceId), eq(schema.spaces.userId, user.id))).limit(1); space = rows[0] || null; }
        let mcp: Awaited<ReturnType<typeof connectorsForModel>> = [];
        try { mcp = await connectorsForModel(user.id, user.admin ? 100 : capabilityPlan(user).caps.connectors, th.spaceId || null); } catch (e) { console.warn('connectors unavailable', e); }
        if (mcp.length) console.log('[ask] connectors', JSON.stringify({ space: th.spaceId || null, connectors: mcp.map(m => m.label) }));
        // Vault connectors: their search hits and read pages become numbered sources the answer can cite and the reader can open.
        const vaultByServer = new Map(mcp.filter(m => isVaultConnector({ preset: m.preset, url: m.url })).map(m => [m.name, m.id]));
        // Website connectors: their search hits and read pages become numbered sources with real page URLs.
        const siteByServer = new Map(mcp.filter(m => m.preset === SITE_PRESET).map(m => [m.name, m.label]));
        // Consoles ride along with Search answers: the guide plus what the person actually has, so buttons act on real things.
        let consoles = '';
        if (turn.mode !== 'research') { try { consoles = `${CONSOLE_GUIDE}\n\n${await consoleContext(user.id, { canBuild: user.admin || capabilityPlan(user).caps.discover === 'full' })}`; } catch (e) { console.warn('console context unavailable', e); } }
        // The browser, when asked for: the model gets its tools, every page it shows becomes a numbered source, and each
        // step reaches the person as it happens (the screenshot is stored before the event goes out).
        let resumeInfo: { url: string; title: string } | null = null;
        let signedIn: string[] = [];
        if (turn.browse) {
          // Carry on from the page the person handed back, when it is still open; otherwise any other open page of theirs is closed first.
          const prior = body.resumeTurnId && !body.rewrite ? await resumableSession(user.id, body.resumeTurnId).catch(() => null) : null;
          if (prior) { resumedFrom = prior.turnId; resumeInfo = { url: prior.url || '', title: prior.title || '' }; }
          try { await closeOtherSessions(user.id, prior ? prior.turnId : null); } catch (e) { console.warn('[browse] other pages not closed', String((e as Error)?.message || e).slice(0, 120)); }
          try { signedIn = (await rememberedSites(user.id)).map(s => s.host); } catch { signedIn = []; }
          browse = new BrowseSession({
            userId: user.id, turnId: turn.id, maxActions: browseCap, signal: ctl.signal,
            resume: prior ? { sessionId: prior.sessionId, url: prior.url || '', title: prior.title || '', turnId: prior.turnId } : undefined,
            rememberedHosts: signedIn,
            onStep: (step, rec) => { turn.browser = rec; send('browser', { step, actions: rec.actions, pages: rec.pages, stopped: rec.stopped || null }); },
            onPage: ({ url, title }) => {
              const had = sources.find(s => s.url === url); if (had) return had.n;
              let domain = ''; try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
              const src: Source = { n: sources.length + 1, title: title || url, domain, url };
              sources = [...sources, src];
              turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
              send('sources', turn.sources);
              return src.n;
            },
          });
        }
        const system = systemBlocks(dynamicSystem({ mode: turn.mode, focus: turn.focus, length: turn.length, profile, space, connectors: connectorsPromptBlock(mcp, space ? { id: space.id, name: space.name } : null), files: attached.map(a => a.name), consoles, browser: browse ? browserGuide({ maxActions: browseCap, resume: resumeInfo, signedIn }) : undefined }));
        const messages = buildMessages(history, turn.q, sourcesBlock(sources), fileText);
        turn.tools = [];

        // 3. Generation: the model reads the sources, calls connector tools when it needs them, and writes
        let wroteText = false;
        send('status', { text: browse ? 'Opening the browser' : turn.mode === 'research' ? 'Working through the sources' : attached.length ? 'Reading the files and writing' : 'Writing' });
        const result = await streamAnswer({
          tier: turn.tier, system, messages, signal: ctl.signal, search,
          mcp: mcp.map(m => ({ name: m.name, label: m.label, url: m.url, token: m.token, allowedTools: m.allowedTools, tools: m.tools })),
          local: browse ? [browse.toolSet()] : null,
          maxToolRounds: browse ? 64 : undefined,
          maxTokens: turn.mode === 'research' ? 9000 : (turn.length === 'detailed' || attached.length ? 6000 : 4000),
          onStatus: (text) => { if (!wroteText) send('status', { text }); },
          onToolResult: (call, r) => {
            const siteLabel = siteByServer.get(call.server);
            if (siteLabel && !r.isError) {
              const out = call.name === 'site_search' ? numberSiteHits(siteLabel, r.text, r.structured, sources.length, sources) : call.name === 'site_read' ? numberSitePage(siteLabel, r.text, r.structured, sources.length, sources) : null;
              if (!out || !out.added.length) return out?.text;
              sources = [...sources, ...out.added];
              turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
              send('sources', turn.sources);
              return out.text;
            }
            const connId = vaultByServer.get(call.server); if (!connId) return;
            const out = call.name === 'vault_search' ? numberVaultHits(connId, r.text, r.structured, sources.length, sources) : (call.name === 'vault_read' || call.name === 'vault_document') ? numberVaultPages(connId, r.text, r.structured, sources.length, sources) : null;
            if (!out || !out.added.length) return out?.text;
            sources = [...sources, ...out.added];
            turn.sources = sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url }));
            send('sources', turn.sources);
            return out.text;
          },
          onTool: (call) => { if (call.server === 'browser') return; const label = mcp.find(m => m.name === call.server)?.label || call.server; const i = (turn.tools || []).findIndex(t => t.server === label && t.name === call.name && t.error === undefined); const rec = { server: label, name: call.name, error: call.error }; if (i >= 0) turn.tools![i] = rec; else if (!(turn.tools || []).some(t => t.server === label && t.name === call.name && t.error === call.error)) turn.tools = [...(turn.tools || []), rec]; send('tools', turn.tools); },
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
        const browserActions = browse ? browse.actions : 0;
        if (browse) { turn.browser = browse.record(); await leavePage(); }

        // 4. The loop: learn, then meter
        let touched: ReturnType<typeof mergeLearned> = null;
        if (turn.learned) { try { touched = mergeLearned(graph, turn, th.id, { ideaId: th.origin?.ideaId }); if (touched) await saveGraph(user.id, graph); } catch (e) { console.warn('learn failed', e); } }
        await recordUsage(user.id, { questions: 1, research: turn.mode === 'research' ? 1 : 0, searches: result.usage.searches, tokensIn: result.usage.in, tokensOut: result.usage.out, browserActions, costMicros: estimateCostMicros(turn.tier, result.usage.in, result.usage.out, result.usage.cacheRead, result.usage.searches, result.model, result.usage.cacheWrite) });
        const paid = await charge(browserActions, true);
        send('done', { turn, graphEvents: graph.events, gas: receipt(paid) });
        // 5. After the answer is on screen: put the places this turn named on the map (the geocoder is slow and polite).
        if (touched && touched.some(n => n.place && !n.geo)) { try { if (await geocodePending(graph)) await saveGraph(user.id, graph); } catch (e) { console.warn('[geo] failed', e); } }
        // 6. Remember: this answer and the files that came with the question become passages a later answer can recall.
        if (memoryEnabled()) {
          try {
            await remember(user.id, { kind: 'answer', threadId: th.id, turnId: turn.id, title: turn.q, text: turn.answer, at: turn.createdAt });
            for (const r of attRows) if (currentIds.has(r.id) && r.text.length >= 80) await remember(user.id, { kind: 'file', threadId: th.id, turnId: turn.id, fileId: r.id, title: r.name, text: r.text, at: turn.createdAt });
            await backfillOnce(user.id);
          } catch (e) { console.warn('[memory] remember failed', String((e as Error)?.message || e)); }
        }
      } catch (e) {
        const err = e as { name?: string };
        // Whatever ended the answer, the actions the browser took were taken: they are kept on the turn and counted.
        const browserActions = browse ? browse.actions : 0;
        if (browse) { if (!browse.stopped && (err?.name === 'AbortError' || ctl.signal.aborted)) browse.stopped = 'aborted'; turn.browser = browse.record(); await leavePage(); }
        if (err?.name === 'AbortError' || ctl.signal.aborted) {
          const p = parseStream(raw); turn.answer = p.answer; turn.related = p.related; turn.status = 'stopped';
          // A stopped answer that had already written something is a question; one stopped in its first lines is free.
          const counted = raw.length > 200;
          if (counted || browserActions) await recordUsage(user.id, { questions: counted ? 1 : 0, browserActions });
          const paid = await charge(browserActions, counted);
          send('done', { turn, gas: receipt(paid) });
        } else {
          const why = describeProviderError(e);
          console.error('ask failed', JSON.stringify({ code: why.code, status: why.status, type: why.type, message: why.message, user: user.id }));
          const p = parseStream(raw); turn.answer = p.answer; turn.status = 'error';
          turn.error = why.code;
          // A failed answer costs nothing; the browser actions it took were taken, and cost theirs.
          let paid: GasReceipt | null = null;
          if (browserActions) { try { await recordUsage(user.id, { browserActions }); } catch { /* counted next time */ } paid = await charge(browserActions, false); }
          send('error', { code: turn.error, message: user.admin ? why.forAdmin : why.forUser, turn, gas: receipt(paid) });
        }
      } finally {
        await finish();
      }
    },
    cancel() { ctl.abort(); },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
