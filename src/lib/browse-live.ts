/**
 * Taking over Ricorsa's browser. After a browsing answer the page stays open for a few minutes (`KEEP_ALIVE_MS`),
 * and the person can take it over from the pane: they see a fresh picture of the page after every move and their
 * clicks, typing, keys and scrolling go to the page itself, so they can sign in, pass a step the model must not do,
 * or simply look around. When they are done they hand the page back (a follow-up turn carries on from it) or close it.
 *
 * There is no live video: each move is one request that reaches the browser again by its session id, acts, takes a
 * picture and lets go, so the browser is never held between moves and the request can run anywhere. What the person
 * types travels through this server to the page and nowhere else: it is not logged, not stored, and not shown to the
 * model. A minute of the person's control counts as one browser action against the month.
 *
 * A sign-in the person makes while in control can be kept: the site's cookies are sealed into the account per site
 * (`browse_sites`) and put back the next time Ricorsa opens that site for them. Only when they say so, and they can
 * sign out from the Account page at any time.
 */
import { and, eq, gt, ne } from 'drizzle-orm';
import type { Browser, Page } from '@cloudflare/puppeteer';
import { db, schema } from './db';
import { HttpError, uid } from './http';
import { sealJson } from './secretbox';
import { putFile } from './storage';
import { validateSiteUrl } from './sites';
import { getThreadOwned, saveTurns } from './threads';
import { recordUsage, assertBrowseQuota, chargeGas } from './usage';
import { GAS } from './plans';
import { connectLive, screenshotJpeg, registrableDomain, shotKey, KEEP_ALIVE_MS, VIEWPORT, type StoredCookie } from './browse';
import type { CurrentUser } from './session';
import type { BrowseRecord, BrowseStep } from './db/schema';

/** The most a person may hold a page in one take-over (their moves keep it alive up to this). */
export const TAKEOVER_MAX_MS = 30 * 60_000;
const KEYS = new Set(['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Space']);

export type LiveAction =
  | { type: 'click'; x: number; y: number; double?: boolean }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string; times?: number }
  | { type: 'scroll'; x: number; y: number; dy: number }
  | { type: 'nav'; url: string }
  | { type: 'back' } | { type: 'forward' } | { type: 'reload' } | { type: 'select_all' };

/** What the gauge hears when a move crosses into a new minute: what it cost and what is left (null: nothing new to pay). */
export type GasNote = { cost: number; remaining: number | null; unlimited: boolean } | null;
/** What the person sees after a move: the picture, where the page is, whether a password field was typed into, and the gas. */
export type Frame = { image: string; url: string; title: string; width: number; height: number; at: number; signInSeen: boolean; minutes: number; until: number; gas?: GasNote };

/** Minutes of control are gas, one each, charged as they pass, so a tab closed without Done still pays its way. */
async function payMinutes(user: CurrentUser, owed: number): Promise<GasNote> {
  if (owed <= 0) return null;
  try { await recordUsage(user.id, { browserActions: owed }); } catch (e) { console.warn('[browse] minutes not counted', e); }
  try { const r = await chargeGas(user, GAS.takeoverMinute * owed); return { cost: r.cost, remaining: r.unlimited ? null : r.remaining, unlimited: r.unlimited }; }
  catch (e) { console.warn('[gas] minutes not charged', String((e as Error)?.message || e).slice(0, 160)); return null; }
}

type Row = typeof schema.browseSessions.$inferSelect;

async function rowFor(user: CurrentUser, turnId: string): Promise<Row> {
  const rows = await db().select().from(schema.browseSessions).where(and(eq(schema.browseSessions.turnId, turnId), eq(schema.browseSessions.userId, user.id))).limit(1);
  const row = rows[0];
  if (!row || row.mode === 'closed') throw new HttpError(410, 'That page has closed. Ask Ricorsa to open the site again.', 'browser_gone');
  if (row.expiresAt < Date.now()) { await markClosed(turnId); throw new HttpError(410, 'That page has closed. Ask Ricorsa to open the site again.', 'browser_gone'); }
  return row;
}
async function markClosed(turnId: string): Promise<void> {
  await db().update(schema.browseSessions).set({ mode: 'closed', updatedAt: Date.now() }).where(eq(schema.browseSessions.turnId, turnId));
}

