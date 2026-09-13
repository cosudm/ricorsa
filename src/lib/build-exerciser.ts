/**
 * The exerciser: a script run inside a built app, in a real browser, to find out whether it works.
 * It presses every visible button, link, tab and menu item it can find (new screens reveal new
 * controls, so it keeps going until nothing new appears), and after each press checks whether
 * anything happened at all: a DOM change, a stored value, a hash change, focus moving, a dialog,
 * a download, a copy to the clipboard, a form submission, a new window. A control that changes
 * nothing is reported as dead. Screens that the navigation names must become visible. Errors
 * thrown at any point are recorded with the control that caused them.
 *
 * `EXERCISER_SRC` is plain JavaScript (no bundler), evaluated with `page.evaluate` by the Browser Run
 * step (src/lib/build-run.ts) and by the local Playwright test. `INSTALL_SRC` runs before the app's
 * own scripts so nothing is missed.
 */
export type ExerciseReport = {
  clicked: number;
  controls: number;
  screensSeen: string[];
  errors: string[];       // "error while loading: ..." / "clicking \"Save\" threw: ..."
  dead: string[];         // "the button \"Export\" does nothing when clicked"
  navMissing: string[];   // "\"Reports\" points at screen \"reports\" but nothing with that name appears"
  dialogs: string[];      // alert/confirm/prompt calls
  external: string[];     // links that would leave the app
  blank: boolean;         // nothing visible after load
  overflow: boolean;      // horizontal overflow at the viewport used
  timedOut: boolean;
};

/** Installed before any app script runs: records errors, dialogs, downloads, clipboard writes, window.open and form submits. */
export const INSTALL_SRC = `(() => {
  const R = window.__ricorsaRun = { errors: [], dialogs: [], events: 0, external: [] };
  const push = (arr, s) => { if (arr.length < 40) arr.push(String(s).slice(0, 240)); };
  window.addEventListener('error', (e) => { push(R.errors, (e && e.message) || 'error'); });
  window.addEventListener('unhandledrejection', (e) => { const r = e && e.reason; push(R.errors, 'unhandled promise rejection: ' + ((r && (r.message || r.toString())) || 'rejection')); });
  const dlg = (kind, ret) => function (m) { push(R.dialogs, kind + '(' + String(m == null ? '' : m).slice(0, 80) + ')'); R.events++; return ret; };
  window.alert = dlg('alert', undefined); window.confirm = dlg('confirm', true); window.prompt = dlg('prompt', '');
  window.print = () => { R.events++; };
  window.open = () => { R.events++; return null; };
  document.addEventListener('submit', () => { R.events++; }, true);
  document.addEventListener('DOMContentLoaded', () => { try { const obs = new MutationObserver(() => { R.events++; }); obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {} });
  try {
    const orig = HTMLElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { R.events++; return; } return orig.apply(this, arguments); };
  } catch (e) {}
  try { if (navigator.clipboard) { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { R.events++; return w(t).catch(() => {}); }; } } catch (e) {}
  try { const ls = window.localStorage; const set = Storage.prototype.setItem; Storage.prototype.setItem = function () { R.events++; return set.apply(this, arguments); }; void ls; } catch (e) {}
})();`;

