/**
 * VDRPros Vault: the first-party connector. The Vault is an MCP server with its own connection flow (a one-time
 * code to the person's Vault email, then a choice of workspaces), so Ricorsa talks to it server to server here,
 * stores the connection token like any bearer connector, and turns the Vault's search hits into numbered sources
 * that open the cited page in the file viewer.
 */
import { HttpError } from './http';
import type { Source } from './search';

export const VAULT_PRESET = 'vdrpros';
export const VAULT_LABEL = 'VDRPros Vault';

export function vaultUrl(): string { return (process.env.VAULT_URL || 'https://vault.vdrpros.com').replace(/\/+$/, ''); }
export function vaultConfigured(): boolean { return !!process.env.VAULT_CLIENT_SECRET; }
export function vaultMcpUrl(): string { return `${vaultUrl()}/mcp`; }
export function isVaultConnector(c: { preset: string | null; url: string }): boolean { return c.preset === VAULT_PRESET || c.url.startsWith(vaultUrl() + '/'); }

/** A server-to-server call to the Vault's client API, authenticated with the shared secret. */
export async function vaultClient<T>(path: string, body: Record<string, unknown>, method = 'POST'): Promise<T> {
  if (!vaultConfigured()) throw new HttpError(503, 'The VDRPros Vault connection is not set up on this server yet', 'vault_unconfigured');
  const res = await fetch(`${vaultUrl()}/api/clients${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAULT_CLIENT_SECRET}` }, body: method === 'GET' ? undefined : JSON.stringify({ client: 'ricorsa', ...body }) });
  const j = await res.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!res.ok) throw new HttpError(res.status === 401 ? 502 : res.status, j.error || 'The Vault did not answer', j.code || 'vault_error');
  return j;
}

/** A hit as the Vault's vault_search returns it in structuredContent. */
export type VaultHit = { ref: string; docId: string; page: number; pages: number; name: string; kind: string; matter: string | null; witness: string | null; volume: string | null; date: string | null; folder: string | null; box: string | null; snippet: string; cite: string; mime: string; size: number };

/** The in-app link for a Vault page: the app opens it in the viewer at that page. */
export function vaultSourceUrl(connectorId: string, docId: string, page: number | null): string {
  return `/app#/vault/${encodeURIComponent(connectorId)}/${encodeURIComponent(docId)}${page ? `?p=${page}` : ''}`;
}

/**
 * Turn a vault_search result into numbered sources (continuing from `from`) and rewrite the model's copy of the
 * result so the refs it sees are the same [n] the reader will see. Returns the rewritten text and the new sources.
 */
export function numberVaultHits(connectorId: string, text: string, structured: unknown, from: number, existing: Source[]): { text: string; added: Source[] } {
  const s = structured as { hits?: VaultHit[] } | null;
  const hits = s?.hits || [];
  if (!hits.length) return { text, added: [] };
  const added: Source[] = []; let out = text; let n = from;
  for (const h of hits) {
    const url = vaultSourceUrl(connectorId, h.docId, h.page);
    let src = existing.find(x => x.url === url) || added.find(x => x.url === url);
    if (!src) {
      n += 1;
      const where = h.volume ? `Vol. ${h.volume}, p. ${h.page}` : `p. ${h.page}${h.pages ? ` of ${h.pages}` : ''}`;
      src = { n, title: `${h.name} · ${where}`, domain: VAULT_LABEL, url, snippet: h.snippet };
      added.push(src);
    }
    out = out.split(`[${h.ref}]`).join(`[${src.n}]`).split(h.cite).join(`[${src.n}] (${h.cite})`);
  }
  return { text: out + `\n\nCite these pages in the answer with their bracketed numbers, like web sources.`, added };
}

/** A vault_read or vault_document result: the pages read become sources too, so the answer can cite them. */
export function numberVaultPages(connectorId: string, text: string, structured: unknown, from: number, existing: Source[], docName?: string | null): { text: string; added: Source[] } {
  const s = structured as { docId?: string; name?: string; pages?: Array<{ page: number }> } | null;
  if (!s?.docId || !s.pages?.length) return { text, added: [] };
  const added: Source[] = []; let out = text; let n = from;
  for (const p of s.pages.slice(0, 40)) {
    const url = vaultSourceUrl(connectorId, s.docId, p.page);
    let src = existing.find(x => x.url === url) || added.find(x => x.url === url);
    if (!src) { n += 1; src = { n, title: `${s.name || docName || 'Vault document'} · p. ${p.page}`, domain: VAULT_LABEL, url }; added.push(src); }
    out = out.split(`[Page ${p.page}]`).join(`[Page ${p.page}] [${src.n}]`);
  }
  return { text: out + `\n\nCite these pages with their bracketed numbers.`, added };
}
