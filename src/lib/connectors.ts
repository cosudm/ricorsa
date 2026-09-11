/**
 * Connectors: outside applications and MCP servers a person links to Ricorsa. Each enabled connector is
 * handed to the model as a set of tools while it answers, through the provider's MCP connector, so a
 * question about the person's own issues, pages, deals or data can be answered from the live source.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from './db';
import type { ConnectorAuth, ConnectorSecret, ConnectorStatus, ConnectorTool } from './db/schema';
import { HttpError, slugify } from './http';
import { openJson, sealJson } from './secretbox';
import { McpError, probeMcp } from './mcp';
import { freshSecret } from './mcp-oauth';
import { VAULT_PRESET, vaultConfigured, vaultMcpUrl } from './vault';

export type ConnectorRow = typeof schema.connectors.$inferSelect;

/** Well-known remote MCP servers. URLs are the vendors' published endpoints; each one can be edited before saving. */
export type Preset = { key: string; name: string; url: string; auth: ConnectorAuth; blurb: string; tokenHint?: string; docs?: string; /** A first-party connect flow instead of a token or OAuth: 'vault' asks for the person's Vault email and a one-time code. */ flow?: 'vault'; available?: boolean };
export const CATALOG: Preset[] = [
  { key: 'vdrpros', name: 'VDRPros Vault', url: 'https://vault.vdrpros.com/mcp', auth: 'bearer', flow: 'vault', blurb: 'Your Vault workspaces: depositions, transcripts, exhibits, records and correspondence, searched page by page with citations that open the page. Connect with a one-time code sent to your Vault email.', docs: 'https://vdrpros.com/' },
  { key: 'github', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', auth: 'bearer', blurb: 'Repositories, issues, pull requests and code search.', tokenHint: 'A GitHub personal access token (fine-grained, with the repos you want to reach).', docs: 'https://github.com/github/github-mcp-server' },
  { key: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', auth: 'oauth', blurb: 'Search and read pages and databases in your workspace.', docs: 'https://developers.notion.com/docs/mcp' },
  { key: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', auth: 'oauth', blurb: 'Issues, projects and cycles.', docs: 'https://linear.app/docs/mcp' },
  { key: 'atlassian', name: 'Atlassian (Jira, Confluence)', url: 'https://mcp.atlassian.com/v1/sse', auth: 'oauth', blurb: 'Jira issues and Confluence pages.', docs: 'https://support.atlassian.com/atlassian-rovo-mcp-server/' },
  { key: 'sentry', name: 'Sentry', url: 'https://mcp.sentry.dev/mcp', auth: 'oauth', blurb: 'Errors, issues and releases.', docs: 'https://docs.sentry.io/product/sentry-mcp/' },
  { key: 'stripe', name: 'Stripe', url: 'https://mcp.stripe.com', auth: 'bearer', blurb: 'Customers, payments, invoices and subscriptions.', tokenHint: 'A restricted Stripe API key with read access.', docs: 'https://docs.stripe.com/mcp' },
  { key: 'paypal', name: 'PayPal', url: 'https://mcp.paypal.com/mcp', auth: 'oauth', blurb: 'Invoices, orders, disputes and subscriptions.', docs: 'https://developer.paypal.com/tools/mcp-server/' },
  { key: 'hubspot', name: 'HubSpot', url: 'https://mcp.hubspot.com/anthropic', auth: 'oauth', blurb: 'Contacts, companies, deals and tickets.', docs: 'https://developers.hubspot.com/mcp' },
  { key: 'asana', name: 'Asana', url: 'https://mcp.asana.com/sse', auth: 'oauth', blurb: 'Tasks, projects and goals.', docs: 'https://developers.asana.com/docs/using-asanas-model-control-protocol-mcp-server' },
  { key: 'intercom', name: 'Intercom', url: 'https://mcp.intercom.com/mcp', auth: 'oauth', blurb: 'Conversations, contacts and tickets.', docs: 'https://developers.intercom.com/docs/guides/mcp' },
  { key: 'cloudflare-docs', name: 'Cloudflare docs', url: 'https://docs.mcp.cloudflare.com/mcp', auth: 'none', blurb: 'Search Cloudflare documentation. No sign-in needed; a good first test.', docs: 'https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/' },
  { key: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/mcp', auth: 'bearer', blurb: 'Models, datasets, papers and Spaces.', tokenHint: 'A Hugging Face access token (read).', docs: 'https://huggingface.co/settings/mcp' },
  { key: 'zapier', name: 'Zapier', url: 'https://mcp.zapier.com/api/mcp/mcp', auth: 'bearer', blurb: 'Thousands of apps through the actions you enable in Zapier.', tokenHint: 'The token from your Zapier MCP server page (or paste the full URL Zapier gives you).', docs: 'https://zapier.com/mcp' },
  { key: 'custom', name: 'Custom MCP server', url: '', auth: 'none', blurb: 'Any remote MCP server reachable over HTTPS: your own, your company’s, or one from a vendor not listed here.' },
];

export const MAX_TOOLS_SHOWN = 60;

export function presetFor(key: string | null | undefined): Preset | null { return CATALOG.find(p => p.key === key) || null; }
/** The catalog as the client sees it: the Vault entry carries this deployment's Vault address and whether it is set up. */
export function catalogForClient(): Preset[] {
  return CATALOG.map(p => p.key === VAULT_PRESET ? { ...p, url: vaultMcpUrl(), available: vaultConfigured() } : p);
}

/** A name the model can address: letters, digits, underscore and dash. Unique per person. */
export function serverNameFor(name: string, taken: string[]): string {
  let base = slugify(name).replace(/-/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'connector';
  if (/^\d/.test(base)) base = 'c_' + base;
  let out = base, n = 2;
  while (taken.includes(out)) out = `${base}_${n++}`;
  return out;
}

/** Only public HTTPS servers; private and local addresses are never fetched. */
export function validateUrl(raw: string): string {
  let u: URL;
  try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'That is not a valid URL'); }
  if (u.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && u.hostname === 'localhost')) throw new HttpError(400, 'Connector URLs must start with https://');
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' && process.env.NODE_ENV === 'production') throw new HttpError(400, 'Local addresses cannot be used');
  if (/^(\d+\.){3}\d+$/.test(h) || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0' || h.startsWith('[')) throw new HttpError(400, 'Use a public hostname, not an IP or local address');
  if (u.username || u.password) throw new HttpError(400, 'Do not put credentials in the URL; use the token field');
  return u.toString();
}

export type ClientConnector = {
  id: string; name: string; serverName: string; preset: string | null; url: string; authType: ConnectorAuth; enabled: boolean;
  allowedTools: string[] | null; tools: ConnectorTool[]; status: ConnectorStatus; lastError: string | null; lastCheckedAt: number | null;
  hasCredential: boolean; createdAt: number; updatedAt: number;
};

export async function toClient(c: ConnectorRow): Promise<ClientConnector> {
  const s = await openJson<ConnectorSecret>(c.secret);
  return {
    id: c.id, name: c.name, serverName: c.serverName, preset: c.preset, url: c.url, authType: c.authType, enabled: !!c.enabled,
    allowedTools: c.allowedTools || null, tools: (c.tools || []).slice(0, MAX_TOOLS_SHOWN), status: c.status, lastError: c.lastError,
    lastCheckedAt: c.lastCheckedAt ? new Date(c.lastCheckedAt).getTime() : null,
    hasCredential: !!(s && (s.token || s.accessToken)), createdAt: new Date(c.createdAt).getTime(), updatedAt: new Date(c.updatedAt).getTime(),
  };
}

export async function listConnectors(userId: string): Promise<ConnectorRow[]> {
  return db().select().from(schema.connectors).where(eq(schema.connectors.userId, userId));
}

export async function getConnectorOwned(userId: string, id: string): Promise<ConnectorRow> {
  const rows = await db().select().from(schema.connectors).where(and(eq(schema.connectors.id, id), eq(schema.connectors.userId, userId))).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Connector not found');
  return rows[0];
}

/** The bearer token to send, refreshing OAuth tokens when needed (and saving the refreshed ones). */
export async function tokenFor(c: ConnectorRow): Promise<string | null> {
  if (c.authType === 'none') return null;
  const s = await openJson<ConnectorSecret>(c.secret);
  if (!s) return null;
  if (c.authType === 'bearer') return s.token || null;
  const f = await freshSecret(s);
  if (!f) return null;
  if (f.changed) await db().update(schema.connectors).set({ secret: await sealJson(f.secret), updatedAt: new Date() }).where(eq(schema.connectors.id, c.id));
  return f.secret.accessToken || null;
}

/** Ask the server what it offers and record the outcome on the row. */
export async function checkConnector(c: ConnectorRow): Promise<ConnectorRow> {
  const patch: Partial<ConnectorRow> = { lastCheckedAt: new Date(), updatedAt: new Date() };
  try {
    const token = await tokenFor(c);
    if (c.authType !== 'none' && !token) throw new McpError('Sign in to this connector first', 'auth');
    const probe = await probeMcp(c.url, token);
    patch.tools = probe.tools; patch.status = 'ok'; patch.lastError = null;
  } catch (e) {
    const err = e as McpError;
    const authIssue = err instanceof McpError && err.kind === 'auth';
    patch.status = authIssue ? 'needs_auth' : 'error';
    patch.lastError = (authIssue && c.authType === 'bearer' ? 'The server rejected the token. Edit the connector and paste a current one.' : authIssue && c.authType === 'none' ? 'This server needs a sign-in. Edit the connector and choose a token or the app sign-in.' : String(err?.message || 'Could not reach the server')).slice(0, 300);
  }
  const rows = await db().update(schema.connectors).set(patch).where(eq(schema.connectors.id, c.id)).returning();
  return rows[0] || { ...c, ...patch };
}

/** What the model gets: every enabled, working connector, with a live token. */
export type ModelConnector = { id: string; preset: string | null; name: string; label: string; url: string; token: string | null; allowedTools: string[] | null; tools: ConnectorTool[] };
export async function connectorsForModel(userId: string, max: number): Promise<ModelConnector[]> {
  if (max <= 0) return [];
  const rows = (await listConnectors(userId)).filter(c => c.enabled && c.status !== 'error').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(0, max);
  const out: ModelConnector[] = [];
  for (const c of rows) {
    const token = await tokenFor(c);
    if (c.authType !== 'none' && !token) continue;
    out.push({ id: c.id, preset: c.preset, name: c.serverName, label: c.name, url: c.url, token, allowedTools: c.allowedTools?.length ? c.allowedTools : null, tools: c.tools || [] });
  }
  return out;
}

/** One line per connector for the system prompt, so the model knows what it can reach and when to use it. */
export function connectorsPromptBlock(list: ModelConnector[]): string {
  if (!list.length) return '';
  const lines = list.map(c => {
    const names = (c.allowedTools || c.tools.map(t => t.name)).slice(0, 12);
    return `- ${c.label} (server "${c.name}")${names.length ? `: ${names.join(', ')}${(c.allowedTools || c.tools).length > 12 ? ', …' : ''}` : ''}`;
  });
  return `Connected apps. The person has linked these outside apps and MCP servers; their tools are available to you in this conversation:\n${lines.join('\n')}\nUse them when the question is about the person's own data, records or work in those apps (their issues, pages, deals, files, customers, projects, code), and when a tool would give a more exact answer than the web. Do not use them for general knowledge. Call the tool, read the result, then answer in your own words; never dump raw tool output, and never mention server names or tool names in the answer.${list.some(c => c.label === 'VDRPros Vault' || /vdrpros|vault/i.test(c.name)) ? `\nVDRPros Vault holds the person's own documents (depositions, transcripts, summaries, exhibits, records). For questions about a witness, a matter, a defendant, a site, a product or anything that would be in those files, search the Vault first (vault_search), read the pages you will rely on (vault_read), and cite them with the bracketed numbers the results carry, exactly like web sources: a claim from a Vault page ends with its [n]. When a matching folder is still on paper, say so and offer to request a scan; do not request one unless the person asks.` : ''}`;
}