/** Reach the page again; a page that is gone closes the row with a plain message. */
async function reach(row: Row): Promise<{ browser: Browser; page: Page; shared: boolean }> {
  try { return await connectLive(row.sessionId); }
  catch (e) {
    const msg = String((e as Error)?.message || e);
    console.warn('[browse] live page unreachable', row.turnId, msg.slice(0, 160));
    if (/in use|still be in use|not ready/i.test(msg)) throw new HttpError(409, 'The page is busy for a moment. Try again.', 'browser_busy');
    await markClosed(row.turnId);
    throw new HttpError(410, 'That page has closed. Ask Ricorsa to open the site again.', 'browser_gone');
  }
}
async function letGo(live: { browser: Browser; page: Page; shared: boolean }): Promise<void> {
  try { await live.browser.disconnect(); } catch { /* already gone */ }
}

async function frameOf(page: Page, row: Row, signInSeen: boolean): Promise<Frame> {
  const bytes = await screenshotJpeg(page);
  let title = ''; try { title = cut(await withTimeout(page.title(), 3_000, 'title'), 120); } catch { /* keep empty */ }
  const minutes = row.personStartedAt ? Math.max(1, Math.ceil((Date.now() - row.personStartedAt) / 60_000)) : 0;
  return { image: 'data:image/jpeg;base64,' + toBase64(bytes), url: page.url(), title, width: VIEWPORT.width, height: VIEWPORT.height, at: Date.now(), signInSeen, minutes, until: Date.now() + KEEP_ALIVE_MS };
}

/** The person takes the page. The browser is reached to prove it is still there, and the first picture comes back. */
export async function startTakeOver(user: CurrentUser, turnId: string): Promise<Frame> {
  const row = await rowFor(user, turnId);
  await assertBrowseQuota(user);
  const live = await reach(row);
  try {
    const now = Date.now();
    const started = row.mode === 'person' && row.personStartedAt ? row.personStartedAt : now;
    await db().update(schema.browseSessions).set({ mode: 'person', personStartedAt: started, personLastAt: now, expiresAt: now + KEEP_ALIVE_MS, updatedAt: now, hosts: addHost(row.hosts, live.page.url()) }).where(eq(schema.browseSessions.turnId, turnId));
    if (row.mode !== 'person') await appendStep(user.id, row.threadId, turnId, { action: 'person', detail: 'You took over the page', url: live.page.url(), title: '', shot: false });
    return await frameOf(live.page, { ...row, personStartedAt: started }, row.signInSeen);
  } finally { await letGo(live); }
}

/** A picture of the page as it is now, without touching it. */
export async function takeOverFrame(user: CurrentUser, turnId: string): Promise<Frame> {
  const row = await rowFor(user, turnId);
  const live = await reach(row);
  try { return await frameOf(live.page, row, row.signInSeen); } finally { await letGo(live); }
}

