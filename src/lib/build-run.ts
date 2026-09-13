/**
 * Run a built app for real. Cloudflare Browser Run opens the document in a headless Chrome on its own
 * origin (so localStorage works as it will for the person), the exerciser presses every control and
 * walks every screen, the page is loaded again to check that saved data comes back cleanly, and a phone
 * width is tried for horizontal overflow. Any network request the app makes is refused and reported,
 * since a finished app must work offline. What comes back is a plain list of findings the builder can
 * fix; when the browser cannot be reached the caller falls back to the static audit.
 */
import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { INSTALL_SRC, EXERCISER_SRC, type ExerciseReport } from './build-exerciser';

export type RunIssue = { kind: 'error' | 'dead' | 'missing' | 'blank' | 'overflow' | 'dialog' | 'network' | 'persist' | 'navigated'; detail: string };
export type RunResult = { ran: boolean; issues: RunIssue[]; report: ExerciseReport | null; seconds: number; why?: string; clicked: number; controls: number };

const ORIGIN = 'https://app.ricorsa.invalid';
const RUN_BUDGET_MS = 40_000;

type BrowserBinding = Parameters<typeof puppeteer.launch>[0];
function binding(): BrowserBinding | null {
  try { const { env } = getCloudflareContext(); return ((env as unknown as { BROWSER?: BrowserBinding }).BROWSER) || null; } catch { return null; }
}
/** Whether this deployment has the Browser Run binding (wrangler.jsonc "browser"). */
export function browserRunAvailable(): boolean { return !!binding(); }

export async function runApp(html: string, opts: { budgetMs?: number; onStatus?: (text: string) => void } = {}): Promise<RunResult> {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 10) / 100;
  const b = binding();
  if (!b) return { ran: false, issues: [], report: null, seconds: 0, why: 'no browser binding', clicked: 0, controls: 0 };
  let browser: Browser | null = null;
  const issues: RunIssue[] = [];
  const add = (kind: RunIssue['kind'], detail: string) => { if (issues.length < 24 && !issues.some(i => i.detail === detail)) issues.push({ kind, detail: detail.slice(0, 260) }); };
  try {
    opts.onStatus?.('Opening the app in a browser');
    browser = await withTimeout(puppeteer.launch(b), 20_000, 'browser launch');
    const page = await browser.newPage();
    const consoleErrors: string[] = []; const pageErrors: string[] = []; const network: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => { if (pageErrors.length < 20) pageErrors.push(String((e as Error)?.message || e).slice(0, 200)); });
    page.on('dialog', (d) => { void d.dismiss().catch(() => {}); });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url === ORIGIN + '/' || url === ORIGIN) { void req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html }); return; }
      if (url.startsWith('data:') || url.startsWith('blob:')) { void req.continue(); return; }
      // The browser's own favicon fetch and anything else under the app's origin: quietly not found.
      if (url.startsWith(ORIGIN + '/')) { void req.respond({ status: 404, contentType: 'text/plain', body: '' }); return; }
      if (network.length < 12) network.push(url.slice(0, 120));
      void req.abort();
    });
    await page.evaluateOnNewDocument(INSTALL_SRC);
    await page.setViewport({ width: 1280, height: 800 });
    await withTimeout(page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 15_000 }), 16_000, 'page load');
    await sleep(400);
    opts.onStatus?.('Pressing every control and opening every screen');
    let report: ExerciseReport | null = null;
    try {
      const budget = Math.max(8_000, Math.min(opts.budgetMs || RUN_BUDGET_MS, RUN_BUDGET_MS) - (Date.now() - started) - 6_000);
      report = await withTimeout(page.evaluate(`${EXERCISER_SRC}(${JSON.stringify({ budgetMs: budget, maxClicks: 160 })})`) as Promise<ExerciseReport>, budget + 4_000, 'exerciser');
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (/context was destroyed|navigation|detached/i.test(msg)) add('navigated', 'a click made the page leave the app (a link or form that navigates away); every control must work inside the page');
      else add('error', `the app could not be exercised: ${msg.slice(0, 160)}`);
    }
    for (const e of pageErrors) add('error', `error in the page: ${e}`);
    for (const e of consoleErrors.filter(c => !/net::ERR_|Failed to load resource/i.test(c))) add('error', `console error: ${e}`);
    for (const u of network) add('network', `the app tried to load ${u}; it must not make network requests`);
    if (report) {
      if (report.blank) add('blank', 'nothing visible renders after the page loads');
      for (const e of report.errors) add('error', e);
      for (const d of report.dead) add('dead', d);
      for (const m of report.navMissing) add('missing', m);
      for (const d of report.dialogs) add('dialog', `a browser dialog is used (${d}); use in-page messages and confirmations instead`);
      if (report.overflow) add('overflow', 'the page overflows horizontally at desktop width');
    }
    // Load it again: saved state must come back without errors, and something must still be on screen.
    opts.onStatus?.('Loading it again to check saved data');
    pageErrors.length = 0; consoleErrors.length = 0;
    try {
      await withTimeout(page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 12_000 }), 13_000, 'reload');
      await sleep(400);
      const blank = await page.evaluate(`(() => { const t = (document.body ? document.body.innerText || '' : '').replace(/\\s+/g, ' ').trim(); return t.length < 20 && !document.querySelector('canvas, svg, img, input, button'); })()`) as boolean;
      if (blank) add('persist', 'after a reload with saved data present, nothing visible renders');
      for (const e of pageErrors) add('persist', `after a reload with saved data present: ${e}`);
    } catch (e) { add('persist', `the app could not be loaded a second time: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    // A phone width: no horizontal overflow.
    try {
      await page.setViewport({ width: 375, height: 740 });
      await withTimeout(page.goto(ORIGIN + '/', { waitUntil: 'load', timeout: 12_000 }), 13_000, 'phone load');
      await sleep(300);
      const over = await page.evaluate(`document.documentElement.scrollWidth > window.innerWidth + 2`) as boolean;
      if (over) add('overflow', 'the layout overflows horizontally at a phone width (375px); it must fit without sideways scrolling');
    } catch { /* the phone check is best effort */ }
    const result: RunResult = { ran: true, issues, report, seconds: seconds(), clicked: report?.clicked || 0, controls: report?.controls || 0 };
    console.log('[build] run', JSON.stringify({ seconds: result.seconds, clicked: result.clicked, controls: result.controls, issues: issues.length, kinds: countKinds(issues) }));
    return result;
  } catch (e) {
    const why = String((e as Error)?.message || e).slice(0, 200);
    console.warn('[build] run unavailable', why);
    return { ran: false, issues: [], report: null, seconds: seconds(), why, clicked: 0, controls: 0 };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* already gone */ } }
  }
}

function countKinds(issues: RunIssue[]): Record<string, number> { const out: Record<string, number> = {}; for (const i of issues) out[i.kind] = (out[i.kind] || 0) + 1; return out; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms); p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); });
}

/** The findings as the builder should read them: one line each, most serious first, capped. */
export function runFindings(r: RunResult): string[] {
  const order: RunIssue['kind'][] = ['error', 'blank', 'persist', 'navigated', 'missing', 'dead', 'dialog', 'network', 'overflow'];
  return [...r.issues].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map(i => i.detail).slice(0, 18);
}
/** Findings that mean the app is broken for the person, as opposed to rough edges. */
export function seriousFindings(r: RunResult): number {
  return r.issues.filter(i => ['error', 'blank', 'persist', 'navigated', 'missing', 'dead'].includes(i.kind)).length;
}
export type { Page };