/** Run after load: walks the app and returns an ExerciseReport (as JSON-compatible object). */
export const EXERCISER_SRC = `(async (opts) => {
  const budgetMs = (opts && opts.budgetMs) || 25000;
  const maxClicks = (opts && opts.maxClicks) || 160;
  const started = Date.now();
  const R = window.__ricorsaRun || (window.__ricorsaRun = { errors: [], dialogs: [], events: 0, external: [] });
  const report = { clicked: 0, controls: 0, screensSeen: [], errors: [], dead: [], navMissing: [], dialogs: [], external: [], blank: false, overflow: false, timedOut: false };
  const text = (el) => ((el.getAttribute('aria-label') || el.textContent || el.value || el.title || '').replace(/\\s+/g, ' ').trim().slice(0, 40)) || (el.id ? '#' + el.id : el.tagName.toLowerCase());
  const visible = (el) => { if (!el || !el.isConnected) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; let p = el.parentElement; while (p) { const pc = getComputedStyle(p); if (pc.display === 'none' || pc.visibility === 'hidden') return false; p = p.parentElement; } return true; };
  const enabled = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const keyOf = (el) => { const path = []; let n = el; while (n && n !== document.body && path.length < 6) { const p = n.parentElement; const i = p ? Array.prototype.indexOf.call(p.children, n) : 0; path.unshift(n.tagName + ':' + i); n = p; } return path.join('/') + '|' + text(el); };
  const isSubmit = (el) => el.tagName === 'BUTTON' ? (el.getAttribute('type') || 'submit').toLowerCase() === 'submit' && !!el.closest('form') : el.tagName === 'INPUT' && (el.type === 'submit');
  const destructive = (el) => /\\b(delete|remove|clear|reset|wipe|erase|sign out|log out|discard)\\b/i.test(text(el));
  const SEL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="button"], summary';
  const controls = () => Array.from(document.querySelectorAll(SEL)).filter(el => visible(el) && enabled(el) && !el.closest('[data-ricorsa-ignore]'));
  const screenName = (el) => { for (const a of ['data-screen', 'data-view', 'data-tab', 'data-page', 'data-panel', 'data-section', 'data-target', 'aria-controls']) { const v = el.getAttribute(a); if (v) return v.replace(/^#/, ''); } const h = el.getAttribute('href'); if (h && /^#[^\\s]+$/.test(h) && h.length > 1) return h.slice(1); return null; };
  const screenVisible = (name) => { if (!name) return true; const cands = Array.from(document.querySelectorAll('#' + CSS.escape(name) + ', [data-screen="' + name + '"], [data-view="' + name + '"], [data-tab="' + name + '"], [data-page="' + name + '"], [data-panel="' + name + '"], [data-section="' + name + '"], [id$="-' + name + '"], [id^="' + name + '-"]')).filter(el => !el.matches(SEL)); return cands.length === 0 ? null : cands.some(visible); };
  const bodyText = () => (document.body ? document.body.innerText || '' : '').replace(/\\s+/g, ' ').trim();
  // Load checks
  report.errors.push(...R.errors.map(e => 'error while loading: ' + e)); R.errors.length = 0;
  report.blank = bodyText().length < 20 && !document.querySelector('canvas, svg, img, input, button');
  report.overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  const seen = new Set(); const seenScreens = new Set();
  let clicks = 0; let guard = 0;
  while (clicks < maxClicks && guard++ < 400) {
    if (Date.now() - started > budgetMs) { report.timedOut = true; break; }
    const list = controls();
    report.controls = Math.max(report.controls, list.length);
    let fresh = list.filter(el => !seen.has(keyOf(el)));
    if (!fresh.length) {
      // Everything on this screen has been pressed: go back through the navigation to reach controls on the other screens.
      let found = false;
      for (const nav of Array.from(document.querySelectorAll(SEL)).filter(el => visible(el) && enabled(el) && screenName(el))) {
        try { nav.click(); } catch (e) {}
        await sleep(100);
        const more = controls().filter(el => !seen.has(keyOf(el)));
        if (more.length) { fresh = more; found = true; break; }
      }
      if (!found) break;
    }
    fresh.sort((a, b) => (destructive(a) ? 1 : 0) - (destructive(b) ? 1 : 0));
    const el = fresh[0]; const key = keyOf(el); seen.add(key);
    const label = text(el);
    const href = el.getAttribute('href') || '';
    if (el.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(href) && !el.hasAttribute('download')) { if (report.external.length < 12) report.external.push(label + ' -> ' + href.slice(0, 80)); continue; }
    if (el.tagName === 'A' && href && !href.startsWith('#') && !href.startsWith('javascript:') && !el.hasAttribute('download')) { if (report.external.length < 12) report.external.push(label + ' -> ' + href.slice(0, 80)); continue; }
    const name = screenName(el);
    const before = { events: R.events, hash: location.hash, focus: document.activeElement, scroll: window.scrollY + ':' + (document.scrollingElement ? document.scrollingElement.scrollTop : 0), text: bodyText(), errors: R.errors.length, dialogs: R.dialogs.length };
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
    try { el.click(); } catch (e) { report.errors.push('clicking "' + label + '" threw: ' + ((e && e.message) || e)); continue; }
    clicks++; report.clicked = clicks;
    await sleep(120);
    const changedNow = () => R.events > before.events || location.hash !== before.hash || document.activeElement !== before.focus || bodyText() !== before.text || R.dialogs.length > before.dialogs || (window.scrollY + ':' + (document.scrollingElement ? document.scrollingElement.scrollTop : 0)) !== before.scroll;
    let changed = changedNow();
    if (!changed) { await sleep(450); changed = changedNow(); }
    let threw = false;
    if (R.errors.length > before.errors) { threw = true; for (const e of R.errors.slice(before.errors)) if (report.errors.length < 30) report.errors.push('clicking "' + label + '" threw: ' + e); R.errors.length = before.errors; }
    if (!changed && !threw && !isSubmit(el)) { if (report.dead.length < 30) report.dead.push('the ' + (el.tagName === 'A' ? 'link' : el.getAttribute('role') === 'tab' ? 'tab' : 'button') + ' "' + label + '" does nothing when clicked'); }
    if (name) { const vis = screenVisible(name); if (vis === false || vis === null) { if (!seenScreens.has(name) && report.navMissing.length < 20) report.navMissing.push('"' + label + '" points at screen "' + name + '" but nothing with that name appears after clicking'); } else seenScreens.add(name); }
    // Close anything modal that the click opened, so the rest stays reachable.
    const closers = Array.from(document.querySelectorAll('[aria-label="Close"], [data-close], .close, button')).filter(b => visible(b) && /^(close|cancel|done|ok|×|x|back)$/i.test(text(b)));
    if (closers.length && closers.length < 4 && !seen.has(keyOf(closers[0]))) { try { closers[0].click(); } catch (e) {} await sleep(60); }
  }
  report.dialogs = R.dialogs.slice(0, 12);
  report.screensSeen = Array.from(seenScreens).slice(0, 40);
  report.errors = report.errors.slice(0, 30);
  return report;
})`;
