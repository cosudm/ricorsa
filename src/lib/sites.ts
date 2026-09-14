/**
 * Website connectors: read a site the person points Ricorsa at, keep its pages as text, search them.
 *
 * Reading: a bounded, same-site walk from the root. Each page is fetched plainly first; when the document is an
 * application with little static text (a React or Vue explorer, a dashboard), it is opened in the headless browser
 * (Cloudflare Browser Run) and the text on screen is taken instead, along with the links the page shows, and its
 * in-page navigation (tabs, menu buttons) is pressed so screens that only appear on a click are kept too.
 * Searching: the connector's pages are scored in memory (a few dozen pages at most), which is fast enough here
 * and needs no index. Everything stays inside the person's account; other people's sites are never read.
 */
import { eq, and, asc } from 'drizzle-orm';
import puppeteer, { type Browser } from '@cloudflare/puppeteer';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { db, schema } from './db';
import { htmlToText } from './search';
import { uid, HttpError } from './http';

export const SITE_PRESET = 'website';
export const MAX_PAGES_CAP = 60;
const PAGE_TEXT_CAP = 24_000;
const TOTAL_TEXT_CAP = 1_400_000;
const FETCH_TIMEOUT_MS = 12_000;
const THIN_TEXT = 320;
const UA = 'Mozilla/5.0 (compatible; Ricorsa/1.0; +https://ricorsa.com) reading a site its owner connected';

export type SitePage = { url: string; title: string; text: string; rendered: boolean };
export type CrawlResult = { pages: SitePage[]; rendered: number; chars: number; skipped: string[] };

/** A URL Ricorsa may read: public http(s), a real host, no private or local addresses. */
export function validateSiteUrl(raw: string): string {
  let u: URL;
  try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'Enter a full address, like https://example.com'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Only http and https addresses can be read');
  const host = u.hostname.toLowerCase();
  // Local development only: a site served from this machine can be read (the fixture the tests use).
  if (process.env.NODE_ENV !== 'production' && process.env.SITES_ALLOW_LOCAL === '1' && (host === 'localhost' || host === '127.0.0.1')) return u.toString();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) throw new HttpError(400, 'That address is not a public website');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224) throw new HttpError(400, 'That address is not a public website');
  }
  if (host.includes(':') || /^\[/.test(host)) throw new HttpError(400, 'That address is not a public website');
  if (u.port && u.port !== '80' && u.port !== '443') throw new HttpError(400, 'Only the standard web ports can be read');
  if (u.username || u.password) throw new HttpError(400, 'Leave sign-in details out of the address');
  u.hash = '';
  return u.toString();
}

function normalize(url: string): string {
  try { const u = new URL(url); u.hash = ''; u.username = ''; u.password = ''; let s = u.toString(); if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1); return s; } catch { return ''; }
}
function sameSite(a: URL, b: URL): boolean { return a.host === b.host || a.host.replace(/^www\./, '') === b.host.replace(/^www\./, ''); }
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|json|xml|rss|atom|pdf|zip|gz|tgz|rar|7z|mp3|mp4|mov|avi|wav|woff2?|ttf|eot|exe|dmg|pkg)(\?|$)/i;

function linksFromHtml(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(raw)) continue;
    try { const u = new URL(raw, base); if (sameSite(u, base) && !SKIP_EXT.test(u.pathname)) out.push(normalize(u.toString())); } catch { /* not a link */ }
  }
  return out;
}
function titleFromHtml(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim().slice(0, 160) : '';
}

type BrowserBinding = Parameters<typeof puppeteer.launch>[0];
function binding(): BrowserBinding | null {
  try { const { env } = getCloudflareContext(); return ((env as unknown as { BROWSER?: BrowserBinding }).BROWSER) || null; } catch { return null; }
}

