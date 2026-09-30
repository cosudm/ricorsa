/**
 * Ricorsa's browser. When the person asks Ricorsa to open a website for them, the model drives a headless Chrome
 * (Cloudflare Browser Run, the same binding the Build studio uses to run apps) one action at a time: open, click,
 * type, choose, scroll, back. After every action the page is read back as text with numbered controls, so the model
 * can decide what to do next, and a screenshot is stored so the person can watch each step in the thread.
 *
 * Rules that hold whatever the model asks: public websites only (the same address check the website connector
 * uses), no field that takes a password, card number or government id is ever filled, nothing is signed in to, and
 * every action counts against the plan's monthly ceiling. Each answer has its own cap on actions and on time so a
 * loop on a stubborn page cannot run away.
 */
import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { SNAPSHOT_SRC, CLICK_PREP_SRC, FIELD_PREP_SRC, SELECT_SRC, FIND_SRC } from './browse-snapshot';
import { validateSiteUrl } from './sites';
import { putFile, deletePrefix } from './storage';
import { HttpError } from './http';
import type { LocalToolSet, ToolOutcome } from './llm';
import type { BrowseRecord, BrowseStep } from './db/schema';

/** The most actions one answer may take in the browser, whatever the plan has left. */
export const MAX_ACTIONS_PER_ANSWER = 40;
/** Steps of every kind (reads and finds included) one answer may take. */
export const MAX_STEPS_PER_ANSWER = 70;
/** How long the browser may be worked for one answer, from the first page opened. */
export const BROWSE_BUDGET_MS = 150_000;
const VIEWPORT = { width: 1280, height: 800 };
const SHOT_SCALE = 0.8;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
/** A typed value that is itself a card number or a social security number is refused, whatever the field. */
const SENSITIVE_VALUE = /\b(?:\d[ -]?){13,19}\b|\b\d{3}-\d{2}-\d{4}\b/;

type Binding = Parameters<typeof puppeteer.launch>[0];
function binding(): Binding | null {
  try { const { env } = getCloudflareContext(); return ((env as unknown as { BROWSER?: Binding }).BROWSER) || null; } catch { return null; }
}
/** Whether this deployment can open a browser: the Browser Run binding, or (development only) a Chrome reachable over `BROWSER_WS_ENDPOINT`. */
export function browserAvailable(): boolean { return !!binding() || !!process.env.BROWSER_WS_ENDPOINT; }

type Snapshot = { url: string; title: string; text: string; refs: number; protected: number; skipped: number; more: number; scroll: { y: number; height: number; viewport: number }; dialog: string };
type Prep = { ok: boolean; why?: string; protectedField?: boolean; x?: number; y?: number; tag?: string; type?: string; href?: string; target?: string; label?: string; contentEditable?: boolean };

export type BrowseOpts = {
  userId: string; turnId: string;
  /** How many actions this answer may take: the plan's remaining month, capped per answer. */
  maxActions: number;
  budgetMs?: number;
  signal?: AbortSignal;
  /** Called after every step, once its screenshot is stored, with the record so far. */
  onStep?: (step: BrowseStep, record: BrowseRecord) => void;
  /** Numbers a page the browser has shown as a source the answer can cite; returns its [n]. */
  onPage?: (page: { url: string; title: string }) => number;
};

export class BrowseSession {
  readonly steps: BrowseStep[] = [];
  actions = 0;
  stopped: BrowseRecord['stopped'];
  private browser: Browser | null = null;
  private page: Page | null = null;
  private connected = false;
  private startedAt = 0;
  private shots = 0;
  private readonly pageNumbers = new Map<string, number>();
  private readonly seen = new Set<string>();
  private launchError: string | null = null;

  constructor(private readonly o: BrowseOpts) {}

  /** What this answer's browsing amounted to, as stored on the turn. */
  record(): BrowseRecord { return { steps: this.steps, actions: this.actions, pages: this.seen.size, ...(this.stopped ? { stopped: this.stopped } : {}) }; }

