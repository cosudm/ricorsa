/**
 * A small MCP client: introduce ourselves, list a server's tools, and call them. Speaks Streamable HTTP
 * (POST JSON-RPC, JSON or SSE replies, Mcp-Session-Id) and falls back to the older HTTP+SSE transport
 * (GET a stream, POST to the endpoint it announces). Since the model provider does not call MCP servers
 * for us, Ricorsa runs the tool loop itself: the model asks for a tool, this client calls it, the
 * result goes back to the model.
 */
import type { ConnectorTool } from './db/schema';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'Ricorsa', version: '1.0' };
const MAX_SCHEMA_CHARS = 6000;
const MAX_RESULT_CHARS = 24000;

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

function unwrap(r: RpcResult | null, what: string): unknown {
  if (!r) throw new McpError(`No reply to ${what}`, 'protocol');
  if (r.error) throw new McpError(`${what}: ${r.error.message || 'error ' + r.error.code}`, 'protocol');
  return r.result;
}

function toolsFrom(result: unknown): { tools: ConnectorTool[]; next: string | null } {
  const r = (result || {}) as { tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>; nextCursor?: string };
  const tools = (r.tools || []).filter(t => t && typeof t.name === 'string').map(t => {
    let schema: Record<string, unknown> | undefined;
    if (t.inputSchema && typeof t.inputSchema === 'object') { const s = JSON.stringify(t.inputSchema); if (s.length <= MAX_SCHEMA_CHARS) schema = t.inputSchema as Record<string, unknown>; else schema = { type: 'object' }; }
    return { name: String(t.name).slice(0, 120), description: t.description ? String(t.description).replace(/\s+/g, ' ').slice(0, 400) : undefined, inputSchema: schema };
  });
  return { tools, next: r.nextCursor || null };
}

/** Flatten a tools/call result into text the model can read. */
export function toolResultText(result: unknown): { text: string; isError: boolean } {
  const r = (result || {}) as { content?: Array<{ type?: string; text?: string; data?: string; mimeType?: string; resource?: { text?: string; uri?: string } }>; isError?: boolean; structuredContent?: unknown };
  const parts: string[] = [];
  for (const c of r.content || []) {
    if (c.type === 'text' && c.text) parts.push(c.text);
    else if (c.type === 'image') parts.push(`[image ${c.mimeType || ''}]`);
    else if (c.type === 'resource' && c.resource) parts.push(c.resource.text || `[resource ${c.resource.uri || ''}]`);
    else if (c.type === 'audio') parts.push('[audio]');
  }
  if (!parts.length && r.structuredContent !== undefined) parts.push(JSON.stringify(r.structuredContent));
  if (!parts.length && r.content === undefined) parts.push(JSON.stringify(result ?? null));
  const text = parts.join('\n').slice(0, MAX_RESULT_CHARS);
  return { text: text || '(empty result)', isError: !!r.isError };
}

export type McpProbe = { transport: 'http' | 'sse'; serverName?: string; serverVersion?: string; protocolVersion?: string; tools: ConnectorTool[] };

/**
 * One conversation with an MCP server. Open it, use it, close it. Streamable HTTP first; if the URL is
 * an old-style SSE endpoint the session switches transport on its own.
 */