/** The text and links a page shows once its scripts have run, and the screens its own navigation reveals. */
const RENDER_SRC = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const textOf = () => (document.body ? document.body.innerText : '').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
  const links = () => Array.from(document.querySelectorAll('a[href]')).map(a => a.href).filter(h => /^https?:/.test(h));
  const seen = new Set(); const screens = [];
  const base = textOf(); seen.add(base.slice(0, 4000)); screens.push({ label: '', text: base, href: location.href });
  // In-page navigation: tabs, menu items and buttons that name a section (not links, which are followed separately).
  const controls = Array.from(document.querySelectorAll('[role="tab"], [role="menuitem"], nav button, header button, button[data-screen], button[data-tab], button[data-view], [role="tablist"] button, .tabs button, .nav button'))
    .filter(el => el.offsetParent !== null && (el.innerText || '').trim().length > 0 && (el.innerText || '').trim().length < 60).slice(0, 14);
  for (const el of controls) {
    try { el.click(); } catch (e) { continue; }
    await sleep(500);
    const t = textOf(); const key = t.slice(0, 4000);
    if (t.length > 40 && !seen.has(key)) { seen.add(key); screens.push({ label: (el.innerText || '').trim().slice(0, 60), text: t, href: location.href }); }
  }
  return { title: document.title || '', screens, links: Array.from(new Set(links())).slice(0, 200) };
})()`;

async function renderPage(browser: Browser, url: string): Promise<{ title: string; text: string; links: string[] } | null> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20_000 }).catch(async () => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }); });
    await new Promise(r => setTimeout(r, 800));
    const r = await Promise.race([
      page.evaluate(RENDER_SRC) as Promise<{ title: string; screens: Array<{ label: string; text: string; href: string }>; links: string[] }>,
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error('render took too long')), 25_000)),
    ]);
    if (!r) return null;
    const parts = r.screens.map((s, i) => (i === 0 || !s.label) ? s.text : `## ${s.label}\n${s.text}`);
    // Screens repeat the shell (header, nav); keep each screen's text but drop lines already seen on the first.
    const firstLines = new Set(parts[0].split('\n').map(l => l.trim()).filter(l => l.length > 20));
    const text = parts.map((p, i) => i === 0 ? p : p.split('\n').filter(l => !firstLines.has(l.trim())).join('\n')).join('\n\n');
    return { title: r.title, text, links: r.links };
  } finally { try { await page.close(); } catch { /* gone */ } }
}

async function fetchPlain(url: string, signal?: AbortSignal): Promise<{ ok: boolean; html: string; status: number; type: string }> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: ctl.signal });
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) return { ok: false, html: '', status: res.status, type };
    if (!type.includes('html') && !type.includes('text/plain') && !type.includes('xml')) return { ok: false, html: '', status: res.status, type };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return { ok: false, html: '', status: res.status, type };
    return { ok: true, html: new TextDecoder().decode(buf), status: res.status, type };
  } catch { return { ok: false, html: '', status: 0, type: '' }; }
  finally { clearTimeout(t); }
}

