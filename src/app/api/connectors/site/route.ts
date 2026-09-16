import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid, HttpError } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { planFor } from '@/lib/plans';
import { checkConnector, listConnectors, ownSpaceIds, serverNameFor, toClient } from '@/lib/connectors';
import { sealJson } from '@/lib/secretbox';
import { eq } from 'drizzle-orm';
import { SITE_PRESET, MAX_PAGES_CAP, validateSiteUrl, readSite, siteMcpUrl } from '@/lib/sites';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function randomToken(): string { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }

/**
 * POST /api/connectors/site { url, maxPages? } — connect a website: create the connector with its own token and
 * MCP endpoint, read the site's pages (streamed as server-sent events so the person sees each page land), and
 * check the connector. Events: status → done { connector, pages, chars, rendered } | error { message }.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const plan = planFor(user.plan); const limit = user.admin ? 100 : plan.caps.connectors;
  const existing = await listConnectors(user.id);
  if (limit <= 0) return fail(402, 'Connectors are part of the Essentials, Professional and Enterprise plans.', 'upgrade_required');
  if (existing.length >= limit) return fail(402, `The ${plan.name} plan allows ${limit} connector${limit === 1 ? '' : 's'}. Upgrade for more.`, 'upgrade_required');
  const b = z.object({ url: z.string().trim().min(4).max(500), maxPages: z.number().int().min(1).max(MAX_PAGES_CAP).optional(), name: z.string().trim().max(60).optional(), spaceIds: z.array(z.string().max(60)).max(50).optional().nullable() }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Enter the website address');
  let rootUrl: string; try { rootUrl = validateSiteUrl(b.data.url); } catch (e) { return e instanceof HttpError ? fail(e.status, e.message) : fail(400, 'Enter a full address'); }
  const host = new URL(rootUrl).hostname.replace(/^www\./, '');
  const name = (b.data.name || host).slice(0, 60);
  const id = uid(); const token = randomToken();
  const d = db();
  const spaceIds = await ownSpaceIds(user.id, b.data.spaceIds);
  const rows = await d.insert(schema.connectors).values({ id, userId: user.id, name, serverName: serverNameFor('site_' + host.replace(/[^a-z0-9]+/gi, '_').slice(0, 24), existing.map(c => c.serverName)), preset: SITE_PRESET, url: siteMcpUrl(id), authType: 'bearer', secret: await sealJson({ token }), spaceIds, status: 'new' }).returning();
  await d.insert(schema.sites).values({ connectorId: id, userId: user.id, rootUrl, maxPages: b.data.maxPages || 40, status: 'new' });
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => { try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {} };
      try {
        send('status', { text: 'Opening the site' });
        const r = await readSite(id, user.id, (t) => send('status', { text: t }));
        send('status', { text: 'Checking the connector' });
        const row = await checkConnector(rows[0]);
        send('done', { connector: await toClient(row), ...r });
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : String((e as Error)?.message || e).slice(0, 200);
        // A site that could not be read leaves no half-connector behind.
        try { await d.delete(schema.sitePages).where(eq(schema.sitePages.connectorId, id)); await d.delete(schema.sites).where(eq(schema.sites.connectorId, id)); await d.delete(schema.connectors).where(eq(schema.connectors.id, id)); } catch { /* best effort */ }
        send('error', { message: msg });
      } finally { try { controller.close(); } catch {} }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
});