export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;
  private transport: 'http' | 'sse' = 'http';
  private legacy: { post: (msg: Rpc) => Promise<RpcResult | null>; close: () => Promise<void> } | null = null;
  serverInfo: { name?: string; version?: string; protocolVersion?: string } = {};

  constructor(private url: string, private token: string | null, private signal: AbortSignal) {}

  private async postHttp(msg: Rpc): Promise<RpcResult | null> {
    const res = await fetch(this.url, { method: 'POST', headers: headersFor(this.token, this.sessionId), body: JSON.stringify(msg), signal: this.signal, redirect: 'manual' });
    const sid = res.headers.get('mcp-session-id'); if (sid) this.sessionId = sid;
    if (res.status === 401 || res.status === 403) throw new McpError('The server wants you to sign in first', 'auth', res.status, res.headers.get('www-authenticate'));
    if (res.status === 404 || res.status === 405) throw new McpError('No Streamable HTTP endpoint here', 'transport', res.status);
    if (res.status === 202 || res.status === 204) return null;
    if (!res.ok) throw new McpError(`The server answered HTTP ${res.status}`, 'transport', res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const body = await res.text();
    if (ct.includes('text/event-stream')) { const msgs = parseSse(body); return msgs.find(m => m.id === msg.id) || msgs.find(m => m.result !== undefined || m.error) || null; }
    if (!body.trim()) return null;
    try { const j = JSON.parse(body); return Array.isArray(j) ? (j.find((m: RpcResult) => m.id === msg.id) || j[0]) : j; } catch { throw new McpError('The server did not answer with JSON', 'protocol', res.status); }
  }

  /** Older transport: GET opens an event stream that first announces where to POST; replies arrive on the stream. */
  private async openLegacy(): Promise<void> {
    const h: Record<string, string> = { Accept: 'text/event-stream' }; if (this.token) h.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.url, { headers: h, signal: this.signal, redirect: 'manual' });
    if (res.status === 401 || res.status === 403) throw new McpError('The server wants you to sign in first', 'auth', res.status, res.headers.get('www-authenticate'));
    if (!res.ok || !res.body) throw new McpError(`The server answered HTTP ${res.status}`, 'transport', res.status);
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = ''; const pending = new Map<number, (r: RpcResult) => void>(); let endpoint: string | null = null;
    const box: { resolve: ((s: string) => void) | null } = { resolve: null };
    const endpointReady = new Promise<string>(r => { box.resolve = r; });
    const url = this.url;
    (async () => {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
          const ev = (chunk.match(/^event:\s*(.*)$/m) || [])[1]?.trim() || 'message';
          const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
          if (ev === 'endpoint' && data && !endpoint) { endpoint = new URL(data, url).toString(); box.resolve?.(endpoint); }
          else if (data) { try { const m = JSON.parse(data) as RpcResult; if (typeof m.id === 'number' && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } } catch { /* ignore */ } }
        }
      }
    })().catch(() => { /* stream closed */ });
    const signal = this.signal, token = this.token;
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
    this.legacy = { post, close: async () => { try { await reader.cancel(); } catch { /* closed */ } } };
    this.transport = 'sse';
  }

  private async post(msg: Rpc): Promise<RpcResult | null> {
    if (this.legacy) return this.legacy.post(msg);
    return this.postHttp(msg);
  }

  async open(): Promise<void> {
    const init = { jsonrpc: '2.0' as const, id: this.nextId++, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } };
    let r: RpcResult | null;
    try { r = await this.postHttp(init); }
    catch (e) {
      if (e instanceof McpError && e.kind === 'transport' && (e.status === 404 || e.status === 405 || e.status === 400)) { await this.openLegacy(); r = await this.legacy!.post(init); }
      else throw e;
    }
    const info = unwrap(r, 'initialize') as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };
    this.serverInfo = { name: info?.serverInfo?.name, version: info?.serverInfo?.version, protocolVersion: info?.protocolVersion };
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null);
  }

  async listTools(): Promise<ConnectorTool[]> {
    const tools: ConnectorTool[] = []; let cursor: string | null = null;
    for (let page = 0; page < 4; page++) {
      const r = toolsFrom(unwrap(await this.post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/list', params: cursor ? { cursor } : {} }), 'tools/list'));
      tools.push(...r.tools); cursor = r.next; if (!cursor) break;
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const r = await this.post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/call', params: { name, arguments: args || {} } });
    if (r?.error) return { text: `Tool error: ${r.error.message || 'error ' + r.error.code}`, isError: true };
    return toolResultText(r?.result);
  }

  async close(): Promise<void> {
    if (this.legacy) await this.legacy.close();
    else if (this.sessionId) { try { await fetch(this.url, { method: 'DELETE', headers: headersFor(this.token, this.sessionId), signal: this.signal }); } catch { /* optional */ } }
  }

  get transportUsed() { return this.transport; }
}

/** Introduce ourselves and list the tools. Throws McpError with a kind the caller can act on. */
export async function probeMcp(url: string, token?: string | null, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<McpProbe> {
  const t = withTimeout(opts?.timeoutMs ?? 12000, opts?.signal);
  const s = new McpSession(url, token || null, t.signal);
  try {
    await s.open();
    const tools = await s.listTools();
    return { transport: s.transportUsed, serverName: s.serverInfo.name, serverVersion: s.serverInfo.version, protocolVersion: s.serverInfo.protocolVersion, tools };
  } finally { await s.close().catch(() => null); t.done(); }
}

/** Call one tool on a server: open, call, close. Used by the answer loop. */
export async function callMcpTool(url: string, token: string | null, name: string, args: Record<string, unknown>, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ text: string; isError: boolean }> {
  const t = withTimeout(opts?.timeoutMs ?? 45000, opts?.signal);
  const s = new McpSession(url, token, t.signal);
  try { await s.open(); return await s.callTool(name, args); }
  finally { await s.close().catch(() => null); t.done(); }
}

/** Pull `resource_metadata="..."` out of a WWW-Authenticate header, when a server points at its auth metadata. */
export function resourceMetadataUrl(wwwAuthenticate: string | null | undefined): string | null {
  const m = String(wwwAuthenticate || '').match(/resource_metadata="([^"]+)"/i);
  return m ? m[1] : null;
}