/** Walk the site from its root, same host only, and return what its pages say. */
export async function crawlSite(rootUrl: string, opts: { maxPages: number; budgetMs?: number; onStatus?: (t: string) => void; signal?: AbortSignal }): Promise<CrawlResult> {
  const started = Date.now(); const budget = opts.budgetMs || 75_000;
  const root = new URL(rootUrl);
  const queue: string[] = [normalize(rootUrl)]; const seen = new Set<string>(queue);
  const pages: SitePage[] = []; const skipped: string[] = []; let rendered = 0; let chars = 0;
  let browser: Browser | null = null;
  const getBrowser = async () => { if (browser) return browser; const b = binding(); if (!b) return null; try { browser = await puppeteer.launch(b); return browser; } catch (e) { console.warn('[sites] browser unavailable', String((e as Error)?.message || e)); return null; } };
  try {
    while (queue.length && pages.length < opts.maxPages && Date.now() - started < budget && chars < TOTAL_TEXT_CAP) {
      if (opts.signal?.aborted) break;
      const url = queue.shift()!;
      opts.onStatus?.(`Reading page ${pages.length + 1}: ${url.replace(/^https?:\/\//, '').slice(0, 70)}`);
      const plain = await fetchPlain(url, opts.signal);
      let title = plain.ok ? titleFromHtml(plain.html) : '';
      let text = plain.ok ? htmlToText(plain.html) : '';
      let links = plain.ok ? linksFromHtml(plain.html, new URL(url)) : [];
      let wasRendered = false;
      // An application shell (little text once scripts are stripped) or a page that would not fetch: open it in the browser.
      if ((plain.ok && text.length < THIN_TEXT && /<script/i.test(plain.html)) || (!plain.ok && plain.status !== 404 && !plain.type)) {
        const b = await getBrowser();
        if (b) {
          try {
            const r = await renderPage(b, url);
            if (r && r.text.length > text.length) { text = r.text; title = r.title || title; wasRendered = true; rendered++; links = [...new Set([...links, ...r.links.map(normalize)])].filter(l => { try { const u = new URL(l); return sameSite(u, root) && !SKIP_EXT.test(u.pathname); } catch { return false; } }); }
          } catch (e) { console.warn('[sites] render failed', url, String((e as Error)?.message || e)); }
        }
      }
      if (!text.trim()) { skipped.push(url); continue; }
      text = text.slice(0, PAGE_TEXT_CAP);
      pages.push({ url, title: title || url.replace(/^https?:\/\//, ''), text, rendered: wasRendered });
      chars += text.length;
      for (const l of links) { if (!seen.has(l) && seen.size < 400) { seen.add(l); queue.push(l); } }
    }
  } finally { if (browser) { try { await browser.close(); } catch { /* gone */ } } }
  return { pages, rendered, chars, skipped };
}

/** Read the site behind a connector and replace its stored pages. */
export async function readSite(connectorId: string, userId: string, onStatus?: (t: string) => void): Promise<{ pages: number; chars: number; rendered: number }> {
  const d = db();
  const site = (await d.select().from(schema.sites).where(and(eq(schema.sites.connectorId, connectorId), eq(schema.sites.userId, userId))).limit(1))[0];
  if (!site) throw new HttpError(404, 'This connector has no site');
  await d.update(schema.sites).set({ status: 'reading', error: null }).where(eq(schema.sites.connectorId, connectorId));
  try {
    const r = await crawlSite(site.rootUrl, { maxPages: Math.min(site.maxPages, MAX_PAGES_CAP), onStatus });
    if (!r.pages.length) throw new Error('Nothing readable was found at that address');
    await d.delete(schema.sitePages).where(eq(schema.sitePages.connectorId, connectorId));
    for (let i = 0; i < r.pages.length; i++) {
      const p = r.pages[i];
      await d.insert(schema.sitePages).values({ id: uid(), connectorId, userId, ordinal: i, url: p.url, title: p.title, text: p.text, chars: p.text.length, rendered: p.rendered });
    }
    await d.update(schema.sites).set({ status: 'ready', error: null, pages: r.pages.length, chars: r.chars, rendered: r.rendered, crawledAt: new Date() }).where(eq(schema.sites.connectorId, connectorId));
    console.log('[sites] read', JSON.stringify({ connectorId, pages: r.pages.length, chars: r.chars, rendered: r.rendered, skipped: r.skipped.length }));
    return { pages: r.pages.length, chars: r.chars, rendered: r.rendered };
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 200);
    await d.update(schema.sites).set({ status: 'error', error: msg }).where(eq(schema.sites.connectorId, connectorId));
    throw new HttpError(502, msg);
  }
}

export type SiteHit = { ref: string; url: string; title: string; snippet: string; score: number };

function tokens(s: string): string[] { return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1); }

/** Score the connector's pages against a query: term frequency with a title bonus, a snippet around the best match. */
export async function searchSite(connectorId: string, query: string, limit = 6): Promise<{ hits: SiteHit[]; pages: number }> {
  const rows = await db().select({ url: schema.sitePages.url, title: schema.sitePages.title, text: schema.sitePages.text }).from(schema.sitePages).where(eq(schema.sitePages.connectorId, connectorId)).orderBy(asc(schema.sitePages.ordinal));
  const terms = [...new Set(tokens(query))].slice(0, 12);
  if (!terms.length) return { hits: [], pages: rows.length };
  const scored: SiteHit[] = [];
  for (const r of rows) {
    const low = r.text.toLowerCase(); const title = r.title.toLowerCase();
    let score = 0; let firstAt = -1; let matched = 0;
    for (const t of terms) {
      let count = 0; let at = low.indexOf(t);
      if (at >= 0) { matched++; if (firstAt < 0 || at < firstAt) firstAt = at; }
      while (at >= 0 && count < 50) { count++; at = low.indexOf(t, at + t.length); }
      score += Math.log1p(count) * (t.length > 3 ? 1.4 : 1) + (title.includes(t) ? 2.5 : 0);
    }
    if (!matched) continue;
    score *= matched / terms.length;
    const start = Math.max(0, (firstAt < 0 ? 0 : firstAt) - 160);
    const snippet = r.text.slice(start, start + 420).replace(/\s+/g, ' ').trim();
    scored.push({ ref: '', url: r.url, title: r.title, snippet: (start > 0 ? '… ' : '') + snippet + (start + 420 < r.text.length ? ' …' : ''), score });
  }
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, Math.max(1, Math.min(limit, 12))).map((h, i) => ({ ...h, ref: `S${i + 1}` }));
  return { hits, pages: rows.length };
}

