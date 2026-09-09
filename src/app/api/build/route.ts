import { z } from 'zod';
import { eq, and, or, desc } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError, uid, truncate } from '@/lib/http';
import { db, schema } from '@/lib/db';
import type { BuildMessage } from '@/lib/db/schema';
import { loadGraph } from '@/lib/graph';
import { planFor } from '@/lib/plans';
import { chain, graphFingerprint } from '@/lib/hash';
import { buildSystem, buildMessages, parseBuild, stampHtml, streamAnswer, type BuildSpec } from '@/lib/build';
import { describeProviderError } from '@/lib/llm';
import { recordUsage } from '@/lib/usage';
import { estimateCostMicros } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  // Start a session from an idea
  ideaId: z.string().max(200).optional(),
  graphHash: z.string().max(200).optional(),
  category: z.string().max(60).optional(),
  kind: z.string().max(40).optional(),
  title: z.string().trim().min(3).max(140).optional(),
  what: z.string().trim().min(3).max(600).optional(),
  prompt: z.string().max(600).optional(),
  builds: z.array(z.string().max(80)).max(6).optional(),
  // Or continue one: a message in the build chat
  sessionId: z.string().max(60).optional(),
  message: z.string().trim().min(1).max(3000).optional(),
});

/**
 * POST /api/build  — the build chat (Team plan). Streams server-sent events:
 *   meta → status → plan → delta* → done | reply → done | error
 * A new idea starts a session (version 1). A message in an existing session either produces the next
 * version (plan + app, streamed) or a plain reply when it was only a question.
 */
