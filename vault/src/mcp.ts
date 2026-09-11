import type { Env } from './env';
import { assertDocInScope, type Conn, inScope, logAccess, paperMatches, readDocument, requestScan, scopeOf, searchWorkspaces, workspacesFor } from './access';
import { getDoc } from './shards';
import { HttpError, truncate } from './util';

/**
 * The Vault as an MCP server (Streamable HTTP, stateless): the tools Ricorsa's answers call. Every call is checked
 * against the connection's workspaces and written to the access log. Results carry both readable text for the
 * model and structured hits so the client can turn them into citations that open the page.
 */
const PROTOCOL = '2025-06-18';
type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> };

export const TOOLS = [
  { name: 'vault_workspaces', description: 'List the Vault workspaces this connection may see, with their matters, document counts and how many folders are still on paper. Call this first when unsure which workspace or matter a question is about.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'vault_search', description: 'Full-text search across the connected Vault workspaces (depositions, transcripts, summaries, exhibits, medical records, correspondence, registries). Returns the best-matching pages with a snippet, the document, its matter and a reference (vault:<doc_id>#page=<n>) to cite. Also lists folders still on paper whose labels match. Use specific words: names, products, sites, years.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words or quoted phrases to find' }, workspace_id: { type: 'string', description: 'Limit to one workspace' }, matter_id: { type: 'string', description: 'Limit to one matter' }, kind: { type: 'string', description: 'transcript | summary | exhibit | medical | correspondence | registry | invoice | pleading | document' }, witness: { type: 'string', description: 'Limit to documents about this witness (name or part of it)' }, date_from: { type: 'string', description: 'YYYY-MM-DD' }, date_to: { type: 'string', description: 'YYYY-MM-DD' }, limit: { type: 'integer', minimum: 1, maximum: 25, description: 'How many pages to return (default 10)' } }, required: ['query'], additionalProperties: false } },
  { name: 'vault_read', description: 'Read the text of a Vault document, all pages or a page range, with page markers. Use after vault_search to read the pages around a hit before answering. Cite pages as vault:<doc_id>#page=<n>.', inputSchema: { type: 'object', properties: { doc_id: { type: 'string' }, from_page: { type: 'integer', minimum: 1 }, to_page: { type: 'integer', minimum: 1 } }, required: ['doc_id'], additionalProperties: false } },
  { name: 'vault_document', description: 'Facts about one Vault document: name, kind, matter, witness, date, pages, the box and folder it came from, its SHA-256 seal, and for deposition summaries the defendant grid.', inputSchema: { type: 'object', properties: { doc_id: { type: 'string' } }, required: ['doc_id'], additionalProperties: false } },
  { name: 'vault_request_scan', description: 'Ask the records team to digitise a folder (or a whole box) that is still on paper. Returns the request id and due date. Only when the person asks for it or agrees to it.', inputSchema: { type: 'object', properties: { folder_id: { type: 'string' }, box_id: { type: 'string' }, note: { type: 'string', description: 'Why it is needed (shown to the records team)' } }, additionalProperties: false } },
] as const;

export async function handleMcp(env: Env, req: Request, conn: Conn | null): Promise<Response> {
  if (req.method === 'GET') return new Response('This MCP endpoint speaks Streamable HTTP over POST.', { status: 405, headers: { Allow: 'POST, DELETE' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!conn) return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in: a Vault connection token is required' } }), { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="VDRPros Vault"' } });
  let body: Rpc | Rpc[];
  try { body = await req.json() as Rpc | Rpc[]; } catch { return rpcError(null, -32700, 'Parse error', 400); }
  const msgs = Array.isArray(body) ? body : [body];
  const replies: unknown[] = [];
  for (const m of msgs) {
    if (!m || typeof m !== 'object' || !m.method) { replies.push({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } }); continue; }
    if (m.id === undefined || m.id === null) { continue; } // a notification: nothing to answer
    try { replies.push({ jsonrpc: '2.0', id: m.id, result: await dispatch(env, conn, m.method, m.params || {}) }); }
    catch (e) {
      const err = e as HttpError;
      replies.push({ jsonrpc: '2.0', id: m.id, error: { code: err instanceof HttpError ? -32000 : -32603, message: String(err?.message || 'error') } });
    }
  }
  if (!replies.length) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(Array.isArray(body) ? replies : replies[0]), { headers: { 'Content-Type': 'application/json' } });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
}