/** One page's text (capped), by URL. */
export async function readSitePage(connectorId: string, url: string, maxChars = 14_000): Promise<{ url: string; title: string; text: string; total: number } | null> {
  const want = normalize(url);
  const rows = await db().select({ url: schema.sitePages.url, title: schema.sitePages.title, text: schema.sitePages.text }).from(schema.sitePages).where(eq(schema.sitePages.connectorId, connectorId));
  const row = rows.find(r => r.url === want) || rows.find(r => normalize(r.url) === want) || rows.find(r => r.url.startsWith(want));
  if (!row) return null;
  return { url: row.url, title: row.title, text: row.text.slice(0, maxChars), total: row.text.length };
}

export async function listSitePages(connectorId: string): Promise<Array<{ url: string; title: string; chars: number; rendered: boolean }>> {
  return db().select({ url: schema.sitePages.url, title: schema.sitePages.title, chars: schema.sitePages.chars, rendered: schema.sitePages.rendered }).from(schema.sitePages).where(eq(schema.sitePages.connectorId, connectorId)).orderBy(asc(schema.sitePages.ordinal));
}

/** The MCP endpoint the model reaches this site through. */
export function siteMcpUrl(connectorId: string): string { return `${(process.env.APP_BASE_URL || '').replace(/\/+$/, '')}/api/sites/mcp/${encodeURIComponent(connectorId)}`; }

/**
 * Turn a site_search result into numbered sources (continuing from `from`) and rewrite the model's copy of the
 * result so the refs it sees are the [n] the reader will see; site_read makes the page a source too. Mirrors the
 * Vault numbering, with real page URLs, so citations open the page.
 */
export function numberSiteHits(label: string, text: string, structured: unknown, from: number, existing: Src[]): { text: string; added: Src[] } {
  const s = structured as { hits?: Array<{ ref: string; url: string; title: string; snippet?: string }> } | null;
  const hits = s?.hits || [];
  if (!hits.length) return { text, added: [] };
  const added: Src[] = []; let out = text; let n = from;
  for (const h of hits) {
    let src = existing.find(x => x.url === h.url) || added.find(x => x.url === h.url);
    if (!src) { n += 1; src = { n, title: h.title || h.url, domain: domainOf(h.url) || label, url: h.url, snippet: h.snippet }; added.push(src); }
    out = out.split(`[${h.ref}]`).join(`[${src.n}]`);
  }
  return { text: out + `\n\nCite these pages in the answer with their bracketed numbers, like web sources.`, added };
}
export function numberSitePage(label: string, text: string, structured: unknown, from: number, existing: Src[]): { text: string; added: Src[] } {
  const s = structured as { url?: string; title?: string } | null;
  if (!s?.url) return { text, added: [] };
  let src = existing.find(x => x.url === s.url);
  const added: Src[] = [];
  if (!src) { src = { n: from + 1, title: s.title || s.url, domain: domainOf(s.url) || label, url: s.url }; added.push(src); }
  return { text: `[${src.n}] ${text}\n\nCite this page as [${src.n}].`, added };
}
type Src = { n: number; title: string; domain: string; url: string; snippet?: string; text?: string };
function domainOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