/** One move of the person's: a click, typing, a key, a scroll, an address, back, forward or reload. */
export async function takeOverAct(user: CurrentUser, turnId: string, action: LiveAction): Promise<Frame> {
  const row = await rowFor(user, turnId);
  if (row.mode !== 'person') throw new HttpError(409, 'Take over the page first.', 'not_in_control');
  if (row.personStartedAt && Date.now() - row.personStartedAt > TAKEOVER_MAX_MS) throw new HttpError(409, 'This take-over has run for half an hour. Hand the page back or close it, then take over again if you need to.', 'takeover_long');
  const live = await reach(row);
  let signInSeen = row.signInSeen;
  try {
    const page = live.page;
    const px = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * VIEWPORT.width);
    const py = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * VIEWPORT.height);
    const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => null);
    switch (action.type) {
      case 'click': await page.mouse.click(px(action.x), py(action.y), { clickCount: action.double ? 2 : 1 }); break;
      case 'type': {
        // Typing into a password field is the cue that a sign-in is happening; the text itself goes to the page only.
        try { const t = await page.evaluate('(document.activeElement && document.activeElement.type) || ""') as string; if (t === 'password') signInSeen = true; } catch { /* unknown field */ }
        await page.keyboard.type(String(action.text).slice(0, 2000), { delay: 2 });
        break;
      }
      case 'key': {
        const key = String(action.key);
        if (!KEYS.has(key)) throw new HttpError(400, 'That key is not supported here.', 'bad_key');
        const times = Math.min(20, Math.max(1, Math.floor(Number(action.times) || 1)));
        for (let i = 0; i < times; i++) await page.keyboard.press(key === 'Space' ? ' ' : (key as 'Enter'));
        break;
      }
      case 'select_all': await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); break;
      case 'scroll': await page.mouse.move(px(action.x), py(action.y)); await page.mouse.wheel({ deltaY: Math.max(-1200, Math.min(1200, Number(action.dy) || 0)) }); break;
      case 'nav': { const url = validateSiteUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(action.url) ? action.url : 'https://' + action.url); await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }), 22_000, 'opening the page'); break; }
      case 'back': await withTimeout(page.goBack({ waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null), 13_000, 'going back'); break;
      case 'forward': await withTimeout(page.goForward({ waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null), 13_000, 'going forward'); break;
      case 'reload': await withTimeout(page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }), 22_000, 'reloading'); break;
    }
    if (action.type === 'click' || action.type === 'key') await Promise.race([nav, sleep(600)]); else await sleep(250);
    try { await page.waitForNetworkIdle({ idleTime: 300, timeout: 1_500 }); } catch { /* busy pages never go idle */ }
    // The page must still be on the public web after whatever the move led to.
    const url = page.url();
    if (url && url !== 'about:blank' && !url.startsWith('chrome-error://')) { try { validateSiteUrl(url); } catch { try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8_000 }); } catch { /* stay */ } } }
    const now = Date.now();
    // A minute of control is one gas: the minutes are charged as they pass.
    const minutes = row.personStartedAt ? Math.max(1, Math.ceil((now - row.personStartedAt) / 60_000)) : 1;
    const gas = await payMinutes(user, minutes - row.personMinutes);
    await db().update(schema.browseSessions).set({ personLastAt: now, personMinutes: Math.max(row.personMinutes, minutes), signInSeen, expiresAt: now + KEEP_ALIVE_MS, updatedAt: now, url: page.url(), hosts: addHost(row.hosts, page.url()) }).where(eq(schema.browseSessions.turnId, turnId));
    return { ...(await frameOf(page, row, signInSeen)), gas };
  } finally { await letGo(live); }
}

/**
 * The person is done: hand the page back for a follow-up (it stays open) or close it. With `remember`, the sign-ins
 * for those sites (registrable domains the person visited while in control) are sealed into the account.
 */
