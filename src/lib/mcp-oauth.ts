/**
 * OAuth for MCP servers, the way the MCP authorization spec lays it out: find the server's protected
 * resource metadata, find its authorization server, register Ricorsa as a client on the fly (dynamic
 * client registration), send the person through the authorization code flow with PKCE, then keep the
 * tokens fresh with the refresh token. No provider-specific code: any server that follows the spec works.
 */
import type { ConnectorPending, ConnectorSecret } from './db/schema';
import { McpError } from './mcp';

export type AuthServerMeta = {
  issuer?: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string;
  scopes_supported?: string[]; code_challenge_methods_supported?: string[]; token_endpoint_auth_methods_supported?: string[];
};
export type Discovery = { meta: AuthServerMeta; resource: string; scopes?: string[] };

const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
async function s256(v: string): Promise<string> { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))); }

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'MCP-Protocol-Version': '2025-06-18' }, signal, redirect: 'follow' });
    if (!r.ok) return null;
    const j = await r.json(); return j && typeof j === 'object' ? (j as T) : null;
  } catch { return null; }
}

/** Where to log in for this MCP server. `wwwAuthenticate` is the header the server sent with its 401, when it sent one. */
export async function discover(mcpUrl: string, wwwAuthenticate?: string | null, signal?: AbortSignal): Promise<Discovery> {
  const u = new URL(mcpUrl);
  const hinted = (String(wwwAuthenticate || '').match(/resource_metadata="([^"]+)"/i) || [])[1] || null;
  const candidates = [hinted, `${u.origin}/.well-known/oauth-protected-resource${u.pathname.replace(/\/$/, '')}`, `${u.origin}/.well-known/oauth-protected-resource`].filter(Boolean) as string[];
  let rm: { resource?: string; authorization_servers?: string[]; scopes_supported?: string[] } | null = null;
  for (const c of candidates) { rm = await getJson(c, signal); if (rm && Array.isArray(rm.authorization_servers) && rm.authorization_servers.length) break; rm = null; }
  const resource = rm?.resource || mcpUrl;
  const servers = rm?.authorization_servers?.length ? rm.authorization_servers : [u.origin];
  for (const as of servers) {
    const meta = await authServerMeta(as, signal);
    if (meta) return { meta, resource, scopes: rm?.scopes_supported };
  }
  throw new McpError('Could not find where this server wants you to sign in', 'auth');
}

async function authServerMeta(as: string, signal?: AbortSignal): Promise<AuthServerMeta | null> {
  const a = new URL(as); const path = a.pathname.replace(/\/$/, '');
  const urls = [
    `${a.origin}/.well-known/oauth-authorization-server${path}`,
    `${a.origin}/.well-known/oauth-authorization-server`,
    `${a.origin}/.well-known/openid-configuration${path}`,
    path ? `${a.origin}${path}/.well-known/openid-configuration` : `${a.origin}/.well-known/openid-configuration`,
  ];
  for (const url of urls) {
    const m = await getJson<AuthServerMeta>(url, signal);
    if (m && m.authorization_endpoint && m.token_endpoint) return m;
  }
  // Spec fallback: default endpoints under the authorization server's base URL.
  const base = `${a.origin}${path}`;
  const probe = await fetch(`${base}/authorize`, { method: 'HEAD', signal, redirect: 'manual' }).catch(() => null);
  if (probe && probe.status !== 404) return { authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register` };
  return null;
}

/** Dynamic client registration. Returns the client id (and secret, if the server insists on one). */
export async function registerClient(meta: AuthServerMeta, redirectUri: string, scopes?: string[], signal?: AbortSignal): Promise<{ clientId: string; clientSecret?: string }> {
  if (!meta.registration_endpoint) throw new McpError('This server does not register clients automatically. Add a client id from the app’s developer settings instead.', 'auth');
  const body = {
    client_name: 'Ricorsa', client_uri: process.env.APP_BASE_URL || 'https://ricorsa.com', redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
    ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
  };
  const r = await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => null) as { client_id?: string; client_secret?: string; error_description?: string; error?: string } | null;
  if (!r.ok || !j?.client_id) throw new McpError(`Registration with the sign-in server failed${j?.error_description || j?.error ? `: ${j.error_description || j.error}` : ` (HTTP ${r.status})`}`, 'auth', r.status);
  return { clientId: j.client_id, clientSecret: j.client_secret };
}

/** Build the authorization URL and the state to keep until the person comes back. */
export async function beginAuthorization(d: Discovery, client: { clientId: string; clientSecret?: string }, redirectUri: string): Promise<{ url: string; pending: ConnectorPending }> {
  const verifier = randomToken(48);
  const challenge = await s256(verifier);
  const state = randomToken(24);
  const scope = d.scopes?.length ? d.scopes.join(' ') : undefined;
  const p = new URLSearchParams({ response_type: 'code', client_id: client.clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state, resource: d.resource });
  if (scope) p.set('scope', scope);
  const url = d.meta.authorization_endpoint + (d.meta.authorization_endpoint.includes('?') ? '&' : '?') + p.toString();
  return { url, pending: { state, verifier, authEndpoint: d.meta.authorization_endpoint, tokenEndpoint: d.meta.token_endpoint, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri, resource: d.resource, scope, startedAt: Date.now() } };
}

async function tokenRequest(endpoint: string, params: Record<string, string>, client: { clientId: string; clientSecret?: string }, signal?: AbortSignal): Promise<ConnectorSecret> {
  const h: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams(params);
  if (client.clientSecret) h.Authorization = 'Basic ' + btoa(`${client.clientId}:${client.clientSecret}`);
  else body.set('client_id', client.clientId);
  const r = await fetch(endpoint, { method: 'POST', headers: h, body: body.toString(), signal });
  const j = await r.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string } | null;
  if (!r.ok || !j?.access_token) throw new McpError(`The sign-in server refused the token request${j?.error_description || j?.error ? `: ${j.error_description || j.error}` : ` (HTTP ${r.status})`}`, 'auth', r.status);
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : undefined, scope: j.scope, tokenEndpoint: endpoint, clientId: client.clientId, clientSecret: client.clientSecret };
}

/** Trade the code the person came back with for tokens. */
export async function exchangeCode(p: ConnectorPending, code: string, signal?: AbortSignal): Promise<ConnectorSecret> {
  const params: Record<string, string> = { grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier };
  if (p.resource) params.resource = p.resource;
  const s = await tokenRequest(p.tokenEndpoint, params, { clientId: p.clientId, clientSecret: p.clientSecret }, signal);
  return { ...s, resource: p.resource, scope: s.scope || p.scope };
}

/** A fresh access token, refreshing first when the current one is about to expire. Returns null when it cannot. */
export async function freshSecret(s: ConnectorSecret, signal?: AbortSignal): Promise<{ secret: ConnectorSecret; changed: boolean } | null> {
  if (!s.accessToken) return null;
  const stale = s.expiresAt ? s.expiresAt - Date.now() < 90_000 : false;
  if (!stale) return { secret: s, changed: false };
  if (!s.refreshToken || !s.tokenEndpoint || !s.clientId) return null;
  const params: Record<string, string> = { grant_type: 'refresh_token', refresh_token: s.refreshToken };
  if (s.resource) params.resource = s.resource;
  try {
    const n = await tokenRequest(s.tokenEndpoint, params, { clientId: s.clientId, clientSecret: s.clientSecret }, signal);
    return { secret: { ...s, ...n, refreshToken: n.refreshToken || s.refreshToken }, changed: true };
  } catch { return null; }
}
