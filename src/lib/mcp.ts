/**
 * A small MCP client, enough to check a server and list its tools. Speaks Streamable HTTP
 * (POST JSON-RPC, JSON or SSE replies, Mcp-Session-Id) and falls back to the older HTTP+SSE transport
 * (GET a stream, POST to the endpoint it announces). Tool calls themselves happen on the model
 * provider's side through the MCP connector; this client only needs to introduce itself and ask what
 * the server offers.
 */
import type { ConnectorTool } from './db/schema';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'Ricorsa', version: '1.0' };

export class McpError extends Error {
  constructor(message: string, public kind: 'auth' | 'transport' | 'protocol' | 'timeout', public status?: number, public wwwAuthenticate?: string | null) { super(message); }
}

type Rpc = { jsonrpc: '2.0'; id?: number; method: string; params?: unknown };
type RpcResult = { id?: number; result?: unknown; error?: { code: number; message: string } };

function headersFor(token?: string | null, sessionId?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION };
  if (token) h.Authorization = `Bearer ${token}`;
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  return h;
}

/** Parse a whole SSE body into JSON-RPC messages. */
function parseSse(text: string): RpcResult[] {
  const out: RpcResult[] = [];
  for (const chunk of text.split(/\r?\n\r?\n/)) {
    const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data) continue;
    try { const j = JSON.parse(data); if (Array.isArray(j)) out.push(...j); else out.push(j); } catch { /* keep-alive or comment */ }
  }
  return out;
}

function withTimeout(ms: number, parent?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new McpError('The server took too long to answer', 'timeout')), ms);
  parent?.addEventListener('abort', () => ctl.abort(parent.reason));
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

/** Streamable HTTP: one JSON-RPC request, one reply (JSON body or an SSE body that carries it). */
async function postRpc(url: string, msg: Rpc, token: string | null | undefined, session: { id: string | null }, signal: AbortSignal): Promise<RpcResult | null> {
  const res = await fetch(url, { method: 'POST', headers: headersFor(token, session.id), body: JSON.stringify(msg), signal, redirect: 'manual' });
  const sid = res.headers.get('mcp-session-id'); if (sid) session.id = sid;
  if (res.status === 401 || res.status === 403) throw new McpError('The server wants you to sign in first', 'auth', res.status, res.headers.get('www-authenticate'));
  if (res.status === 404 || res.status === 405) throw new McpError('No Streamable HTTP endpoint here', 'transport', res.status);
  if (res.status === 202 || res.status === 204) return null;
  if (!res.ok) throw new McpError(`The server answered HTTP ${res.status}`, 'transport', res.status);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const body = await res.text();
  if (ct.includes('text/event-stream')) {
    const msgs = parseSse(body);
    return msgs.find(m => m.id === msg.id) || msgs.find(m => m.result !== undefined || m.error) || null;
  }
  if (!body.trim()) return null;
  try { const j = JSON.parse(body); return Array.isArray(j) ? (j.find((m: RpcResult) => m.id === msg.id) || j[0]) : j; } catch { throw new McpError('The server did not answer with JSON', 'protocol', res.status); }
}

function unwrap(r: RpcResult | null, what: string): unknown {
  if (!r) throw new McpError(`No reply to ${what}`, 'protocol');
  if (r.error) throw new McpError(`${what}: ${r.error.message || 'error ' + r.error.code}`, 'protocol');
  return r.result;
}

function toolsFrom(result: unknown): { tools: ConnectorTool[]; next: string | null } {
  const r = (result || {}) as { tools?: Array<{ name?: string; description?: string }>; nextCursor?: string };
  const tools = (r.tools || []).filter(t => t && typeof t.name === 'string').map(t => ({ name: String(t.name).slice(0, 120), description: t.description ? String(t.description).replace(/\s+/g, ' ').slice(0, 240) : undefined }));
  return { tools, next: r.nextCursor || null };
}

export type McpProbe = { transport: 'http' | 'sse'; serverName?: string; serverVersion?: string; protocolVersion?: string; tools: ConnectorTool[] };