export async function endTakeOver(user: CurrentUser, turnId: string, how: 'handback' | 'close', remember: string[]): Promise<{ minutes: number; remembered: string[]; url: string; title: string; until: number | null; gas: GasNote }> {
  const row = await rowFor(user, turnId);
  const live = await reach(row);
  const remembered: string[] = [];
  let url = '', title = '';
  try {
    const page = live.page;
    url = page.url(); try { title = cut(await withTimeout(page.title(), 3_000, 'title'), 120); } catch { /* keep empty */ }
    const allowed = new Set((row.hosts || []).map(registrableDomain));
    const wanted = remember.map(h => registrableDomain(h)).filter(h => h && allowed.has(h));
    if (wanted.length) {
      const cookies = await allCookies(page);
      for (const host of wanted) {
        const mine = cookies.filter(c => { const d = c.domain.replace(/^\./, ''); return d === host || d.endsWith('.' + host); });
        if (!mine.length) continue;
        const sealed = await sealJson(mine);
        const existing = await db().select({ id: schema.browseSites.id }).from(schema.browseSites).where(and(eq(schema.browseSites.userId, user.id), eq(schema.browseSites.host, host))).limit(1);
        if (existing[0]) await db().update(schema.browseSites).set({ cookies: sealed, cookieCount: mine.length, savedAt: Date.now(), label: title || null }).where(eq(schema.browseSites.id, existing[0].id));
        else await db().insert(schema.browseSites).values({ id: uid(), userId: user.id, host, label: title || null, cookies: sealed, cookieCount: mine.length, savedAt: Date.now() });
        remembered.push(host);
      }
    }
    const minutes = row.personStartedAt ? Math.max(1, Math.ceil((Date.now() - row.personStartedAt) / 60_000)) : 0;
    const gas = await payMinutes(user, minutes - row.personMinutes);
    // Where the person left things, kept with the answer: one picture, one line.
    let shot = false;
    try { const bytes = await screenshotJpeg(page); const n = await nextStepNumber(user.id, row.threadId, turnId); shot = await putFile(shotKey(user.id, turnId, n), toArrayBuffer(bytes), 'image/jpeg', `browser step ${n}`); } catch { /* the line still goes in */ }
    await appendStep(user.id, row.threadId, turnId, { action: how === 'handback' ? 'handback' : 'person', detail: how === 'handback' ? `You handed the page back after ${minutes} minute${minutes === 1 ? '' : 's'}` : `You closed the page after ${minutes} minute${minutes === 1 ? '' : 's'}`, url, title, shot }, how === 'close' ? null : Date.now() + KEEP_ALIVE_MS);
    const now = Date.now();
    if (how === 'close') {
      await db().update(schema.browseSessions).set({ mode: 'closed', personMinutes: Math.max(row.personMinutes, minutes), updatedAt: now, url, title }).where(eq(schema.browseSessions.turnId, turnId));
      if (live.shared) { try { await page.close(); } catch { /* gone */ } } else { try { await live.browser.close(); } catch { /* gone */ } }
      return { minutes, remembered, url, title, until: null, gas };
    }
    await db().update(schema.browseSessions).set({ mode: 'model', personMinutes: Math.max(row.personMinutes, minutes), expiresAt: now + KEEP_ALIVE_MS, updatedAt: now, url, title }).where(eq(schema.browseSessions.turnId, turnId));
    return { minutes, remembered, url, title, until: now + KEEP_ALIVE_MS, gas };
  } finally { if (how !== 'close') await letGo(live); }
}

/** A page a follow-up may carry on from: the row for that turn, if the model has it and it is still open. */
export async function resumableSession(userId: string, turnId: string): Promise<Row | null> {
  const rows = await db().select().from(schema.browseSessions).where(and(eq(schema.browseSessions.turnId, turnId), eq(schema.browseSessions.userId, userId), eq(schema.browseSessions.mode, 'model'), gt(schema.browseSessions.expiresAt, Date.now()))).limit(1);
  return rows[0] || null;
}

/** Record a page left open after an answer, replacing the row of the turn it carried on from. */
export async function registerLiveSession(o: { userId: string; threadId: string; turnId: string; sessionId: string; url: string; title: string; replaces?: string | null }): Promise<number> {
  const now = Date.now(); const until = now + KEEP_ALIVE_MS;
  if (o.replaces && o.replaces !== o.turnId) await db().delete(schema.browseSessions).where(and(eq(schema.browseSessions.turnId, o.replaces), eq(schema.browseSessions.userId, o.userId)));
  await db().insert(schema.browseSessions).values({ turnId: o.turnId, userId: o.userId, threadId: o.threadId, sessionId: o.sessionId, mode: 'model', url: o.url, title: o.title, hosts: [hostOf(o.url)].filter(Boolean), signInSeen: false, personMinutes: 0, expiresAt: until, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: schema.browseSessions.turnId, set: { sessionId: o.sessionId, mode: 'model', url: o.url, title: o.title, expiresAt: until, updatedAt: now } });
  return until;
}

