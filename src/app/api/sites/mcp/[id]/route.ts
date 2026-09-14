import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { openJson } from '@/lib/secretbox';
import { searchSite, readSitePage, listSitePages, SITE_PRESET } from '@/lib/sites';
import { MCP_PROTOCOL_VERSION } from '@/lib/mcp';

export const dynamic = 'force-dynamic';

/**
 * The MCP server for one Website connector: Ricorsa's own model reaches the site's pages through the same
 * client it uses for every other connector (Streamable HTTP, JSON-RPC). The bearer token is the connector's
 * own secret, so only that connector's owner, through Ricorsa, can search these pages.
 */
const TOOLS = [
  { name: 'site_search', description: 'Search the pages of this website for a question or keywords. Returns the best matching pages with a snippet each and a bracketed reference to cite.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to look for' }, limit: { type: 'integer', minimum: 1, maximum: 12, description: 'How many pages, default 6' } }, required: ['query'] } },
  { name: 'site_read', description: 'Read the full text of one page of this website by its URL (from site_search or site_pages).', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'site_pages', description: 'List every page Ricorsa has read from this website, with titles.', inputSchema: { type: 'object', properties: {} } },
];

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> };

/** Compare two tokens without leaking where they differ. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % x.length] || 0) ^ (y[i % y.length] || 0);
  return diff === 0;
}

function rpc(id: Rpc['id'], result: unknown) { return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result }); }
function rpcError(id: Rpc['id'], code: number, message: string, status = 200) { return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status }); }

async function authorized(id: string, req: Request): Promise<boolean> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); if (!m) return false;
  const c = (await db().select({ secret: schema.connectors.secret, preset: schema.connectors.preset }).from(schema.connectors).where(eq(schema.connectors.id, id)).limit(1))[0];
  if (!c || c.preset !== SITE_PRESET || !c.secret) return false;
  const s = await openJson<{ token?: string }>(c.secret);
  return !!(s?.token && timingSafeEqual(m[1].trim(), s.token));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await authorized(id, req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  let msg: Rpc; try { msg = await req.json(); } catch { return rpcError(null, -32700, 'Parse error', 400); }
  if (Array.isArray(msg)) return rpcError(null, -32600, 'Batches are not supported', 400);
  const method = String(msg.method || '');
  if (method === 'initialize') return rpc(msg.id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'Ricorsa website connector', version: '1.0' } });
  if (method.startsWith('notifications/')) return new NextResponse(null, { status: 202 });
  if (method === 'ping') return rpc(msg.id, {});
  if (method === 'tools/list') return rpc(msg.id, { tools: TOOLS });
  if (method === 'tools/call') {
    const p = (msg.params || {}) as { name?: string; arguments?: Record<string, unknown> };
    const args = p.arguments || {};
    try {
      if (p.name === 'site_search') {
        const query = String(args.query || '').trim(); if (!query) return rpc(msg.id, { content: [{ type: 'text', text: 'Give a query to search for.' }], isError: true });
        const r = await searchSite(id, query, Number(args.limit) || 6);
        const text = r.hits.length
          ? r.hits.map(h => `[${h.ref}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n') + `\n\n(${r.hits.length} of ${r.pages} pages matched; read one with site_read and cite pages by their bracketed reference.)`
          : `Nothing among the ${r.pages} pages read from this site matched "${query}".`;
        return rpc(msg.id, { content: [{ type: 'text', text }], structuredContent: { hits: r.hits.map(h => ({ ref: h.ref, url: h.url, title: h.title, snippet: h.snippet })), pages: r.pages } });
      }
      if (p.name === 'site_read') {
        const page = await readSitePage(id, String(args.url || ''));
        if (!page) return rpc(msg.id, { content: [{ type: 'text', text: 'That page is not among the ones read from this site. Use site_pages to see them.' }], isError: true });
        return rpc(msg.id, { content: [{ type: 'text', text: `${page.title}\n${page.url}\n\n${page.text}${page.total > page.text.length ? `\n\n(${page.total - page.text.length} more characters not shown)` : ''}` }], structuredContent: { url: page.url, title: page.title, chars: page.total } });
      }
      if (p.name === 'site_pages') {
        const pages = await listSitePages(id);
        return rpc(msg.id, { content: [{ type: 'text', text: pages.length ? pages.map(pg => `- ${pg.title} · ${pg.url} (${pg.chars.toLocaleString('en-US')} characters${pg.rendered ? ', read in a browser' : ''})`).join('\n') : 'No pages have been read yet.' }], structuredContent: { pages } });
      }
      return rpcError(msg.id, -32601, `Unknown tool ${p.name || ''}`);
    } catch (e) { return rpc(msg.id, { content: [{ type: 'text', text: `The site could not be searched: ${String((e as Error)?.message || e).slice(0, 160)}` }], isError: true }); }
  }
  return rpcError(msg.id, -32601, `Unknown method ${method}`);
}

export async function DELETE() { return new NextResponse(null, { status: 204 }); }
export async function GET() { return NextResponse.json({ error: 'POST JSON-RPC here' }, { status: 405 }); }
