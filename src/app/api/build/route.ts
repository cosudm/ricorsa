import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { fail, readJson, HttpError, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { loadGraph } from '@/lib/graph';
import { planFor } from '@/lib/plans';
import { chain, graphFingerprint } from '@/lib/hash';
import { buildSystem, buildMessages, parseBuild, stampHtml, streamAnswer } from '@/lib/build';
import { recordUsage } from '@/lib/usage';
import { estimateCostMicros } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  ideaId: z.string().max(200).optional(),
  graphHash: z.string().max(200).optional(),
  category: z.string().max(60).optional(),
  kind: z.string().max(40).default('App'),
  title: z.string().trim().min(3).max(140),
  what: z.string().trim().min(3).max(600),
  prompt: z.string().max(600).optional(),
  builds: z.array(z.string().max(80)).max(6).optional(),
  parentId: z.string().max(60).optional(),
  changes: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/build  — build a working app from a Discover idea (Team plan). Streams server-sent events:
 *   meta → status → plan → delta* → done | error
 */
export async function POST(req: Request) {
  let user; try { user = await currentUser(); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message, e.code) : fail(500, 'Sign-in check failed'); }
  const plan = planFor(user.plan);
  if (plan.caps.discover !== 'full') return fail(402, 'Building from Discover is part of the Team plan.', 'upgrade_required');
  if (user.subscriptionStatus && !['ACTIVE', 'APPROVAL_PENDING'].includes(user.subscriptionStatus)) return fail(402, 'Your subscription is not active.', 'subscription_inactive');
  const parsed = Body.safeParse(await readJson(req).catch(() => ({})));
  if (!parsed.success) return fail(400, 'Invalid request', 'invalid_request');
  const b = parsed.data;
  const d = db();

  let previous: { html: string; changes: string } | null = null;
  if (b.parentId) {
    const p = (await d.select().from(schema.builds).where(and(eq(schema.builds.id, b.parentId), eq(schema.builds.userId, user.id))).limit(1))[0];
    if (!p) return fail(404, 'That build is not yours', 'not_found');
    if (!b.changes) return fail(400, 'Say what should change', 'invalid_request');
    previous = { html: p.html, changes: b.changes };
  }

  const graph = await loadGraph(user.id);
  const graphHash = b.graphHash || await graphFingerprint(graph);
  const id = uid();
  const lineage = await chain(b.parentId || b.ideaId || graphHash, { buildId: id, ideaId: b.ideaId || null, graphHash, title: b.title, at: Date.now() });
  await d.insert(schema.builds).values({ id, userId: user.id, parentId: b.parentId || null, ideaId: b.ideaId || null, graphHash, category: b.category || null, kind: b.kind, title: b.title, spec: b.what, changes: b.changes || null, status: 'building', lineage });

  const enc = new TextEncoder();
  const ctl = new AbortController();
  req.signal?.addEventListener('abort', () => ctl.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      let raw = ''; let planSent = false; let lastSave = Date.now();
      const save = async (patch: Partial<typeof schema.builds.$inferInsert>) => { try { await d.update(schema.builds).set({ ...patch, updatedAt: new Date() }).where(eq(schema.builds.id, id)); } catch (e) { console.error('build save failed', e); } };
      try {
        send('meta', { buildId: id, lineage });
        send('status', { text: 'Reading your graph' });
        const result = await streamAnswer({
          tier: 'default', system: buildSystem(graph), messages: buildMessages(b, previous), maxTokens: 16000, signal: ctl.signal, search: null,
          onText: (delta) => {
            raw += delta;
            const p = parseBuild(raw);
            if (!planSent && p.planDone) { planSent = true; send('plan', { text: p.plan }); send('status', { text: 'Writing the app' }); }
            send('delta', { text: delta });
            if (Date.now() - lastSave > 4000) { lastSave = Date.now(); void save({ plan: p.plan, html: p.html }); }
          },
        });
        const p = parseBuild(result.text);
        if (!p.html || !/<\/html>|<body|<script|<div/i.test(p.html)) throw new Error('The builder did not return an app');
        const html = stampHtml(p.html, { buildId: id, ideaId: b.ideaId, graphHash, lineage });
        const summary = p.plan.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)[0] || b.what;
        await save({ status: 'done', plan: p.plan, html, summary });
        await recordUsage(user.id, { questions: 1, tokensIn: result.usage.in, tokensOut: result.usage.out, costMicros: estimateCostMicros('default', result.usage.in, result.usage.out, result.usage.cacheRead) });
        send('done', { build: { id, title: b.title, kind: b.kind, status: 'done', plan: p.plan, summary, html, lineage, ideaId: b.ideaId || null, graphHash, parentId: b.parentId || null, createdAt: Date.now() } });
      } catch (e) {
        const err = e as { name?: string; message?: string };
        const p = parseBuild(raw);
        if (err?.name === 'AbortError' || ctl.signal.aborted) { await save({ status: 'error', error: 'stopped', plan: p.plan, html: p.html }); }
        else { console.error('build failed', e); await save({ status: 'error', error: String(err?.message || 'failed').slice(0, 300), plan: p.plan, html: p.html }); send('error', { message: 'The build was interrupted. Try again.' }); }
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
