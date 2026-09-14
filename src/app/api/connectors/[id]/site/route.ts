import { eq, and } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { getConnectorOwned, checkConnector, toClient } from '@/lib/connectors';
import { SITE_PRESET, readSite, listSitePages, searchSite } from '@/lib/sites';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/connectors/:id/site[?q=] — the site behind a Website connector, the pages read from it, and (with q) a search over them. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  if (c.preset !== SITE_PRESET) return fail(400, 'Not a website connector');
  const site = (await db().select().from(schema.sites).where(and(eq(schema.sites.connectorId, id), eq(schema.sites.userId, user.id))).limit(1))[0];
  const q = new URL(req.url).searchParams.get('q') || '';
  return json({ site: site ? { rootUrl: site.rootUrl, maxPages: site.maxPages, pages: site.pages, chars: site.chars, rendered: site.rendered, status: site.status, error: site.error, crawledAt: site.crawledAt ? new Date(site.crawledAt).getTime() : null } : null, pages: await listSitePages(id), hits: q ? (await searchSite(id, q, 6)).hits : undefined });
});

/** POST /api/connectors/:id/site — read the site again (streamed like the first read). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser(); const { id } = await ctx.params;
  const c = await getConnectorOwned(user.id, id);
  if (c.preset !== SITE_PRESET) return fail(400, 'Not a website connector');
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try {
        const r = await readSite(id, user.id, (t) => send('status', { text: t }));
        const row = await checkConnector(c);
        send('done', { connector: await toClient(row), ...r });
      } catch (e) { send('error', { message: String((e as Error)?.message || e).slice(0, 200) }); }
      finally { try { controller.close(); } catch {} }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
});