  /** The tools the model gets, bound to this session. */
  toolSet(): LocalToolSet {
    return {
      name: 'browser', label: 'Browser',
      tools: [
        { name: 'browser_open', description: "Open a web page in Ricorsa's browser (public websites only; nothing is signed in). Returns the page as text: headings and text in reading order, with every link, button and field numbered as [n|...] so you can act on it. Start here with the address from the question, or one from the sources.", parameters: { type: 'object', properties: { url: { type: 'string', description: 'The full address, starting with https://' } }, required: ['url'] } },
        { name: 'browser_click', description: 'Click a numbered control [n] from the latest page text: a link, button, tab, menu item, checkbox or radio. Returns the page as it is afterwards.', parameters: { type: 'object', properties: { ref: { type: 'integer', description: 'The number of the control' }, why: { type: 'string', description: 'A few words on what this click is for, shown to the person watching' } }, required: ['ref'] } },
        { name: 'browser_type', description: 'Type into a numbered field [n], replacing what it holds. Set submit to true to press Enter afterwards (search boxes and single-field forms). Fields that take passwords, card numbers or government ids are protected and refused; the person types those themselves.', parameters: { type: 'object', properties: { ref: { type: 'integer' }, text: { type: 'string' }, submit: { type: 'boolean', description: 'Press Enter after typing' } }, required: ['ref', 'text'] } },
        { name: 'browser_select', description: 'Choose an option in a numbered drop-down list [n] by its visible text or its value.', parameters: { type: 'object', properties: { ref: { type: 'integer' }, option: { type: 'string' } }, required: ['ref', 'option'] } },
        { name: 'browser_scroll', description: 'Scroll the page by one screen (down or up), or to the top or the bottom. The page text returned starts from the new position, so this is how to read further down a long page.', parameters: { type: 'object', properties: { to: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] } } } },
        { name: 'browser_back', description: 'Go back to the previous page.', parameters: { type: 'object', properties: {} } },
        { name: 'browser_read', description: 'Read the whole current page as plain text from the top, in more detail than the page view (articles, listings, tables). Does not count as an action.', parameters: { type: 'object', properties: { maxChars: { type: 'integer', description: 'Up to 24000' } } } },
        { name: 'browser_find', description: 'Find text on the current page: each match with its surroundings and the numbered controls next to it; the first match is scrolled into view. Does not count as an action.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
      ],
      status: (tool, args) => {
        const a = args as { url?: string; why?: string; ref?: number; text?: string; to?: string; option?: string };
        switch (tool) {
          case 'browser_open': return `Opening ${hostOf(String(a.url || '')) || 'the site'}`;
          case 'browser_click': return a.why ? `Clicking: ${cut(String(a.why), 60)}` : 'Clicking on the page';
          case 'browser_type': return 'Typing on the page';
          case 'browser_select': return `Choosing ${cut(String(a.option || ''), 40)}`;
          case 'browser_scroll': return `Scrolling ${a.to || 'down'}`;
          case 'browser_back': return 'Going back';
          case 'browser_read': return 'Reading the page';
          case 'browser_find': return `Looking for ${cut(String(a.text || ''), 40)}`;
          default: return 'Using the browser';
        }
      },
      call: (tool, args, signal) => this.call(tool, args, signal),
    };
  }

  async call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutcome> {
    if (signal?.aborted || this.o.signal?.aborted) { this.stopped = 'aborted'; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }
    const a = args as { url?: string; ref?: number | string; why?: string; text?: string; submit?: boolean; option?: string; to?: string; maxChars?: number };
    const isAction = !['browser_read', 'browser_find'].includes(tool);
    if (this.steps.length >= MAX_STEPS_PER_ANSWER) { this.stopped = this.stopped || 'actions'; return err('No more steps are available for this answer. Write the answer now from what you have seen.'); }
    if (isAction && this.actions >= this.o.maxActions) { this.stopped = 'actions'; return err(`The ${this.o.maxActions} browser actions available for this answer are used up. Write the answer now from what you have seen, and say what was left undone.`); }
    if (this.startedAt && Date.now() - this.startedAt > (this.o.budgetMs || BROWSE_BUDGET_MS)) { this.stopped = 'time'; return err('The time available for browsing in this answer is up. Write the answer now from what you have seen, and say what was left undone.'); }
    try {
      switch (tool) {
        case 'browser_open': return await this.open(String(a.url || ''));
        case 'browser_click': return await this.click(num(a.ref), a.why ? String(a.why) : '');
        case 'browser_type': return await this.type(num(a.ref), String(a.text ?? ''), !!a.submit);
        case 'browser_select': return await this.select(num(a.ref), String(a.option ?? ''));
        case 'browser_scroll': return await this.scroll(String(a.to || 'down'));
        case 'browser_back': return await this.back();
        case 'browser_read': return await this.read(Number(a.maxChars) || 16000);
        case 'browser_find': return await this.find(String(a.text || ''));
        default: return err(`Unknown browser tool ${tool}`);
      }
    } catch (e) {
      if (signal?.aborted || this.o.signal?.aborted || (e as { name?: string })?.name === 'AbortError') { this.stopped = 'aborted'; throw e; }
      if (e instanceof HttpError) return err(e.message);
      const msg = String((e as Error)?.message || e);
      console.warn('[browse]', tool, 'failed', msg.slice(0, 200));
      // The page went away under us (a navigation mid-read, a closed tab): read it again rather than give up.
      if (/detached|destroyed|Target closed|Session closed|navigation/i.test(msg) && this.page) {
        try { await sleep(600); return ok(await this.report(this.actionOf(tool), `Waited for the page after ${tool.replace('browser_', '')}`, false)); } catch { /* fall through */ }
      }
      if (/timeout|timed out|took longer/i.test(msg)) return err('The page took too long to respond. Try again, try another page, or write the answer from what you have.');
      return err('That could not be done on this page. Read the page again and try another way, or write the answer from what you have.');
    }
  }

  /** Close the browser (or, for a shared development Chrome, just this session's page). */
  async close(): Promise<void> {
    const b = this.browser; this.browser = null;
    if (!b) return;
    try { if (this.connected) { try { await this.page?.close(); } catch { /* gone */ } await b.disconnect(); } else await b.close(); } catch { /* already gone */ }
    this.page = null;
  }

  // ---- actions -------------------------------------------------------------------------------------------------

  private async open(raw: string): Promise<ToolOutcome> {
    let url = raw.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
    url = validateSiteUrl(url); // throws a plain HttpError for anything that is not a public website
    const page = await this.ensurePage();
    this.actions++;
    await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }), 22_000, 'opening the page');
    await this.settle(page);
    await this.guardUrl(page);
    return ok(await this.report('open', `Opened ${hostOf(url)}${pathOf(url)}`, true));
  }

  private async click(ref: number, why: string): Promise<ToolOutcome> {
    const page = this.requirePage();
    if (!ref) return err('Give the number of the control to click, from the latest page text.');
    const prep = await page.evaluate(`${CLICK_PREP_SRC}(${ref})`) as Prep;
    if (!prep.ok) return err(prep.why || 'That control cannot be clicked.');
    this.actions++;
    const label = prep.label || `[${ref}]`;
    // A link that would open a new tab is followed in this one instead: there is only ever one page the person watches.
    if (prep.tag === 'A' && prep.href && (prep.target === '_blank' || /^(mailto|tel):/i.test(prep.href))) {
      if (/^(mailto|tel):/i.test(prep.href)) return err(`"${label}" is a ${prep.href.startsWith('mailto') ? 'mail' : 'phone'} link, there is no page behind it.`);
      const abs = new URL(prep.href, page.url()).toString();
      const url = validateSiteUrl(abs);
      await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }), 22_000, 'opening the link');
      await this.settle(page); await this.guardUrl(page);
      return ok(await this.report('click', `Clicked "${cut(label, 50)}"${why ? `: ${cut(why, 60)}` : ''}`, true));
    }
    const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6_000 }).catch(() => null);
    await page.mouse.click(prep.x!, prep.y!);
    await Promise.race([nav, sleep(900)]);
    await this.settle(page);
    await this.guardUrl(page);
    return ok(await this.report('click', `Clicked "${cut(label, 50)}"${why ? `: ${cut(why, 60)}` : ''}`, true));
  }

  private async type(ref: number, text: string, submit: boolean): Promise<ToolOutcome> {
    const page = this.requirePage();
    if (!ref) return err('Give the number of the field to type into, from the latest page text.');
    if (SENSITIVE_VALUE.test(text)) return err('Ricorsa does not type card numbers or government id numbers into websites. Tell the person which field needs it so they can enter it themselves.');
    const prep = await page.evaluate(`${FIELD_PREP_SRC}(${ref})`) as Prep;
    if (prep.protectedField) return err(`Field [${ref}] is protected (a password or a similar secret). Ricorsa never fills it; tell the person what the page is asking for so they can do it themselves.`);
    if (!prep.ok) return err(prep.why || 'That field cannot be typed into.');
    if (prep.tag === 'SELECT') return this.select(ref, text);
    this.actions++;
    await page.mouse.click(prep.x!, prep.y!);
    await page.evaluate(`((ref) => { const el = document.querySelector('[data-rk-ref="' + ref + '"]'); if (!el) return; el.focus(); if (el.isContentEditable) { document.execCommand('selectAll', false, undefined); } else if (typeof el.select === 'function') el.select(); })(${ref})`);
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text.slice(0, 2000), { delay: 4 });
    let detail = `Typed "${cut(text, 40)}"`;
    if (submit) {
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8_000 }).catch(() => null);
      await page.keyboard.press('Enter');
      await Promise.race([nav, sleep(1200)]);
      detail += ' and pressed Enter';
    } else await sleep(250);
    await this.settle(page);
    await this.guardUrl(page);
    return ok(await this.report('type', detail, true));
  }

  private async select(ref: number, option: string): Promise<ToolOutcome> {
    const page = this.requirePage();
    if (!ref) return err('Give the number of the drop-down list, from the latest page text.');
    const r = await page.evaluate(`${SELECT_SRC}(${ref}, ${JSON.stringify(option)})`) as { ok: boolean; why?: string; selected?: string };
    if (!r.ok) return err(r.why || 'That option could not be chosen.');
    this.actions++;
    await sleep(400);
    await this.settle(page);
    return ok(await this.report('select', `Chose "${cut(r.selected || option, 40)}"`, true));
  }

  private async scroll(to: string): Promise<ToolOutcome> {
    const page = this.requirePage();
    const dir = ['down', 'up', 'top', 'bottom'].includes(to) ? to : 'down';
    this.actions++;
    await page.evaluate(`((to) => { const h = window.innerHeight * 0.85; if (to === 'top') window.scrollTo(0, 0); else if (to === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight); else window.scrollBy(0, to === 'up' ? -h : h); })(${JSON.stringify(dir)})`);
    await sleep(500);
    return ok(await this.report('scroll', dir === 'top' ? 'Scrolled to the top' : dir === 'bottom' ? 'Scrolled to the bottom' : `Scrolled ${dir}`, true));
  }

  private async back(): Promise<ToolOutcome> {
    const page = this.requirePage();
    this.actions++;
    await withTimeout(page.goBack({ waitUntil: 'domcontentloaded', timeout: 12_000 }), 13_000, 'going back');
    await this.settle(page);
    await this.guardUrl(page);
    return ok(await this.report('back', 'Went back', true));
  }

  private async read(maxChars: number): Promise<ToolOutcome> {
    const page = this.requirePage();
    const snap = await this.snapshot(page, { noRefs: true, fromTop: true, maxChars: Math.min(Math.max(2000, maxChars), 24_000) });
    await this.step('read', 'Read the page', snap, false);
    return ok(`${this.header(snap)}\n\n${snap.text}${snap.more ? `\n\n(${snap.more.toLocaleString('en-US')} more characters were not included; ask for more with maxChars, or use browser_find.)` : ''}`);
  }

  private async find(text: string): Promise<ToolOutcome> {
    const page = this.requirePage();
    if (!text.trim()) return err('Give the text to look for.');
    const r = await page.evaluate(`${FIND_SRC}(${JSON.stringify(text)}, 8)`) as { matches: Array<{ text: string; refs: string[] }>; total: number };
    const snap = await this.snapshot(page, { maxChars: 1 });
    await this.step('find', `Looked for "${cut(text, 40)}"`, snap, false);
    if (!r.total) return ok(`${this.header(snap)}\n\nNothing on this page matches "${cut(text, 60)}". It may be further down (scroll), behind a control, or on another page.`);
    return ok(`${this.header(snap)}\n\n${r.total} match${r.total === 1 ? '' : 'es'} for "${cut(text, 60)}"${r.total > r.matches.length ? ` (first ${r.matches.length} shown)` : ''}:\n` + r.matches.map((m, i) => `${i + 1}. …${m.text}…${m.refs.length ? `\n   controls here: ${m.refs.join(' ')}` : ''}`).join('\n'));
  }

  // ---- plumbing -------------------------------------------------------------------------------------------------

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    if (this.launchError) throw new Error(this.launchError);
    if (!this.startedAt) this.startedAt = Date.now();
    try {
      const ws = process.env.BROWSER_WS_ENDPOINT;
      const b = binding();
      if (b) this.browser = await withTimeout(puppeteer.launch(b), 20_000, 'starting the browser');
      else if (ws && process.env.NODE_ENV !== 'production') { this.browser = await withTimeout(puppeteer.connect({ browserWSEndpoint: ws }), 10_000, 'starting the browser'); this.connected = true; }
      else throw new Error('no browser available');
    } catch (e) {
      console.error('[browse] launch failed', String((e as Error)?.message || e).slice(0, 200));
      this.launchError = "Ricorsa's browser could not be started right now. Tell the person the browser is busy and to try again in a minute, then answer from the sources you have.";
      throw new Error(this.launchError);
    }
    const browser = this.browser!;
    const page = await browser.newPage();
    this.page = page;
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: SHOT_SCALE });
    try { await page.setUserAgent(USER_AGENT); } catch { /* not all builds allow it */ }
    page.on('dialog', d => { void d.dismiss().catch(() => {}); });
    // A window a site opens is folded back into the one page the person watches.
    browser.on('targetcreated', (t) => {
      void (async () => {
        try {
          if (t.type() !== 'page') return;
          const p = await t.page(); const url = t.url();
          if (p && p !== this.page) await p.close().catch(() => {});
          if (url && /^https?:/i.test(url) && this.page) { try { validateSiteUrl(url); await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch { /* left where it was */ } }
        } catch { /* best effort */ }
      })();
    });
    return page;
  }

  private requirePage(): Page {
    if (!this.page) throw new HttpError(400, 'No page is open yet. Use browser_open with an address first.');
    return this.page;
  }

  /** After a navigation the browser did on its own (a redirect, a click), the page must still be a public website. */
  private async guardUrl(page: Page): Promise<void> {
    const url = page.url();
    if (!url || url === 'about:blank' || url.startsWith('chrome-error://')) return;
    try { validateSiteUrl(url); }
    catch {
      console.warn('[browse] left the public web', url.slice(0, 120));
      try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8_000 }); } catch { /* stay */ }
      throw new HttpError(400, 'That led to an address that is not a public website, so Ricorsa went back.');
    }
  }

  private async settle(page: Page): Promise<void> {
    try { await page.waitForNetworkIdle({ idleTime: 400, timeout: 3_500 }); } catch { /* busy pages never go idle; carry on */ }
    await sleep(200);
  }

  private async snapshot(page: Page, opts: { maxChars?: number; noRefs?: boolean; fromTop?: boolean } = {}): Promise<Snapshot> {
    return await withTimeout(page.evaluate(`${SNAPSHOT_SRC}(${JSON.stringify(opts)})`) as Promise<Snapshot>, 12_000, 'reading the page');
  }

  /** Read the page, store a screenshot, record the step, and hand the model the page text under a header. */
  private async report(action: BrowseStep['action'], detail: string, shot: boolean): Promise<string> {
    const page = this.requirePage();
    const snap = await this.snapshot(page, { maxChars: 7000 });
    await this.step(action, detail, snap, shot);
    const tail = snap.more ? `\n\n(${snap.more.toLocaleString('en-US')} more characters below; browser_scroll down to read on, or browser_find a phrase.)` : snap.scroll.y + snap.scroll.viewport < snap.scroll.height - 40 ? '\n\n(The page continues below the current position; browser_scroll down to see more.)' : '';
    return `${this.header(snap)}\n\n${snap.text || '(The page shows no readable text yet. It may still be loading, or it may draw everything as images.)'}${tail}`;
  }

  private header(snap: Snapshot): string {
    const n = this.numberPage(snap);
    const left = Math.max(0, this.o.maxActions - this.actions);
    const lines = [`Step ${this.steps.length} · ${this.actions} action${this.actions === 1 ? '' : 's'} used, ${left} left for this answer · Page: "${snap.title}" ${snap.url}${n ? ` · cite this page as [${n}]` : ''}`];
    if (snap.dialog) lines.push(`A dialog is open on the page: "${snap.dialog}"`);
    if (snap.protected) lines.push(`${snap.protected} protected field${snap.protected === 1 ? '' : 's'} on this page (password or similar): Ricorsa will not fill ${snap.protected === 1 ? 'it' : 'them'}. If the task needs ${snap.protected === 1 ? 'it' : 'them'}, stop and tell the person what to enter.`);
    if (snap.scroll.height > snap.scroll.viewport + 40) lines.push(`Position: ${snap.scroll.y.toLocaleString('en-US')} of ${snap.scroll.height.toLocaleString('en-US')} px${snap.skipped ? ` (${snap.skipped.toLocaleString('en-US')} characters of text above the current position)` : ''}.`);
    return lines.join('\n');
  }

  private numberPage(snap: Snapshot): number | null {
    if (!this.o.onPage || !/^https?:/i.test(snap.url)) return null;
    const key = snap.url.replace(/#.*$/, '');
    let n = this.pageNumbers.get(key);
    if (!n) { n = this.o.onPage({ url: key, title: snap.title }); this.pageNumbers.set(key, n); }
    return n;
  }

  private async step(action: BrowseStep['action'], detail: string, snap: Snapshot, shot: boolean): Promise<void> {
    if (/^https?:/i.test(snap.url)) this.seen.add(snap.url.replace(/#.*$/, ''));
    const n = this.steps.length + 1;
    let stored = false;
    if (shot && this.page) {
      try {
        const bytes = await withTimeout(this.page.screenshot({ type: 'jpeg', quality: 58 }), 8_000, 'screenshot') as Uint8Array;
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        stored = await putFile(shotKey(this.o.userId, this.o.turnId, n), buf, 'image/jpeg', `browser step ${n}`);
        if (stored) this.shots++;
      } catch (e) { console.warn('[browse] screenshot failed', String((e as Error)?.message || e).slice(0, 120)); }
    }
    const rec: BrowseStep = { n, action, detail: cut(detail, 140), url: snap.url, title: cut(snap.title, 120), shot: stored, at: Date.now() };
    this.steps.push(rec);
    try { this.o.onStep?.(rec, this.record()); } catch (e) { console.warn('[browse] onStep failed', e); }
  }

  private actionOf(tool: string): BrowseStep['action'] {
    const a = tool.replace('browser_', '');
    return (['open', 'click', 'type', 'select', 'scroll', 'back', 'read', 'find'] as BrowseStep['action'][]).find(x => x === a) || 'read';
  }
}

/**
 * What the model is told when the person has asked Ricorsa to open a site. Plain rules, in the order they matter:
 * work the page for the person, keep them informed, never cross into their credentials or their money.
 */
export function browserGuide(o: { maxActions: number }): string {
  return `The person asked you to open a website and work it for them in Ricorsa's browser while they watch. You have the browser_* tools. How to use them:
- Start with browser_open on the address in the question (add https:// if it is missing). If no address is given, open the most relevant page from the sources, or a site you are sure of. Never make up an address.
- Read the page text you get back. Every link, button and field is numbered [n|...]; act on it by number with browser_click, browser_type and browser_select. One action per call; read the result before the next. Use browser_scroll to read further down, browser_find to locate a phrase, browser_read for a whole article.
- Do what was asked, no more: find the information, fill in the form the person described with the details they gave, follow the flow up to the point where it would commit. Stop before anything that sends, submits an order, pays, deletes or signs up, unless the person explicitly asked for that exact step, and say what the next press would do.
- Never sign in, create an account, or fill a field that takes a password, a code, a card number or a government id. Those fields are marked protected and the browser refuses them; when a page needs one, stop and tell the person plainly what the page is asking for so they can do it themselves.
- Cookie and consent banners: choose reject, decline or "necessary only" when offered; close them otherwise. Do not accept marketing or tracking on the person's behalf.
- You have ${o.maxActions} actions for this answer. If the site blocks you, asks for a sign-in, or the task needs more than that, stop and report what you found and what remains.
- Every page you open is numbered as a source ("cite this page as [n]"); cite it where you use what it says.
- In the answer, say plainly what you did and what you found, in the person's terms (the site's name, the page, the result). Never mention tools, tool names, screenshots, or how the browser works. Do not paste the page text back; report what matters.`;
}

/** Where a step's screenshot lives in object storage. */
export function shotKey(userId: string, turnId: string, n: number): string { return `browse/${userId}/${turnId}/${n}.jpg`; }
/** The prefix under which an account's screenshots live (all of them, or one turn's). */
export function shotPrefix(userId: string, turnId?: string): string { return turnId ? `browse/${userId}/${turnId}/` : `browse/${userId}/`; }

/** Remove the screenshots kept for these turns (a deleted thread) or for a whole account. */
export async function deleteBrowseShots(userId: string, turns?: Array<{ id: string; browser?: BrowseRecord }>): Promise<void> {
  if (!turns) { await deletePrefix(shotPrefix(userId)); return; }
  for (const t of turns) if (t.browser && t.browser.steps.some(s => s.shot)) await deletePrefix(shotPrefix(userId, t.id));
}

function ok(text: string): ToolOutcome { return { text, isError: false }; }
function err(text: string): ToolOutcome { return { text, isError: true }; }
function num(v: unknown): number { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; }
function cut(s: string, n: number): string { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hostOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function pathOf(url: string): string { try { const u = new URL(url); return u.pathname === '/' && !u.search ? '' : cut(u.pathname + u.search, 50); } catch { return ''; } }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms); p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); });
}