/**
 * One open page per account: before a new browsing answer starts its own browser, any other page still open is closed
 * (a shared development Chrome only loses that page). Best effort; a page that cannot be reached is simply forgotten.
 */
export async function closeOtherSessions(userId: string, exceptTurnId?: string | null): Promise<void> {
  const rows = await db().select().from(schema.browseSessions).where(and(eq(schema.browseSessions.userId, userId), ne(schema.browseSessions.mode, 'closed'), gt(schema.browseSessions.expiresAt, Date.now())));
  for (const row of rows) {
    if (exceptTurnId && row.turnId === exceptTurnId) continue;
    try { const live = await connectLive(row.sessionId); if (live.shared) { try { await live.page.close(); } catch { /* gone */ } await live.browser.disconnect(); } else await live.browser.close(); } catch { /* already gone */ }
    await markClosed(row.turnId);
  }
}

/** The sites an account keeps sign-ins for, for the Account page and the guide. */
export async function rememberedSites(userId: string): Promise<Array<{ id: string; host: string; label: string | null; cookieCount: number; savedAt: number; lastUsedAt: number | null }>> {
  const rows = await db().select({ id: schema.browseSites.id, host: schema.browseSites.host, label: schema.browseSites.label, cookieCount: schema.browseSites.cookieCount, savedAt: schema.browseSites.savedAt, lastUsedAt: schema.browseSites.lastUsedAt }).from(schema.browseSites).where(eq(schema.browseSites.userId, userId));
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}
/** Sign out of a site: the kept cookies are deleted; the site itself is untouched. */
export async function forgetSite(userId: string, id: string): Promise<boolean> {
  const r = await db().delete(schema.browseSites).where(and(eq(schema.browseSites.id, id), eq(schema.browseSites.userId, userId))).returning({ id: schema.browseSites.id });
  return r.length > 0;
}

// ---- helpers ------------------------------------------------------------------------------------------------------

async function allCookies(page: Page): Promise<StoredCookie[]> {
  const cdp = await page.target().createCDPSession();
  try {
    const r = await withTimeout(cdp.send('Network.getAllCookies') as Promise<{ cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite?: string }> }>, 5_000, 'reading cookies');
    return (r.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
  } finally { try { await cdp.detach(); } catch { /* gone */ } }
}

/** Add a step to the turn's browser record (the thread is the record; the pane reads it back). */
async function appendStep(userId: string, threadId: string, turnId: string, step: Omit<BrowseStep, 'n' | 'at'>, until?: number | null): Promise<void> {
  try {
    const thread = await getThreadOwned(userId, threadId);
    const turns = [...thread.turns];
    const i = turns.findIndex(t => t.id === turnId); if (i < 0) return;
    const turn = { ...turns[i] };
    const rec: BrowseRecord = turn.browser ? { ...turn.browser, steps: [...turn.browser.steps] } : { steps: [], actions: 0, pages: 0 };
    rec.steps.push({ ...step, n: rec.steps.length + 1, at: Date.now() });
    if (until === null) delete rec.live; else if (typeof until === 'number') rec.live = { until };
    turn.browser = rec; turns[i] = turn;
    await saveTurns(thread, turns);
  } catch (e) { console.warn('[browse] step not recorded', String((e as Error)?.message || e).slice(0, 120)); }
}
async function nextStepNumber(userId: string, threadId: string, turnId: string): Promise<number> {
  try { const thread = await getThreadOwned(userId, threadId); const t = thread.turns.find(x => x.id === turnId); return ((t?.browser?.steps.length) || 0) + 1; } catch { return 1; }
}
function addHost(hosts: string[] | null, url: string): string[] {
  const h = hostOf(url); const list = [...(hosts || [])];
  if (h && !list.includes(h)) list.push(h);
  return list.slice(-20);
}
function hostOf(url: string): string { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname : ''; } catch { return ''; } }
function toBase64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return btoa(s); }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }
function cut(s: string, n: number): string { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms); p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); });
}
