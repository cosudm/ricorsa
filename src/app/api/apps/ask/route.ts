import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError } from '@/lib/http';
import { assertQuota, recordUsage } from '@/lib/usage';
import { planQueries, retrieve, sourcesBlock, type Source } from '@/lib/search';
import { loadGraph, graphPromptBlock } from '@/lib/graph';
import { streamAnswer, describeProviderError, type Msg } from '@/lib/llm';
import { estimateCostMicros } from '@/lib/plans';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  /** A version row of one of the person's own builds (the app that is asking). */
  buildId: z.string().min(1).max(60),
  prompt: z.string().trim().min(1).max(8000),
  /** The app's own instructions for the model, if it has any. */
  system: z.string().max(4000).optional().default(''),
  /** Search the web first and hand the app numbered sources it can show. */
  search: z.boolean().optional().default(false),
  /** Earlier exchanges in the app, oldest first. */
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).max(12).optional().default([]),
  /** Let the model know the person (their identity graph), as every Ricorsa answer does. */
  personal: z.boolean().optional().default(true),
  /** Plain text (the default; most apps set textContent) or Markdown when the app renders it. */
  format: z.enum(['text', 'markdown']).optional().default('text'),
});

/**
 * POST /api/apps/ask — the live line from an app built in the studio to Ricorsa's model. The app, running in
 * its sandboxed frame, asks through window.ricorsa.ask(...); the host page relays the request here with the
 * person's own session. Streamed as server-sent events: meta → status → sources → delta* → done | error.
 * Each call counts as one question against the person's plan.
 */
export async function POST(req: Request) {
  let user; try { user = await currentUser(); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message, e.code) : fail(500, 'Sign-in check failed'); }
  const parsed = Body.safeParse(await readJson(req).catch(() => ({})));
  if (!parsed.success) return fail(400, 'Invalid request', 'invalid_request');
  const b = parsed.data;
  const build = (await db().select({ id: schema.builds.id, title: schema.builds.title, kind: schema.builds.kind }).from(schema.builds).where(and(eq(schema.builds.id, b.buildId), eq(schema.builds.userId, user.id))).limit(1))[0];
  if (!build) return fail(404, 'This app is not one of yours', 'not_found');
  try { await assertQuota(user, 'search', 'default'); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message, e.code) : fail(500, 'Could not start the answer'); }

  const ctl = new AbortController();
  req.signal?.addEventListener('abort', () => ctl.abort());
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try {
        send('meta', { app: build.title });
        let sources: Source[] = []; let searches = 0;
        if (b.search) {
          send('status', { text: 'Searching the web' });
          try {
            const queries = await planQueries(b.prompt, 'search', 'web', b.history.filter(h => h.role === 'user').slice(-3).map(h => h.content.slice(0, 200)));
            const r = await retrieve(queries.slice(0, 3), 8, ctl.signal);
            sources = r.sources; searches = r.searches;
          } catch (e) { console.warn('[apps] retrieval failed', String((e as Error)?.message || e)); }
        }
        send('sources', sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url })));
        send('status', { text: 'Writing' });
        const profile = b.personal ? graphPromptBlock(await loadGraph(user.id)) : '';
        const system = [
          `You are the model behind "${build.title}", an app the person built for themselves in Ricorsa and is using right now. The app sends you what the person typed or chose, sometimes with the app's own instructions, and shows your reply directly in its interface. Reply for the app: answer the request itself, with no preamble, no talk of being an AI, no mention of Ricorsa, of a profile or of these instructions. ${b.format === 'markdown' ? 'Simple Markdown is fine (short headings, lists, tables).' : 'Plain text only, since the app shows it as typed: no Markdown syntax, no asterisks, pipes, pound signs or backticks; short paragraphs, and simple lists with a hyphen at the start of each line.'} Write with commas, colons and full stops, never an em dash or an en dash. Never invent sources, citations, figures or names; when web sources are given below, cite them with their number in square brackets and cite nothing else.`,
          b.system ? `The app's instructions:\n${b.system}` : '',
          profile,
          `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
        ].filter(Boolean).join('\n\n');
        const messages: Msg[] = [...b.history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: sources.length ? `${b.prompt}\n\n${sourcesBlock(sources)}` : b.prompt }];
        // Keep the alternation valid for the providers: merge consecutive same-role turns, start with the person.
        const convo: Msg[] = [];
        for (const m of messages) { const last = convo[convo.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else convo.push({ ...m }); }
        if (convo[0]?.role === 'assistant') convo.shift();
        // What the app shows: the text without the <answer> wrapper some prompts (and the development stub) put around it.
        let text = ''; let shown = 0;
        const visible = (t: string) => { let v = t.replace(/^\s*<answer>\s?/i, ''); const tail = /<\/answer>\s*$|<\/?a?n?s?w?e?r?$/i.exec(v); if (tail && tail.index > 0 && /^<\/?a?n?s?w?e?r?>?\s*$/i.test(v.slice(tail.index))) v = v.slice(0, tail.index); return v; };
        const flush = () => { const v = visible(text); if (v.length > shown) { send('delta', { text: v.slice(shown) }); shown = v.length; } };
        const result = await streamAnswer({
          tier: 'default', system: [{ text: system }], messages: convo, maxTokens: 4000, signal: ctl.signal, search: null,
          onText: (delta) => { text += delta; flush(); },
        });
        text = result.text || text; flush();
        const u = result.usage;
        await recordUsage(user.id, { questions: 1, tokensIn: u.in, tokensOut: u.out, searches, costMicros: estimateCostMicros('default', u.in, u.out, u.cacheRead, searches, result.model, u.cacheWrite) });
        console.log('[apps] answered', JSON.stringify({ app: build.id, model: result.model, chars: text.length, sources: sources.length, user: user.id }));
        send('done', { text: visible(text).trim(), sources: sources.map(s => ({ n: s.n, title: s.title, domain: s.domain, url: s.url })), model: result.model });
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (err?.name === 'AbortError' || ctl.signal.aborted) { /* the app or the page went away */ }
        else {
          const why = describeProviderError(e);
          console.error('[apps] answer failed', JSON.stringify({ code: why.code, status: why.status, message: why.message, user: user.id }));
          send('error', { code: why.code, message: user.admin ? why.forAdmin : why.forUser });
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