async function dispatch(env: Env, conn: Conn, method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case 'initialize': return { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'VDRPros Vault', version: '1.0' }, instructions: 'Search first (vault_search), then read the pages you will rely on (vault_read). Cite pages with their vault:<doc_id>#page=<n> reference. When a match is a folder still on paper, say so; offer vault_request_scan rather than calling it unasked.' };
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS };
    case 'tools/call': return callTool(env, conn, String(params.name || ''), (params.arguments as Record<string, unknown>) || {});
    default: throw new HttpError(404, `Method not found: ${method}`);
  }
}

function text(t: string, structured?: unknown, isError = false) { return { content: [{ type: 'text', text: t }], ...(structured !== undefined ? { structuredContent: structured } : {}), isError }; }

async function callTool(env: Env, conn: Conn, name: string, a: Record<string, unknown>) {
  const scope = scopeOf(conn);
  if (name === 'vault_workspaces') {
    const ws = await workspacesFor(env, scope);
    await logAccess(env, conn, 'list', null, {});
    const lines = ws.map(w => `- ${w.name} (workspace_id ${w.id}, ${w.tenant}): ${w.doc_count.toLocaleString('en-US')} documents, ${w.page_count.toLocaleString('en-US')} pages${w.paper_folders ? `, ${w.paper_folders} folders still on paper` : ''}${w.matters.length ? `\n  matters: ${w.matters.map(m => `${m.name} (matter_id ${m.id}, ${m.doc_count} documents)`).join('; ')}` : ''}`);
    return text(lines.length ? `Connected workspaces:\n${lines.join('\n')}` : 'No workspaces are connected.', { workspaces: ws.map(w => ({ id: w.id, name: w.name, tenant: w.tenant, documents: w.doc_count, pages: w.page_count, paperFolders: w.paper_folders, matters: w.matters.map(m => ({ id: m.id, name: m.name, documents: m.doc_count })) })) });
  }
  if (name === 'vault_search') {
    const query = String(a.query || '').trim(); if (!query) throw new HttpError(400, 'query is required');
    let ids = scope; if (a.workspace_id) { if (!inScope(conn, String(a.workspace_id))) throw new HttpError(404, 'That workspace is not connected'); ids = [String(a.workspace_id)]; }
    const limit = Math.min(25, Math.max(1, Number(a.limit) || 10));
    const filters = { matterId: a.matter_id ? String(a.matter_id) : null, kind: a.kind ? String(a.kind) : null, witness: a.witness ? String(a.witness) : null, dateFrom: a.date_from ? String(a.date_from) : null, dateTo: a.date_to ? String(a.date_to) : null };
    const [r, paper] = await Promise.all([searchWorkspaces(env, ids, query, filters, limit), paperMatches(env, ids, query, 5)]);
    await logAccess(env, conn, 'search', null, { query: truncate(query, 200), hits: r.hits.length, filters });
    const hits = r.hits.map((h, i) => ({ ref: `V${i + 1}`, docId: h.docId, page: h.page, pages: h.pages, name: h.name, kind: h.kind, matter: h.matter, matterId: h.matterId, witness: h.witness, volume: h.volume, date: h.docDate, folder: h.folder, box: h.box, snippet: h.snippet, cite: `vault:${h.docId}#page=${h.page}`, workspaceId: h.workspaceId, mime: h.mime, size: h.size }));
    const lines = hits.map(h => `[${h.ref}] ${h.name}${h.volume ? ` (Vol. ${h.volume})` : ''}, ${h.kind}${h.witness ? `, witness ${h.witness}` : ''}${h.matter ? `, matter ${h.matter}` : ''}${h.date ? `, ${h.date}` : ''}, page ${h.page} of ${h.pages || '?'}${h.folder ? `, from ${h.folder}` : ''}\n    cite: ${h.cite}\n    ${h.snippet || '(no text on this page)'}`);
    const paperLines = paper.map(p => `- ${p.label} in box ${p.box}, barcode ${p.barcode}, ${p.status === 'paper' ? 'on paper, not yet digitised' : p.status}${p.location ? `, location ${p.location}` : ''}${p.pagesEst ? `, about ${p.pagesEst} pages` : ''} (folder_id ${p.folderId})`);
    const out = [
      hits.length ? `${hits.length} matching page${hits.length === 1 ? '' : 's'} across ${r.searched} search shard${r.searched === 1 ? '' : 's'} (matched on ${r.mode}):\n${lines.join('\n')}` : `No indexed pages match "${truncate(query, 80)}" in the connected workspaces.`,
      paperLines.length ? `\nFolders still on paper whose labels match (not searchable until digitised; vault_request_scan can ask for them):\n${paperLines.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    return text(out, { query, hits, paper, searched: r.searched, mode: r.mode });
  }
  if (name === 'vault_read') {
    const docId = String(a.doc_id || ''); assertDocInScope(conn, docId);
    const from = a.from_page ? Number(a.from_page) : null, to = a.to_page ? Number(a.to_page) : null;
    const r = await readDocument(env, docId, from, to);
    await logAccess(env, conn, 'read', docId, { from, to, pages: r.pages.length });
    const head = `${r.doc.name} (${r.doc.kind}${r.doc.witness ? `, witness ${r.doc.witness}` : ''}${r.doc.volume ? `, Vol. ${r.doc.volume}` : ''}${r.doc.doc_date ? `, ${r.doc.doc_date}` : ''}), ${r.total} page${r.total === 1 ? '' : 's'}${r.doc.status !== 'indexed' ? `, status ${r.doc.status}` : ''}. Cite as vault:${docId}#page=<n>.`;
    if (!r.pages.length) return text(`${head}\n\n(No text is available for these pages${r.doc.status === 'awaiting_ocr' ? ': this is a scan waiting for OCR' : ''}.)`, { docId, pages: [] });
    return text(`${head}\n\n${r.pages.map(p => `[Page ${p.page}]\n${p.text}`).join('\n\n')}${r.truncated ? '\n\n[More pages follow; ask for a narrower page range.]' : ''}`, { docId, name: r.doc.name, pages: r.pages.map(p => ({ page: p.page, chars: p.text.length })), truncated: r.truncated, total: r.total });
  }
  if (name === 'vault_document') {
    const docId = String(a.doc_id || ''); assertDocInScope(conn, docId);
    const d = await getDoc(env, docId); if (!d) throw new HttpError(404, 'No such document');
    await logAccess(env, conn, 'document', docId, {});
    let extra: Record<string, unknown> | null = null; try { extra = d.extra ? JSON.parse(d.extra) : null; } catch { extra = null; }
    const defendants = d.defendants ? (JSON.parse(d.defendants) as string[]) : [];
    const lines = [
      `${d.name}`, `kind: ${d.kind}`, d.witness ? `witness: ${d.witness}` : '', d.volume ? `volume: ${d.volume}` : '', d.doc_date ? `date: ${d.doc_date}` : '',
      `pages: ${d.pages}, characters: ${d.chars.toLocaleString('en-US')}`, `status: ${d.status}`, `sha256 seal: ${d.sha256}`, `size: ${d.size.toLocaleString('en-US')} bytes, type: ${d.mime}`, d.path ? `path as received: ${d.path}` : '',
      defendants.length ? `defendants (${defendants.length}): ${defendants.slice(0, 60).join('; ')}` : '',
      extra && Array.isArray((extra as { rows?: unknown[] }).rows) ? `exposure rows: ${((extra as { rows: unknown[] }).rows).length} (columns: ${Object.keys(((extra as { rows: Record<string, unknown>[] }).rows[0]) || {}).join(', ')})` : '',
      `cite pages as vault:${docId}#page=<n>`,
    ].filter(Boolean);
    return text(lines.join('\n'), { doc: { id: d.id, name: d.name, kind: d.kind, witness: d.witness, volume: d.volume, date: d.doc_date, pages: d.pages, status: d.status, sha256: d.sha256, size: d.size, mime: d.mime, matterId: d.matter_id, folderId: d.folder_id, boxId: d.box_id, defendants, extra } });
  }
  if (name === 'vault_request_scan') {
    const folderId = a.folder_id ? String(a.folder_id) : null, boxId = a.box_id ? String(a.box_id) : null;
    const where = folderId ? await env.DB.prepare('SELECT workspace_id FROM folders WHERE id = ?').bind(folderId).first<{ workspace_id: string }>() : boxId ? await env.DB.prepare('SELECT workspace_id FROM boxes WHERE id = ?').bind(boxId).first<{ workspace_id: string }>() : null;
    if (!where || !inScope(conn, where.workspace_id)) throw new HttpError(404, 'No such folder or box in the connected workspaces');
    const r = await requestScan(env, { workspaceId: where.workspace_id, folderId, boxId, requestedBy: `connection:${conn.id}`, via: 'ricorsa', note: a.note ? String(a.note) : null, tenantId: conn.tenant_id });
    await logAccess(env, conn, 'scan_request', null, { folderId, boxId, requestId: r.id });
    return text(`Scan requested for "${r.label}" (request ${r.id}). Due ${new Date(r.dueAt).toUTCString()}. The pages will be searchable here once they are in.`, { requestId: r.id, dueAt: r.dueAt, label: r.label });
  }
  throw new HttpError(404, `Unknown tool: ${name}`);
}