/** Introduce ourselves and list the tools. Throws McpError with a kind the caller can act on. */
export async function probeMcp(url: string, token?: string | null, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<McpProbe> {
  const t = withTimeout(opts?.timeoutMs ?? 12000, opts?.signal);
  try {
    try { return await probeStreamable(url, token || null, t.signal); }
    catch (e) {
      if (e instanceof McpError && e.kind === 'transport' && (e.status === 404 || e.status === 405 || e.status === 400)) return await probeLegacySse(url, token || null, t.signal);
      throw e;
    }
  } finally { t.done(); }
}

async function probeStreamable(url: string, token: string | null, signal: AbortSignal): Promise<McpProbe> {
  const session = { id: null as string | null };
  const init = unwrap(await postRpc(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } }, token, session, signal), 'initialize') as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };
  await postRpc(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, token, session, signal).catch(() => null);
  const tools: ConnectorTool[] = []; let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const r = toolsFrom(unwrap(await postRpc(url, { jsonrpc: '2.0', id: 2 + page, method: 'tools/list', params: cursor ? { cursor } : {} }, token, session, signal), 'tools/list'));
    tools.push(...r.tools); cursor = r.next; if (!cursor) break;
  }
  return { transport: 'http', serverName: init?.serverInfo?.name, serverVersion: init?.serverInfo?.version, protocolVersion: init?.protocolVersion, tools };
}

/** Older transport: GET opens an event stream that first announces where to POST; replies arrive on the stream. */
async function probeLegacySse(url: string, token: string | null, signal: AbortSignal): Promise<McpProbe> {
  const h: Record<string, string> = { Accept: 'text/event-stream' }; if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers: h, signal, redirect: 'manual' });
  if (res.status === 401 || res.status === 403) throw new McpError('The server wants you to sign in first', 'auth', res.status, res.headers.get('www-authenticate'));
  if (!res.ok || !res.body) throw new McpError(`The server answered HTTP ${res.status}`, 'transport', res.status);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = ''; const pending = new Map<number, (r: RpcResult) => void>(); let endpoint: string | null = null;
  const endpointBox: { resolve: ((s: string) => void) | null } = { resolve: null };
  const endpointReady = new Promise<string>(r => { endpointBox.resolve = r; });
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
        const ev = (chunk.match(/^event:\s*(.*)$/m) || [])[1]?.trim() || 'message';
        const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (ev === 'endpoint' && data && !endpoint) { endpoint = new URL(data, url).toString(); endpointBox.resolve?.(endpoint); }
        else if (data) { try { const m = JSON.parse(data) as RpcResult; if (typeof m.id === 'number' && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } } catch { /* ignore */ } }
      }
    }
  })().catch(() => { /* stream closed */ });
  const post = async (msg: Rpc): Promise<RpcResult | null> => {
    const ep = endpoint || await Promise.race([endpointReady, new Promise<string>((_, rej) => signal.addEventListener('abort', () => rej(new McpError('No endpoint announced', 'transport'))))]);
    const reply = typeof msg.id === 'number' ? new Promise<RpcResult>(r => pending.set(msg.id as number, r)) : null;
    const hp: Record<string, string> = { 'Content-Type': 'application/json' }; if (token) hp.Authorization = `Bearer ${token}`;
    const r = await fetch(ep, { method: 'POST', headers: hp, body: JSON.stringify(msg), signal });
    if (r.status === 401 || r.status === 403) throw new McpError('The server wants you to sign in first', 'auth', r.status, r.headers.get('www-authenticate'));
    if (!r.ok && r.status !== 202) throw new McpError(`The server answered HTTP ${r.status}`, 'transport', r.status);
    if (!reply) return null;
    return Promise.race([reply, new Promise<RpcResult>((_, rej) => signal.addEventListener('abort', () => rej(new McpError('The server took too long to answer', 'timeout'))))]);
  };
  try {
    const init = unwrap(await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } }), 'initialize') as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null);
    const r = toolsFrom(unwrap(await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), 'tools/list'));
    return { transport: 'sse', serverName: init?.serverInfo?.name, serverVersion: init?.serverInfo?.version, protocolVersion: init?.protocolVersion, tools: r.tools };
  } finally { try { await reader.cancel(); } catch { /* closed */ } void pump; }
}

/** Pull `resource_metadata="..."` out of a WWW-Authenticate header, when a server points at its auth metadata. */
export function resourceMetadataUrl(wwwAuthenticate: string | null | undefined): string | null {
  const m = String(wwwAuthenticate || '').match(/resource_metadata="([^"]+)"/i);
  return m ? m[1] : null;
}