export async function POST(req: Request) {
  let user; try { user = await currentUser(); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message, e.code) : fail(500, 'Sign-in check failed'); }
  const plan = planFor(user.plan);
  if (plan.caps.discover !== 'full') return fail(402, 'Building from Discover is part of the Team plan.', 'upgrade_required');
  if (!user.admin && user.subscriptionStatus && !['ACTIVE', 'APPROVAL_PENDING'].includes(user.subscriptionStatus)) return fail(402, 'Your subscription is not active.', 'subscription_inactive');
  const parsed = Body.safeParse(await readJson(req).catch(() => ({})));
  if (!parsed.success) return fail(400, 'Invalid request', 'invalid_request');
  const b = parsed.data;
  const d = db();

  // Resolve the session: a root row (the first version) that carries the conversation.
  let root: typeof schema.builds.$inferSelect | null = null;
  let latest: typeof schema.builds.$inferSelect | null = null;
  let spec: BuildSpec;
  let request: string | null = null;
  if (b.sessionId) {
    const r = (await d.select().from(schema.builds).where(and(eq(schema.builds.id, b.sessionId), eq(schema.builds.userId, user.id))).limit(1))[0];
    if (!r) return fail(404, 'That build is not yours', 'not_found');
    root = r.rootId ? (await d.select().from(schema.builds).where(and(eq(schema.builds.id, r.rootId), eq(schema.builds.userId, user.id))).limit(1))[0] || r : r;
    if (!b.message) return fail(400, 'Say what should change, or ask a question', 'invalid_request');
    request = b.message;
    const versions = await d.select().from(schema.builds).where(and(eq(schema.builds.userId, user.id), or(eq(schema.builds.id, root.id), eq(schema.builds.rootId, root.id)))).orderBy(desc(schema.builds.version));
    latest = versions.find(v => v.status === 'done' && v.html) || null;
    if (!latest) return fail(409, 'There is no finished version to change yet. Wait for the build to finish, or start again.', 'not_ready');
    const specStored = (() => { try { return JSON.parse(root.spec) as BuildSpec; } catch { return null; } })();
    spec = specStored && specStored.title ? specStored : { title: root.title, kind: root.kind, what: root.spec, category: root.category || undefined };
  } else {
    if (!b.title || !b.what) return fail(400, 'An idea needs a title and a description', 'invalid_request');
    spec = { title: b.title, kind: b.kind || 'App', what: b.what, prompt: b.prompt, category: b.category, builds: b.builds };
  }

  const graph = await loadGraph(user.id);
  const graphHash = (root ? root.graphHash : b.graphHash) || await graphFingerprint(graph);
  const ideaId = root ? root.ideaId : (b.ideaId || null);
  const rootId = root ? root.id : null;
  const version = latest ? (latest.version || 1) + 1 : 1;
  const id = root ? uid() : uid();
  const lineage = await chain(latest ? latest.id : (ideaId || graphHash), { buildId: id, ideaId, graphHash, title: spec.title, version, at: Date.now() });

  const history = ((root?.messages || []) as BuildMessage[]).filter(m => m.kind !== 'error').map(m => ({ role: m.role, text: m.text }));
  const msgId = uid();
  if (root && request) {
    // Record the request on the session before doing anything, so the chat survives a dropped connection.
    const messages = [...(root.messages || []), { id: msgId, role: 'user' as const, text: request, kind: 'request' as const, at: Date.now() }];
    await d.update(schema.builds).set({ messages, updatedAt: new Date() }).where(eq(schema.builds.id, root.id));
    root.messages = messages;
  }
  if (!root) {
    // A new session: the root row holds the idea (as JSON) and the conversation.
    const first: BuildMessage = { id: msgId, role: 'user', text: spec.prompt || spec.what, kind: 'request', at: Date.now() };
    await d.insert(schema.builds).values({ id, userId: user.id, parentId: null, rootId: null, version: 1, ideaId, graphHash, category: spec.category || null, kind: spec.kind, title: spec.title, spec: JSON.stringify(spec), changes: null, status: 'building', lineage, messages: [first] });
  }

  const enc = new TextEncoder();
  const ctl = new AbortController();
  req.signal?.addEventListener('abort', () => ctl.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      let raw = ''; let planSent = false; let rowMade = !root; let lastSave = Date.now();
      const sessionId = root ? root.id : id;
      const save = async (patch: Partial<typeof schema.builds.$inferInsert>) => { if (!rowMade) return; try { await d.update(schema.builds).set({ ...patch, updatedAt: new Date() }).where(eq(schema.builds.id, id)); } catch (e) { console.error('build save failed', e); } };
      const addMessage = async (m: Omit<BuildMessage, 'id' | 'at'>) => {
        const msg: BuildMessage = { id: uid(), at: Date.now(), ...m };
        try {
          const cur = (await d.select({ messages: schema.builds.messages }).from(schema.builds).where(eq(schema.builds.id, sessionId)).limit(1))[0];
          await d.update(schema.builds).set({ messages: [...((cur?.messages || []) as BuildMessage[]), msg], updatedAt: new Date() }).where(eq(schema.builds.id, sessionId));
        } catch (e) { console.error('message save failed', e); }
        return msg;
      };
      const ensureRow = async () => {
        if (rowMade) return;
        rowMade = true;
        await d.insert(schema.builds).values({ id, userId: user.id, parentId: latest!.id, rootId, version, ideaId, graphHash, category: spec.category || null, kind: spec.kind, title: spec.title, spec: JSON.stringify(spec), changes: request, status: 'building', lineage, messages: [] });
      };
      try {
        send('meta', { sessionId, buildId: id, version, lineage, request: request || null });
        send('status', { text: root ? 'Reading the current version' : 'Reading your graph' });
        const result = await streamAnswer({
          tier: 'default', system: buildSystem(graph), messages: buildMessages(spec, history, latest ? { html: latest.html } : null, request), maxTokens: 16000, signal: ctl.signal, search: null,
          onText: (delta) => {
            raw += delta;
            const p = parseBuild(raw);
            if (p.reply && !p.html && !p.plan) { send('reply', { text: p.reply, done: p.replyDone }); return; }
            if (!rowMade && (p.plan || p.html)) void ensureRow();
            if (!planSent && p.planDone) { planSent = true; send('plan', { text: p.plan }); send('status', { text: 'Writing the app' }); }
            send('delta', { text: delta });
            if (Date.now() - lastSave > 4000) { lastSave = Date.now(); void save({ plan: p.plan, html: p.html }); }
          },
        });
        const p = parseBuild(result.text);
        await recordUsage(user.id, { questions: 1, tokensIn: result.usage.in, tokensOut: result.usage.out, costMicros: estimateCostMicros('default', result.usage.in, result.usage.out, result.usage.cacheRead) });
        if (p.reply && !p.html) {
          // A question: answer in the chat, no new version.
          const m = await addMessage({ role: 'assistant', text: truncate(p.reply, 4000), kind: 'reply', buildId: null, version: null });
          send('done', { reply: m, build: null, sessionId });
          return;
        }
        if (!p.html || !/<\/html>|<body|<script|<div/i.test(p.html)) throw new Error('The builder did not return an app');
        await ensureRow();
        const html = stampHtml(p.html, { buildId: id, ideaId, graphHash, lineage });
        const summary = p.plan.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)[0] || spec.what;
        await save({ status: 'done', plan: p.plan, html, summary });
        const m = await addMessage({ role: 'assistant', text: p.plan || summary, kind: 'plan', buildId: id, version });
        send('done', { message: m, build: { id, sessionId, version, title: spec.title, kind: spec.kind, status: 'done', plan: p.plan, summary, html, lineage, ideaId, graphHash, parentId: latest ? latest.id : null, createdAt: Date.now() }, sessionId });
      } catch (e) {
        const err = e as { name?: string; message?: string };
        const p = parseBuild(raw);
        if (err?.name === 'AbortError' || ctl.signal.aborted) { await save({ status: 'error', error: 'stopped', plan: p.plan, html: p.html }); await addMessage({ role: 'assistant', text: 'Stopped before this version was finished.', kind: 'error', buildId: rowMade ? id : null, version: null }); }
        else {
          const why = describeProviderError(e);
          console.error('build failed', JSON.stringify({ code: why.code, status: why.status, type: why.type, message: why.message, user: user.id }));
          await save({ status: 'error', error: String(why.message || err?.message || 'failed').slice(0, 300), plan: p.plan, html: p.html });
          const text = user.admin ? why.forAdmin : why.forUser;
          const m = await addMessage({ role: 'assistant', text, kind: 'error', buildId: rowMade ? id : null, version: null });
          send('error', { code: why.code, message: text, messageRecord: m, sessionId });
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
