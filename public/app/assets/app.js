'use strict';
/* =====================================================================
   Ricorsa web app (API-backed build). Sections: icons, utils, state, api, router, ui primitives, sidebar
   ===================================================================== */

// ---------- Icons (24px stroke set) ----------
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 5l3.5 1-3.5 14-3.5-1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/><path d="M8 7h8M8 11h6"/>',
  paperclip: '<path d="M21 11.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9 9a1.5 1.5 0 0 1-2.1-2.1l8.3-8.3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  thumbUp: '<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 8a2 2 0 0 1-2 1.7H7"/>',
  thumbDown: '<path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1zM17 14l-4 7a2.5 2.5 0 0 1-2.5-2.5V15H5.3a2 2 0 0 1-2-2.3l1.2-8a2 2 0 0 1 2-1.7H17"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16z"/><path d="M13 7l4 4"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  zap: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h3V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-3V4z"/>',
  scale: '<path d="M12 3v18M4 7h16"/><path d="M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  graduation: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  pen: '<path d="M4 20l4-1 11-11a2 2 0 0 0-3-3L5 16z"/>',
  sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  compare: '<path d="M9 3v18M15 3v18"/><path d="M3 8h6M15 8h6M3 16h6M15 16h6"/>',
  lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.6.6-1 1.5-1 2.5h-5c0-1-.4-1.9-1-2.5z"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  pin: '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6M9 14h6"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  loop: '<path d="M12 4 L14.29 4.52 L16.29 5.63 L17.87 7.23 L18.9 9.15 L19.34 11.24 L19.18 13.31 L18.47 15.2 L17.28 16.77 L15.74 17.91 L14 18.55 L12.2 18.67 L10.49 18.29 L9 17.47 L7.85 16.3 L7.1 14.9 L6.79 13.39 L6.91 11.92 L7.43 10.59 L8.27 9.5 L9.34 8.74 L10.53 8.32 L11.74 8.27 L12.86 8.55 L13.81 9.11 L14.52 9.88 L14.95 10.78 L15.1 11.71 L14.98 12.59 L14.62 13.34 L14.1 13.93"/><circle cx="12" cy="12.4" r="1.4" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M13 10l2 2"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  slides: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v3M8 20h8"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
};
function icon(name, size = 18, extra = '') {
  const body = ICONS[name] || '';
  let cls = 'ico';
  extra = String(extra || '').replace(/\bclass="([^"]*)"/, (_, c) => { cls += ' ' + c; return ''; }).trim();
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}
// The mark: a spiral converging on its fixed point, recursion arriving somewhere.
const SPIRAL = 'M4355 4776 c-49 -22 -77 -60 -83 -112 -11 -103 55 -154 199 -154 224 0 468 -98 636 -254 216 -200 319 -497 269 -776 -29 -160 -104 -306 -220 -427 -160 -169 -339 -248 -561 -247 -202 1 -340 57 -475 193 -129 130 -180 251 -180 427 0 160 54 288 168 396 182 174 459 185 615 24 113 -115 128 -291 36 -407 -58 -73 -176 -103 -233 -58 -34 27 -33 59 4 111 36 49 39 98 10 146 -50 81 -165 76 -247 -10 -84 -87 -102 -225 -44 -342 124 -251 471 -277 696 -51 277 277 186 742 -180 928 -281 142 -628 81 -866 -153 -415 -409 -294 -1098 242 -1375 163 -84 376 -126 541 -105 377 47 679 251 861 580 141 258 167 598 66 886 -151 434 -538 731 -1017 783 -133 14 -200 13 -237 -3z';
// The brand mark: the blue square with the spiral (vector, traced from the master logo).
const LOGO_SVG = (size = 28) => `<svg width="${size}" height="${size}" viewBox="247 149.5 423 423" aria-hidden="true"><defs><linearGradient id="rg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B6BB0"/><stop offset=".55" stop-color="#075AA0"/><stop offset="1" stop-color="#063C7E"/></linearGradient><linearGradient id="rs${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE3F8"/></linearGradient></defs><rect x="247" y="149.5" width="423" height="423" rx="100" fill="url(#rg${size})"/><g transform="translate(0,724) scale(0.1,-0.1)"><path d="${SPIRAL}" fill="url(#rs${size})"/></g></svg>`;
const WORDMARK = (h = 20) => `<img class="wordmark" src="/brand/wordmark.svg" alt="ricorsa" style="height:${h}px" width="${Math.round(h * 3.95)}" height="${h}">`;

// ---------- Utils ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function truncate(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
function relTime(ts) {
  const d = Date.now() - ts, m = Math.round(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const days = Math.round(h / 24); if (days < 7) return days + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : ''; }
function colorFor(str) {
  let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hues = [205, 190, 160, 25, 340, 265, 100, 45];
  return `hsl(${hues[h % hues.length]} 38% 46%)`;
}
const shortHash = (h) => (h ? String(h).slice(0, 12) : '');
function plain(md) { return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|\[\]]/g, '').replace(/\s+/g, ' ').trim(); }
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
const raf = (fn) => { let queued = false; return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); }; };

// ---------- State (loaded from the API) ----------
const DEFAULT_SETTINGS = { mode: 'search', tier: 'default', focus: 'web', length: 'balanced' };
const state = {
  user: null, plan: null, usage: { today: 0, month: 0, research: 0 },
  threads: [],            // summaries: {id,title,spaceId,createdAt,updatedAt,turnCount,snippet}
  threadCache: {},        // id -> full thread with turns
  spaces: [],
  graph: null,
  settings: Object.assign({}, DEFAULT_SETTINGS),
  ui: (() => { try { return Object.assign({ sidebar: 'expanded' }, JSON.parse(localStorage.getItem('ricorsa.ui') || '{}')); } catch { return { sidebar: 'expanded' }; } })(),
  route: { name: 'home' },
  ready: false,
  runs: new Map(),        // threadId -> AbortController
  composerDraft: '',
};
function persistUi() { try { localStorage.setItem('ricorsa.ui', JSON.stringify(state.ui)); } catch {} }

// ---------- API adapter ----------
async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {} };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  if (opts.signal) init.signal = opts.signal;
  let res;
  try { res = await fetch(path, init); } catch (e) { throw { status: 0, code: 'network', message: 'You appear to be offline.' }; }
  if (res.status === 401) { location.href = '/auth/login?returnTo=' + encodeURIComponent('/app' + location.hash); throw { status: 401, code: 'unauthenticated', message: 'Sign in to continue' }; }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw { status: res.status, code: (data && data.code) || 'error', message: (data && data.error) || ('Request failed (' + res.status + ')') };
  return data;
}
function apiToast(e, fallback) {
  const msg = (e && e.message) || fallback || 'Something went wrong';
  if (e && (e.code === 'upgrade_required' || e.code === 'daily_limit' || e.code === 'monthly_limit' || e.code === 'research_limit' || e.code === 'subscription_inactive')) toast(msg + ' See Pricing to upgrade.', 'bad');
  else toast(msg, 'bad');
}
async function bootstrap() {
  const me = await api('/api/me');
  state.user = me.user; state.plan = me.plan; state.usage = me.usage;
  state.threads = me.threads; state.spaces = me.spaces; state.graph = me.graph; state.graphSize = me.graphSize || 0; state.geo = me.geo || { enabled: true, provider: 'osm' };
  state.settings = Object.assign({}, DEFAULT_SETTINGS, me.user.settings || {});
  state.ready = true;
  // What the picker accepts and how many files a question may carry on this plan (fetched once, off the critical path).
  api('/api/files').then(r => { state.fileLimits = { accept: r.accept || [], perQuestion: r.perQuestion || 1, maxMb: r.maxMb || 10 }; }).catch(() => {});
  if (!state.healthChecked) { state.healthChecked = true; void checkProviderHealth(); }
}
async function refreshGraph() { try { const r = await api('/api/graph'); state.graph = r.graph; refreshBrain(); } catch {} }
function persistSettings() { api('/api/me', { method: 'PATCH', body: state.settings }).catch(() => {}); }
function persistGraph() { /* server-owned; see graph actions */ }

function getSpace(id) { return state.spaces.find(s => s.id === id); }
function getThreadSummary(id) { return state.threads.find(t => t.id === id); }
async function loadThread(id, force) {
  if (!force && state.threadCache[id]) return state.threadCache[id];
  const r = await api('/api/threads/' + encodeURIComponent(id));
  state.threadCache[id] = r.thread; return r.thread;
}
/** Keep the sidebar and library in step with a thread that just changed. */
function touchThread(thread) {
  const first = thread.turns && thread.turns[0];
  const sum = { id: thread.id, title: thread.title, spaceId: thread.spaceId || null, createdAt: thread.createdAt, updatedAt: Date.now(), turnCount: (thread.turns || []).length, snippet: truncate(plain(first && first.answer) || (first && first.status === 'running' ? 'Answering…' : ''), 160) };
  const i = state.threads.findIndex(t => t.id === thread.id);
  if (i >= 0) state.threads[i] = sum; else state.threads.unshift(sum);
  state.threads.sort((a, b) => b.updatedAt - a.updatedAt);
  thread.updatedAt = sum.updatedAt;
  renderSidebar();
}

// ---------- Vocabulary ----------
const MODES = {
  search:   { label: 'Search',   icon: 'search', desc: 'Fast, direct answers with references' },
  research: { label: 'Research', icon: 'book',   desc: 'Deep, structured report, takes longer' },
};
const TIERS = {
  default: { label: 'Best',      icon: 'sparkles', desc: 'Balanced speed and quality' },
  quick:   { label: 'Fast',      icon: 'zap',      desc: 'Snappy replies for simple questions' },
  complex: { label: 'Reasoning', icon: 'brain',    desc: 'Most capable; thinks longest' },
};
const FOCI = {
  web:      { label: 'Web',      icon: 'globe',      desc: 'General knowledge, any topic' },
  academic: { label: 'Academic', icon: 'graduation', desc: 'Scholarly framing and precise terms' },
  writing:  { label: 'Writing',  icon: 'pen',        desc: 'Draft and edit, no references' },
  math:     { label: 'Math',     icon: 'sigma',      desc: 'Step-by-step working' },
  code:     { label: 'Code',     icon: 'code',       desc: 'Code blocks and official docs' },
};
const LENGTHS = { concise: 'Concise', balanced: 'Balanced', detailed: 'Detailed' };

// ---------- Router ----------
function parseRoute() {
  const full = location.hash.replace(/^#\/?/, '');
  const [h, qs] = full.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const [name, id, sub] = h.split('/');
  if (!name) return { name: 'home', query };
  if (name === 'vault' && id && sub) return { name, id: decodeURIComponent(id), doc: decodeURIComponent(sub), query };
  if (['thread', 'space', 'build'].includes(name) && id) return { name, id, query };
  if (['discover', 'spaces', 'library', 'graph', 'account', 'connectors'].includes(name)) return { name, query };
  return { name: 'home', query };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

// ---------- Toast ----------
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  el.innerHTML = icon(kind === 'bad' ? 'alert' : 'check', 16) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, 2600);
}

// ---------- Modal ----------
function openModal(html, { onMount, wide } = {}) {
  closeModal();
  const root = $('#modalRoot');
  root.innerHTML = `<div class="overlay" id="overlay"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = $('#overlay');
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
  if (onMount) onMount(ov);
  const first = ov.querySelector('input, textarea, select, button');
  if (first) first.focus();
  return ov;
}
function closeModal() { $('#modalRoot').innerHTML = ''; }

// ---------- File viewer ----------
// Opens an attached file the way its own application would show it. PDFs and images use the browser's own
// viewers; everything else is drawn by the renderer page (viewer.html) inside a sandboxed frame that gets
// the file's bytes by message and can reach nothing else. `list` is the set of files to page through.
const FILE_KINDS = [
  [/^\.pdf$/, { kind: 'pdf', label: 'PDF', icon: 'file', native: true }],
  [/^\.(png|jpe?g|gif|webp|bmp|svg)$/, { kind: 'image', label: 'Image', icon: 'image', native: true }],
  [/^\.(tiff?)$/, { kind: 'read', label: 'TIFF image', icon: 'image' }],
  [/^\.docx$/, { kind: 'docx', label: 'Word document', icon: 'doc' }],
  [/^\.doc$/, { kind: 'read', label: 'Word document', icon: 'doc' }],
  [/^\.xlsx?$/, { kind: 'sheet', label: 'Excel workbook', icon: 'grid' }],
  [/^\.(csv|tsv)$/, { kind: 'csv', label: 'Spreadsheet', icon: 'grid' }],
  [/^\.pptx$/, { kind: 'pptx', label: 'PowerPoint deck', icon: 'slides' }],
  [/^\.ppt$/, { kind: 'read', label: 'PowerPoint deck', icon: 'slides' }],
  [/^\.md$/, { kind: 'markdown', label: 'Markdown', icon: 'doc' }],
  [/^\.html?$/, { kind: 'html', label: 'HTML', icon: 'code', native: true }],
  [/^\.json$/, { kind: 'json', label: 'JSON', icon: 'code', native: true }],
  [/^\.(txt|log)$/, { kind: 'text', label: 'Text', icon: 'file', native: true }],
  [/^\.(rtf|epub)$/, { kind: 'read', label: 'Document', icon: 'doc' }],
  [/^\.(js|ts|tsx|jsx|py|java|go|rb|rs|c|h|cpp|cs|php|sql|sh|xml|ya?ml|ini|conf|toml)$/, { kind: 'code', label: 'Code', icon: 'code', native: true }],
];
function fileKind(name) {
  const ext = (String(name || '').match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  const hit = FILE_KINDS.find(([re]) => re.test(ext));
  return Object.assign({ ext, kind: 'text', label: 'File', icon: 'file', native: false }, hit ? hit[1] : {});
}
const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B';
let viewer = null;
function closeFileViewer() {
  if (!viewer) return;
  const v = viewer; viewer = null;
  v.el.remove(); document.body.classList.remove('viewer-open');
  if (v.prevFocus && v.prevFocus.focus) { try { v.prevFocus.focus(); } catch {} }
}
function openFileViewer(att, list) {
  if (!att || !att.id) return;
  closeFileViewer(); closePop();
  const files = (list && list.length ? list : [att]).filter(a => a && a.id);
  const el = document.createElement('div');
  el.className = 'viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="viewer-bar"><span class="ficon" data-v-icon></span><div class="viewer-title"><b data-v-name></b><span data-v-meta></span></div>
    <div class="viewer-nav" data-v-nav hidden><button type="button" class="icon-btn" data-v-prev aria-label="Previous file" title="Previous file (Left arrow)">${icon('chevronLeft', 18)}</button><span data-v-pos></span><button type="button" class="icon-btn" data-v-next aria-label="Next file" title="Next file (Right arrow)">${icon('chevronRight', 18)}</button></div>
    <a class="btn sm" data-v-open target="_blank" rel="noopener" title="Open the file in its own browser tab">${icon('external', 14)}<span>Open</span></a>
    <a class="btn sm" data-v-download title="Save the original file">${icon('download', 14)}<span>Download</span></a>
    <button type="button" class="icon-btn" data-v-close aria-label="Close" title="Close (Esc)">${icon('x', 18)}</button></div>
    <div class="viewer-body" data-v-body></div>`;
  document.body.appendChild(el); document.body.classList.add('viewer-open');
  viewer = { el, files, index: Math.max(0, files.findIndex(a => a.id === att.id)), att: null, frame: null, prevFocus: document.activeElement, seq: 0 };
  $('[data-v-close]', el).addEventListener('click', closeFileViewer);
  $('[data-v-prev]', el).addEventListener('click', () => viewerShow(viewer.index - 1));
  $('[data-v-next]', el).addEventListener('click', () => viewerShow(viewer.index + 1));
  viewerShow(viewer.index);
  $('[data-v-close]', el).focus();
}
function viewerStatus(text) { if (viewer) $('[data-v-meta]', viewer.el).textContent = text; }
function viewerShow(i) {
  const v = viewer; if (!v) return;
  if (i < 0 || i >= v.files.length) return;
  v.index = i; v.att = v.files[i]; v.frame = null; const seq = ++v.seq;
  const att = v.att, k = fileKind(att.name), el = v.el, body = $('[data-v-body]', el);
  const apiBase = att.api || ('/api/files/' + encodeURIComponent(att.id));
  const src = apiBase + '/content';
  $('[data-v-icon]', el).innerHTML = icon(k.icon, 20);
  $('[data-v-name]', el).textContent = att.name; $('[data-v-name]', el).title = att.name;
  const base = `${k.label} · ${fmtBytes(att.size)}${att.api ? ' · VDRPros Vault' : ''}${att.page ? ` · page ${att.page}` : ''}`; viewerStatus(base + ' · Opening');
  const nav = $('[data-v-nav]', el); nav.hidden = v.files.length < 2; $('[data-v-pos]', el).textContent = `${i + 1} of ${v.files.length}`;
  $('[data-v-prev]', el).disabled = i === 0; $('[data-v-next]', el).disabled = i === v.files.length - 1;
  const openA = $('[data-v-open]', el); openA.href = src; openA.hidden = !k.native;
  const dl = $('[data-v-download]', el); dl.href = src + '?download=1'; dl.setAttribute('download', att.name);
  body.innerHTML = `<div class="viewer-loading" data-v-loading><span class="spinner"></span><span>Opening ${esc(k.label.toLowerCase())}</span></div>`;
  const loading = $('[data-v-loading]', body);
  const fresh = () => viewer === v && v.seq === seq;
  const info = t => { if (fresh()) viewerStatus(base + (t ? ' · ' + t : '')); };
  // Everything the renderer cannot draw falls back to the text Ricorsa read, laid out as pages.
  const showRead = async (note) => {
    if (!fresh()) return;
    let text = '';
    try { const r = await api(apiBase + '?text=1'); text = r.text || ''; } catch (e) { if (fresh()) { loading.innerHTML = `${icon('alert', 18)}<span>${esc((e && e.message) || 'Could not open this file')}</span>`; } return; }
    if (!fresh()) return;
    openA.hidden = true; dl.hidden = !att.stored;
    mountFrame({ type: 'open', kind: 'read', name: att.name, ext: k.ext, text, note });
  };
  const mountFrame = (msg, transfer) => {
    if (!fresh()) return;
    let frame = v.frame;
    if (!frame) {
      frame = document.createElement('iframe'); frame.className = 'viewer-frame'; frame.title = att.name;
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox'); frame.src = '/app/assets/viewer.html';
      body.insertBefore(frame, loading); v.frame = frame; v.pending = msg; v.transfer = transfer;
      return; // the frame asks for the file once it is ready (see the message listener below)
    }
    frame.contentWindow.postMessage(msg, '*', transfer || []);
  };
  v.onFrame = (m) => {
    if (!fresh()) return;
    if (m.type === 'ready' && v.pending) { const msg = v.pending, tr = v.transfer; v.pending = null; v.transfer = null; v.frame.contentWindow.postMessage(msg, '*', tr || []); return; }
    if (m.type === 'key') { if (m.key === 'Escape') closeFileViewer(); else viewerShow(v.index + (m.key === 'ArrowLeft' ? -1 : 1)); return; }
    if (m.type === 'status') { info(m.text); return; }
    if (m.type === 'done') { loading.hidden = true; info(m.info); return; }
    if (m.type === 'error') {
      if (v.readShown) { loading.innerHTML = `${icon('alert', 18)}<span>${esc(m.message || 'Could not open this file')}</span>`; return; }
      v.readShown = true; showRead(`Ricorsa could not draw this file the way its own app would (${m.message || 'unknown error'}), so here is the text it read. Download the original to open it in its app.`);
    }
  };
  v.readShown = false;
  (async () => {
    // What is known about the file: whether the original is stored, and its details.
    let meta = null;
    try { meta = (await api(apiBase)).file; } catch (e) { if (fresh()) loading.innerHTML = `${icon('alert', 18)}<span>${esc((e && e.message) || 'Could not open this file')}</span>`; return; }
    if (!fresh()) return;
    Object.assign(att, { stored: meta.stored, size: meta.size || att.size, chars: meta.chars });
    if (!meta.stored) { openA.hidden = true; dl.hidden = true; v.readShown = true; showRead('Only the text of this file was kept when it was attached, before files could be opened here. Attach it again to see the original.'); return; }
    dl.hidden = false;
    if (k.kind === 'pdf') {
      if (navigator.pdfViewerEnabled === false) { v.readShown = true; showRead('This browser cannot show PDFs inline, so here is the text Ricorsa read. Download the file to open it in a PDF app.'); return; }
      const fr = document.createElement('iframe'); fr.className = 'viewer-native'; fr.title = att.name; fr.src = src + '#toolbar=1&navpanes=0' + (att.page ? '&page=' + att.page : '');
      fr.addEventListener('load', () => { if (fresh()) { loading.hidden = true; info(att.chars ? `${att.chars.toLocaleString('en-US')} characters read` : ''); } });
      body.insertBefore(fr, loading); return;
    }
    if (k.kind === 'image') {
      const wrap = document.createElement('div'); wrap.className = 'viewer-img'; wrap.title = 'Click to switch between fit and actual size';
      const img = document.createElement('img'); img.alt = att.name; img.src = src;
      img.addEventListener('load', () => { if (fresh()) { loading.hidden = true; info(`${img.naturalWidth} × ${img.naturalHeight}`); } });
      img.addEventListener('error', () => { if (fresh()) { v.readShown = true; showRead('This image could not be shown, so here is the text Ricorsa read from it.'); } });
      wrap.addEventListener('click', () => wrap.classList.toggle('actual'));
      wrap.appendChild(img); body.insertBefore(wrap, loading); return;
    }
    // Everything else: fetch the bytes and hand them to the renderer frame.
    let buffer;
    try { const r = await fetch(src); if (!r.ok) throw new Error(r.status === 404 ? 'The stored copy of this file is gone' : 'Could not fetch the file (' + r.status + ')'); buffer = await r.arrayBuffer(); }
    catch (e) { if (fresh()) { v.readShown = true; showRead(`The original could not be fetched (${(e && e.message) || 'error'}), so here is the text Ricorsa read.`); } return; }
    if (!fresh()) return;
    mountFrame({ type: 'open', kind: k.kind, name: att.name, ext: k.ext, size: att.size, buffer }, [buffer]);
  })();
}
window.addEventListener('message', (e) => {
  const v = viewer; if (!v || !v.frame || e.source !== v.frame.contentWindow || !e.data || e.data.from !== 'ricorsa-viewer') return;
  if (v.onFrame) v.onFrame(e.data);
});
/** A page of a document in the person's VDRPros Vault, opened through the connector that may read it. */
function openVaultDoc(connId, docId, page) {
  const api = '/api/connectors/' + encodeURIComponent(connId) + '/vault/files/' + encodeURIComponent(docId);
  const att = { id: docId, name: 'Vault document', size: 0, stored: true, api, page: page ? +page : null };
  openFileViewer(att, [att]);
  fetch(api).then(r => r.json()).then(j => { if (j && j.file && viewer && viewer.att === att) { Object.assign(att, { name: j.file.name, size: j.file.size, chars: j.file.chars }); viewerShow(viewer.index); } }).catch(() => {});
}
function vaultLinkParts(href) {
  const m = /#\/vault\/([^/?#]+)\/([^/?#]+)(?:\?p=(\d+))?/.exec(href || ''); if (!m) return null;
  return { connId: decodeURIComponent(m[1]), docId: decodeURIComponent(m[2]), page: m[3] ? +m[3] : null };
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href*="#/vault/"]'); if (!a) return;
  const parts = vaultLinkParts(a.getAttribute('href')); if (!parts) return;
  e.preventDefault(); openVaultDoc(parts.connId, parts.docId, parts.page);
});

// ---------- Popover ----------
let popCleanup = null;
function closePop() { if (popCleanup) { popCleanup(); popCleanup = null; } }
function openPop(anchor, html, { align = 'left', onMount } = {}) {
  if (popCleanup && anchor.getAttribute('aria-expanded') === 'true') { closePop(); return null; }
  closePop();
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = align === 'right' ? r.right - pw : r.left;
  left = clamp(left, 8, window.innerWidth - pw - 8);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePop(); };
  const onKey = (e) => { if (e.key === 'Escape') closePop(); };
  setTimeout(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }, 0);
  popCleanup = () => { pop.remove(); anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  if (onMount) onMount(pop);
  return pop;
}
function menuItems(items, current) {
  return items.map(it => `<button class="pop-item${it.key === current ? ' on' : ''}${it.danger ? ' danger' : ''}" data-key="${esc(it.key)}">${it.icon ? icon(it.icon, 17) : ''}<span><div class="t">${esc(it.label)}</div>${it.desc ? `<div class="d">${esc(it.desc)}</div>` : ''}</span>${current !== undefined ? icon('check', 16, 'class="chk"') : ''}</button>`).join('');
}

// ---------- Sidebar ----------
function renderSidebar() {
  const sb = $('#sidebar');
  sb.classList.toggle('collapsed', state.ui.sidebar === 'collapsed');
  $$('.nav-item[data-route]', sb).forEach(a => {
    const r = a.dataset.route;
    const on = (state.route.name === r) || (r === 'spaces' && state.route.name === 'space');
    a.classList.toggle('on', on);
  });
  const recent = state.threads.slice(0, 7);
  const box = $('#recent');
  box.innerHTML = recent.length ? `<div class="recent-h"><span>Recent</span><button type="button" class="icon-btn recent-clear" data-clear-recent title="Delete all recent conversations" aria-label="Delete all recent conversations">${icon('trash', 13)}</button></div>` + recent.map(t =>
    `<div class="recent-row"><a href="#/thread/${t.id}" class="${state.route.name === 'thread' && state.route.id === t.id ? 'on' : ''}" title="${esc(t.title)}"><span>${esc(t.title)}</span></a><button type="button" class="icon-btn recent-del" data-recent-del="${t.id}" title="Delete this conversation" aria-label="Delete conversation">${icon('trash', 13)}</button></div>`
  ).join('') : '';
  $$('[data-recent-del]', box).forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const t = getThreadSummary(b.dataset.recentDel); if (t) confirmDelete(t); }));
  const clr = $('[data-clear-recent]', box); if (clr) clr.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); confirmDeleteMany(recent); });
  const acct = $('#acctRow');
  if (acct && state.user) {
    const name = state.user.name || state.user.email || 'You';
    const planName = state.plan ? state.plan.name : 'Free';
    const demo = state.user.admin && state.settings && state.settings.demoPlan;
    acct.innerHTML = `<span class="avatar">${esc(name[0] || 'Y').toUpperCase()}</span><span class="lbl acct-lbl"><span class="acct-name">${esc(truncate(name, 22))}</span><span class="acct-plan">${state.user.admin ? (demo ? `Admin · demo as ${esc(planName)}` : 'Admin · all access') : esc(planName) + ' plan'}</span></span>`;
    acct.title = state.user.admin ? 'Admin account: every capability, no limits. Use Settings to demo a plan.' : 'Account: plan, billing, export and sign out';
    const up = $('#upgradeRow');
    if (up) {
      const k = state.plan ? state.plan.key : 'free'; const next = nextPlanName(k);
      up.hidden = !next || (state.user && state.user.admin && !(state.settings && state.settings.demoPlan));
      const lbl = up.querySelector('span:last-child'); if (lbl) lbl.textContent = k === 'free' ? 'Start a free trial' : next ? 'Upgrade to ' + next : '';
      up.title = k === 'free' ? 'Essentials unlocks the full identity graph, Research mode and the Reasoning model' : k === 'essentials' ? 'Professional unlocks Discover: build apps, agents and datasets from your asset' : 'Enterprise: the highest limits, every connector, and a direct line to us';
    }
  }
}
function setupSidebar() {
  $$('[data-logo]').forEach(el => el.innerHTML = LOGO_SVG(30));
  $$('[data-wordmark]').forEach(el => el.outerHTML = WORDMARK(21));
  $$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, 18); });
  $('#collapseBtn').innerHTML = icon('panel', 17);
  $('#kbdHint').textContent = isMac ? '⌘ K' : 'Ctrl K';
  $('#collapseBtn').addEventListener('click', () => {
    state.ui.sidebar = state.ui.sidebar === 'collapsed' ? 'expanded' : 'collapsed';
    persistUi(); renderSidebar();
  });
  $('#newThreadBtn').addEventListener('click', () => newThread());
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#acctRow').addEventListener('click', () => { location.href = '/account'; });
  $('#scrim').addEventListener('click', closeDrawer);
  $('#sidebar').addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(); });
}
function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }
function newThread() {
  closeModal(); closePop();
  if (state.route.name === 'home') { const ta = $('#main textarea'); if (ta) { ta.focus(); } }
  else go('#/');
  setTimeout(() => { const ta = $('#main textarea'); if (ta) ta.focus(); }, 30);
}

/* =====================================================================
   Engine: markdown · citations · stream parser · prompt · run
   ===================================================================== */

// ---------- Markdown (safe: everything is escaped before markup is applied) ----------
function inlineMd(s) {
  let out = esc(s);
  const codes = [];
  out = out.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  return out;
}
function parseList(lines, i) {
  const itemRe = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
  const items = []; let cur = null;
  while (i < lines.length) {
    const line = lines[i]; const m = itemRe.exec(line);
    if (m) { cur = { indent: m[1].length, ordered: /\d/.test(m[2]), lines: [m[3]] }; items.push(cur); i++; continue; }
    if (!line.trim()) {
      const nxt = lines[i + 1];
      if (cur && nxt !== undefined && (itemRe.test(nxt) || /^\s{2,}\S/.test(nxt))) { cur.lines.push(''); i++; continue; }
      break;
    }
    if (cur && /^\s{2,}\S/.test(line)) { cur.lines.push(line.trim()); i++; continue; }
    break;
  }
  function level(idx, ind) {
    const ordered = items[idx].ordered;
    let out = ordered ? '<ol>' : '<ul>';
    while (idx < items.length && items[idx].indent >= ind) {
      const it = items[idx];
      if (it.indent > ind) { const [sub, n] = level(idx, it.indent); out += `<li>${sub}</li>`; idx = n; continue; }
      const text = it.lines.join('\n');
      out += `<li>${text.includes('\n\n') ? md(text) : inlineMd(text)}`;
      idx++;
      if (idx < items.length && items[idx].indent > ind) { const [sub, n] = level(idx, items[idx].indent); out += sub; idx = n; }
      out += '</li>';
    }
    return [out + (ordered ? '</ol>' : '</ul>'), idx];
  }
  return [level(0, items[0].indent)[0], i];
}
function md(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let html = '', i = 0; const para = [];
  const flush = () => { if (para.length) { html += `<p>${inlineMd(para.join('\n'))}</p>`; para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i]; let m;
    if ((m = /^\s*```\s*([\w+#-]*)\s*$/.exec(line))) {
      flush(); const lang = m[1]; const buf = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      const closed = i < lines.length; i++;
      // A console: an interactive card the answer carries (mounted by mountConsoles); while it is still being written, a quiet line.
      if (lang === 'console') { html += closed ? `<div class="console" data-console="${esc(buf.join('\n'))}"></div>` : `<div class="console pending"><span class="dots">Setting up a console</span></div>`; continue; }
      html += `<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`; continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flush(); const l = m[1].length; html += `<h${l}>${inlineMd(m[2])}</h${l}>`; i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); html += '<hr>'; i++; continue; }
    if (/^\s{0,3}>/.test(line)) {
      flush(); const buf = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { buf.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
      html += `<blockquote>${md(buf.join('\n'))}</blockquote>`; continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const head = splitRow(line); const rows = []; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      html += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, ci) => `<td>${inlineMd(r[ci] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (/^\s*([-*+]|\d{1,3}[.)])\s+/.test(line)) { flush(); const [lh, next] = parseList(lines, i); html += lh; i = next; continue; }
    para.push(line); i++;
  }
  flush();
  return html;
}

// ---------- Citations: turn [n] in text nodes into chips ----------
function makeCite(n, sources) {
  const s = (sources || []).find(x => x.n === n);
  const title = s ? `${s.title}${s.domain ? ', ' + s.domain : ''}` : `Reference ${n}`;
  if (s && s.url) {
    const a = document.createElement('a');
    a.className = 'cite'; a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = title; a.textContent = n; a.dataset.n = n;
    return a;
  }
  const sp = document.createElement('span');
  sp.className = 'cite' + (s ? '' : ' dead'); sp.title = title; sp.textContent = n; sp.dataset.n = n;
  return sp;
}
function applyCites(root, sources) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || p.closest('code, pre, a, .cite')) return NodeFilter.FILTER_REJECT;
      return /\[\d/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const re = /\[(\d{1,2}(?:\s*[,\-–]\s*\d{1,2})*)\]/g;
  for (const node of nodes) {
    const text = node.nodeValue; const frag = document.createDocumentFragment(); let last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      for (const n of m[1].match(/\d+/g).map(Number)) frag.appendChild(makeCite(n, sources));
      last = m.index + m[0].length;
    }
    if (!last) continue;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}
function renderAnswerInto(el, markdown, sources, streaming, thread) {
  el.innerHTML = md(markdown) + (streaming ? '<span class="cursor-blink" aria-hidden="true"></span>' : '');
  applyCites(el, sources);
  mountConsoles(el, thread);
}

// ---------- Consoles: interactive cards inside an answer ----------
// The model writes one as a fenced `console` block of JSON (the guide is in src/lib/console.ts); every button runs
// one of a fixed set of verbs, and ids are checked against what the person actually has before anything happens.
const CONSOLE_ROUTES = /^#\/(discover|connectors|graph|spaces|library|build\/[\w-]+|thread\/[\w-]+)$|^\/(pricing|account)$/;
const CONSOLE_STATUS = { on: ['On', 'ok'], off: ['Off', ''], available: ['Available', ''], done: ['Ready', 'ok'], building: ['Building', 'warn'], error: ['Needs attention', 'bad'], none: ['', ''] };
function mountConsoles(root, thread) {
  $$('.console[data-console]', root).forEach(box => {
    let spec = null;
    try { spec = JSON.parse(box.dataset.console); } catch (e) { /* the block was not valid JSON; the prose still carries the answer */ }
    box.removeAttribute('data-console');
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.items) || !spec.items.length) { box.remove(); return; }
    const items = spec.items.slice(0, 8).filter(it => it && typeof it === 'object' && it.title);
    box.innerHTML = `<div class="console-h">${icon('layers', 15)}<b>${esc(String(spec.title || 'Console'))}</b>${spec.subtitle ? `<span>${esc(String(spec.subtitle))}</span>` : ''}</div>
      <div class="console-rows">${items.map((it, i) => {
        const st = CONSOLE_STATUS[String(it.status || 'none')] || CONSOLE_STATUS.none;
        const acts = (Array.isArray(it.actions) ? it.actions : []).slice(0, 3).filter(a => a && a.label && a.do);
        return `<div class="console-row"><div class="console-txt"><b>${esc(String(it.title))}</b>${it.detail ? `<small>${esc(String(it.detail))}</small>` : ''}</div><div class="console-side">${st[0] ? `<span class="pill ${st[1]}">${st[0]}</span>` : ''}${acts.map((a, j) => `<button type="button" class="btn sm${j === 0 && !st[0] ? ' primary' : ''}" data-con="${i}:${j}">${esc(String(a.label))}</button>`).join('')}</div></div>`;
      }).join('')}</div>${spec.footer ? `<div class="console-f">${esc(String(spec.footer))}</div>` : ''}`;
    $$('[data-con]', box).forEach(b => b.addEventListener('click', () => {
      const [i, j] = b.dataset.con.split(':').map(Number); const a = items[i].actions[j];
      runConsoleAction(a, thread, b);
    }));
  });
}
async function runConsoleAction(a, thread, btn) {
  const verb = String(a.do || '');
  const busy = (on) => { btn.disabled = on; };
  try {
    if (verb === 'open') { const to = String(a.to || ''); if (!CONSOLE_ROUTES.test(to)) { toast('That place does not exist', 'bad'); return; } if (to.startsWith('#')) go(to); else location.href = to; return; }
    if (verb === 'link') { const url = safeUrl(String(a.url || '')); if (!url) { toast('That link is not usable', 'bad'); return; } window.open(url, '_blank', 'noopener'); return; }
    if (verb === 'copy') { try { await navigator.clipboard.writeText(String(a.text || '')); toast('Copied'); } catch (e) { toast('Could not copy', 'bad'); } return; }
    if (verb === 'ask') {
      const text = String(a.text || '').trim(); if (!text) return;
      if (thread) { if (state.runs.has(thread.id)) { toast('Wait for the current answer to finish'); return; } followUp(thread, text, { mode: 'search', tier: state.settings.tier, focus: 'web' }); }
      else startThread(text, { mode: 'search', tier: state.settings.tier, focus: 'web' });
      return;
    }
    if (verb === 'build') {
      const title = String(a.title || '').trim(); if (!title) return;
      startBuild({ title, kind: String(a.kind || 'App'), what: String(a.what || title), prompt: String(a.what || title), builds: [] }, 'For you');
      return;
    }
    if (verb === 'connector.on' || verb === 'connector.off') {
      busy(true);
      if (!state.connectors) await loadConnectors();
      const c = (state.connectors || []).find(x => x.id === a.id);
      if (!c) { toast('That connector is not on your account', 'bad'); return; }
      const enabled = verb === 'connector.on';
      const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body: { enabled } });
      Object.assign(c, r.connector);
      const row = btn.closest('.console-row'); const pill = row && row.querySelector('.pill'); if (pill) { pill.textContent = enabled ? 'On' : 'Off'; pill.className = 'pill' + (enabled ? ' ok' : ''); }
      btn.textContent = enabled ? 'Turn off' : 'Turn on'; btn.dataset.flip = '1';
      // The button now does the opposite; swap the verb in place so the next press works too.
      a.do = enabled ? 'connector.off' : 'connector.on';
      toast(`${c.name} ${enabled ? 'is on' : 'is off'}`);
      return;
    }
    if (verb === 'connector.add') {
      if (!state.catalog) { try { await loadConnectors(); } catch (e) { /* the modal copes without a catalog */ } }
      const key = String(a.id || ''); const preset = (state.catalog || []).find(p => p.key === key);
      if (!preset) { toast('That connector is not in the catalog', 'bad'); return; }
      addConnectorModal(key);
      return;
    }
    if (verb === 'app.open') {
      const id = String(a.id || ''); if (!/^[\w-]{6,40}$/.test(id)) return;
      window.open('/app/run#' + encodeURIComponent(id), '_blank', 'noopener');
      return;
    }
    toast('That action is not available', 'bad');
  } catch (e) { apiToast(e, 'That did not work'); }
  finally { busy(false); }
}

// ---------- Stream parser (tolerant, progressive) ----------
function parseSources(block) {
  const out = [];
  for (const raw of String(block).split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const m = /^\[?(\d{1,2})[\].:)]?\s+(.+)$/.exec(line);
    let n = out.length + 1, rest = line;
    if (m) { n = +m[1]; rest = m[2]; }
    const parts = rest.split('|').map(s => s.trim()).filter(Boolean);
    const title = parts[0] || rest; let domain = parts[1] || ''; let url = safeUrl(parts[2] || '');
    if (!url && parts[1] && /^https?:\/\//i.test(parts[1])) { url = safeUrl(parts[1]); domain = domainOf(url); }
    if (!url && parts[2] && /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(parts[2])) url = safeUrl('https://' + parts[2]);
    domain = domain.replace(/^https?:\/\//i, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!domain && url) domain = domainOf(url);
    if (!url && /^[\w.-]+\.[a-z]{2,}$/i.test(domain)) url = 'https://' + domain;
    if (!title) continue;
    out.push({ n, title: truncate(title, 140), domain, url });
    if (out.length >= 10) break;
  }
  return out;
}
function parseRelated(block) {
  const seen = new Set(); const out = [];
  for (const raw of String(block).split('\n')) {
    let line = raw.trim().replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, '').replace(/^["“]|["”]$/g, '').trim();
    if (!line || line.length < 8 || line.startsWith('<')) continue;
    const key = line.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    out.push(truncate(line, 180));
    if (out.length >= 6) break;
  }
  return out;
}
function trimPartialTag(s) { return s.replace(/<\/?[a-z]{0,9}$/i, '').replace(/\s+$/, ''); }
function parseStream(raw) {
  let text = String(raw || '');
  text = text.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '');
  const res = { sources: [], sourcesDone: false, answer: '', answerDone: false, related: [], relatedDone: false };
  const sO = text.indexOf('<sources>'), sC = text.indexOf('</sources>');
  if (sO >= 0 && sC > sO) { res.sources = parseSources(text.slice(sO + 9, sC)); res.sourcesDone = true; }
  const aO = text.indexOf('<answer>'), aC = text.indexOf('</answer>');
  const rO = text.indexOf('<related>'), rC = text.indexOf('</related>');
  if (aO >= 0) {
    let a = aC > aO ? text.slice(aO + 8, aC) : text.slice(aO + 8);
    if (aC < 0 && rO > aO) a = text.slice(aO + 8, rO);
    else if (aC < 0 && text.indexOf('<learned>') > aO) a = text.slice(aO + 8, text.indexOf('<learned>'));
    res.answer = (aC > aO ? a : trimPartialTag(a)).replace(/^\s+/, '');
    res.answerDone = aC > aO;
  } else if (sO < 0 && sC < 0) {
    // Model skipped the format: treat everything before <related> as the answer.
    let a = rO >= 0 ? text.slice(0, rO) : text;
    if (!/^\s*<[a-z]{0,9}$/i.test(a)) res.answer = trimPartialTag(a).replace(/^\s+/, '');
  } else if (sC > 0) {
    let a = text.slice(sC + 10); if (rO > sC) a = text.slice(sC + 10, rO);
    res.answer = trimPartialTag(a).replace(/^\s+/, '');
  }
  if (rO >= 0) {
    const r = rC > rO ? text.slice(rO + 9, rC) : text.slice(rO + 9);
    res.related = parseRelated(rC > rO ? r : r.replace(/[^\n]*$/, ''));
    res.relatedDone = rC > rO;
  }
  const lO = text.indexOf('<learned>'), lC = text.indexOf('</learned>');
  res.learned = null;
  if (lO >= 0 && lC > lO) res.learned = parseLearned(text.slice(lO + 9, lC));
  else if (lO >= 0 && aC > 0 && text.length - lO > 20 && /\}\s*$/.test(text)) res.learned = parseLearned(text.slice(lO + 9));
  return res;
}
function parseLearned(block) {
  const s = String(block); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(s.slice(a, b + 1)); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch { return null; }
}

const ERROR_COPY = {
  provider_billing: 'Ricorsa cannot reach its AI provider right now because the account behind it needs attention. The site owner has been notified; please try again later.',
  provider_auth: 'Ricorsa cannot reach its AI provider right now because its access key was rejected. The site owner has been notified; please try again later.',
  rate_limited: 'Ricorsa is handling a lot of questions right now. Wait a minute and try again.',
  overloaded: 'The model is overloaded at the moment. Try again in a minute.',
  session_expired: 'Your session expired. Sign in again, then retry.',
  empty_completion: 'No answer came back. Try rephrasing or asking for less at once.',
  prompt_too_large: 'This thread is too long to continue. Start a new thread for this question.',
  invalid_request: 'The request was rejected. Try again, or start a new thread.',
  upstream_error: 'The answer was interrupted on the way back. Try again.',
  unavailable: 'Ricorsa is not reachable right now. Check your connection and try again.',
  network: 'You appear to be offline.',
  daily_limit: 'You have used today\u2019s questions on your plan.',
  monthly_limit: 'You have used this month\u2019s questions on your plan.',
  research_limit: 'You have used this month\u2019s Research reports.',
  upgrade_required: 'That needs a paid plan.',
  subscription_inactive: 'Your subscription is not active. Update it on the Account page.',
};
const BLOCKING = new Set([]);
const PLAN_CODES = new Set(['daily_limit', 'monthly_limit', 'research_limit', 'upgrade_required', 'subscription_inactive']);
// ---------- Export / copy ----------
function threadMarkdown(thread) {
  const out = [`# ${thread.title}`, '', `_Exported from Ricorsa · ${new Date().toLocaleString()}_`, ''];
  if (thread.origin && thread.origin.ideaId) out.push(`_Provenance: Discover idea ${thread.origin.ideaId} from graph ${thread.origin.graphHash || 'n/a'}_`, '');
  for (const t of thread.turns) {
    out.push(`## ${t.q}`, '', (t.answer || '_No answer_').trim(), '');
    if (t.sources && t.sources.length) { out.push('**Sources**', ''); for (const s of t.sources) out.push(`${s.n}. ${s.title}${s.domain ? `, ${s.domain}` : ''}${s.url ? ` <${s.url}>` : ''}`); out.push(''); }
  }
  return out.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
}
function downloadFile(filename, data, type = 'text/markdown') {
  const blob = new Blob([data], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportThread(thread) {
  const filename = (thread.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'thread') + '.md';
  downloadFile(filename, threadMarkdown(thread)); toast('Saved ' + filename);
}


const NODE_TYPES = {
  topic:     { label: 'Topics',    hex: '#2F6BA8', shape: 'circle',  desc: 'Subjects you keep coming back to' },
  entity:    { label: 'Entities',  hex: '#C2611F', shape: 'square',  desc: 'Named things in your world, companies, tools, places, projects' },
  goal:      { label: 'Goals',     hex: '#2E9E6A', shape: 'diamond', desc: 'What your questions seem to be working toward' },
  expertise: { label: 'Expertise', hex: '#B0306A', shape: 'hex',     desc: 'Areas where your phrasing shows a level' },
  style:     { label: 'Style',     hex: '#7B8590', shape: 'ring',    desc: 'How you like answers pitched' },
};
function slugify(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48); }
function cleanLabel(v) { const s = typeof v === 'string' ? v : (v && (v.area || v.label || v.name || v.text)) || ''; return truncate(String(s).replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim(), 60); }
function normList(v, max) { if (!Array.isArray(v)) return []; const seen = new Set(); const out = []; for (const x of v) { const s = cleanLabel(x); const k = slugify(s); if (s.length < 2 || !k || seen.has(k)) continue; seen.add(k); out.push(s); if (out.length >= max) break; } return out; }
function topNodes(type, n = 8) { return Object.values(state.graph.nodes).filter(x => x.type === type).sort((a, b) => b.weight - a.weight || b.lastSeen - a.lastSeen).slice(0, n); }

// ---------- Running a turn over server-sent events ----------
function applyParsed(turn) {
  const p = parseStream(turn.raw || '');
  turn.answer = p.answer; turn.related = p.related; turn.answerDone = p.answerDone;
  if (p.learned) turn.learned = p.learned;
}
function makeTurn(q, o) {
  return { id: 'tmp-' + uid(), q, mode: o.mode || 'search', tier: o.tier || 'default', focus: o.focus || 'web', length: o.length || null, createdAt: Date.now(), status: 'pending', raw: '', sources: [], answer: '', related: [], learned: null, learnedMerged: false, truncated: false, tierApplied: null, error: null, statusText: '', attachments: o.attachments || [] };
}
/** Read an SSE response body and dispatch events. Resolves when the stream ends. */
async function readSse(res, onEvent) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      let ev = 'message', data = '';
      for (const line of chunk.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (!data) continue;
      let parsed; try { parsed = JSON.parse(data); } catch { continue; }
      onEvent(ev, parsed);
    }
  }
}
async function runTurn(thread, turn, { rewrite } = {}) {
  turn.status = 'running'; turn.error = null; turn.raw = ''; turn.answer = ''; turn.related = []; turn.sources = []; turn.tools = []; turn.truncated = false; turn.tierApplied = null; turn.learned = null; turn.learnedMerged = false; turn.statusText = (!rewrite && turn.attachments && turn.attachments.length) ? 'Reading ' + (turn.attachments.length === 1 ? turn.attachments[0].name : turn.attachments.length + ' files') : 'Searching the web';
  liveRender(thread, turn);
  const ctl = new AbortController();
  state.runs.set(thread.id, ctl);
  liveRender(thread, turn);
  const body = rewrite ? { threadId: thread.id, rewrite } : { threadId: thread.id, question: turn.q, mode: turn.mode, tier: turn.tier, focus: turn.focus, length: turn.length || state.settings.length, attachments: (turn.attachments || []).map(a => a.id).filter(Boolean) };
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (res.status === 401) { location.href = '/auth/login?returnTo=' + encodeURIComponent('/app#/thread/' + thread.id); return; }
    if (!res.ok) {
      let data = null; try { data = await res.json(); } catch {}
      turn.status = 'error'; turn.error = (data && data.code) || 'upstream_error'; turn.errorMessage = data && data.error;
      return;
    }
    await readSse(res, (ev, data) => {
      if (ev === 'meta') {
        if (data.turnId && data.turnId !== turn.id) { const sec = $(`[data-turn="${turn.id}"]`); turn.id = data.turnId; if (sec) sec.dataset.turn = data.turnId; }
        if (data.title && thread.title !== data.title) thread.title = data.title;
      } else if (ev === 'status') { turn.statusText = data.text || ''; liveRender(thread, turn); }
      else if (ev === 'sources') { turn.sources = data || []; liveRender(thread, turn); }
      else if (ev === 'tools') { turn.tools = data || []; liveRender(thread, turn); }
      else if (ev === 'delta') { turn.raw += data.text || ''; applyParsed(turn); liveRender(thread, turn); }
      else if (ev === 'done') { Object.assign(turn, data.turn, { raw: turn.raw }); if (typeof data.graphEvents === 'number' && state.graph) state.graph.events = data.graphEvents; }
      else if (ev === 'error') { if (data.turn) Object.assign(turn, data.turn, { raw: turn.raw }); turn.status = 'error'; turn.error = data.code || 'upstream_error'; turn.errorMessage = data.message; }
    });
    if (turn.status === 'running') { turn.status = 'done'; }
    if (turn.status === 'done') { state.usage.today++; state.usage.month++; if (turn.mode === 'research') state.usage.research++; refreshGraph(); }
  } catch (e) {
    if (e && e.name === 'AbortError') { applyParsed(turn); turn.status = 'stopped'; }
    else { console.error(e); turn.status = 'error'; turn.error = 'upstream_error'; }
  } finally {
    state.runs.delete(thread.id);
    delete state.threadCache[thread.id]; state.threadCache[thread.id] = thread; // keep the live object as the cache
    touchThread(thread);
    liveRender(thread, turn, true);
  }
}
async function startThread(q, o = {}) {
  let created;
  try { created = (await api('/api/threads', { body: { title: q, spaceId: o.spaceId || null, origin: o.origin || null } })).thread; }
  catch (e) { apiToast(e, 'Could not start a thread'); return null; }
  const thread = { ...created, turns: [] };
  const turn = makeTurn(q, o); thread.turns.push(turn);
  state.threadCache[thread.id] = thread;
  touchThread(thread);
  go('#/thread/' + thread.id);
  runTurn(thread, turn);
  return thread;
}
function followUp(thread, q, o = {}) {
  const turn = makeTurn(q, o); thread.turns.push(turn);
  touchThread(thread);
  if (state.route.name === 'thread' && state.route.id === thread.id) {
    const box = $('#turns'); if (box) { box.insertAdjacentHTML('beforeend', turnHtml(thread, turn)); const sec = box.lastElementChild; paintTurn(sec, thread, turn); wireTurn(sec, thread, turn); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  runTurn(thread, turn);
}
function stopRun(threadId) { const c = state.runs.get(threadId); if (c) c.abort(); }
function rewriteTurn(thread, turn, how) {
  if (state.runs.has(thread.id)) return;
  if (how === 'concise') turn.length = 'concise';
  if (how === 'detailed') turn.length = 'detailed';
  if (how === 'complex') turn.tier = 'complex';
  if (how === 'research') turn.mode = 'research';
  runTurn(thread, turn, { rewrite: { turnId: turn.id, how } });
}
async function deleteThreadRemote(id) {
  await api('/api/threads/' + encodeURIComponent(id), { method: 'DELETE' });
  state.threads = state.threads.filter(t => t.id !== id); delete state.threadCache[id];
}

// ---------- Graph actions (server-owned) ----------
async function forgetNode(id) { const r = await api('/api/graph/forget', { body: { nodeId: id } }); state.graph = r.graph; }
async function resetGraph() { const r = await api('/api/graph', { method: 'DELETE' }); state.graph = r.graph; }
async function setGraphPaused(paused) { const r = await api('/api/graph/pause', { body: { paused } }); state.graph = r.graph; }
async function recordVote(thread, turn, vote) { try { await api(`/api/threads/${encodeURIComponent(thread.id)}/turns/${encodeURIComponent(turn.id)}/vote`, { body: { vote } }); } catch (e) { apiToast(e); } }
function learnedSummary(L) {
  return { topic: normList(L.topics, 4).length, entity: normList(L.entities, 4).length, goal: normList(L.goals, 2).length, expertise: (Array.isArray(L.expertise) ? L.expertise.slice(0, 3).filter(x => cleanLabel(x).length >= 2).length : 0), style: normList(L.style, 3).length };
}

/* =====================================================================
   Views: composer · home · thread · discover · spaces · library · settings · init
   ===================================================================== */

// ---------- Composer ----------
function createComposer(o) {
  const c = { mode: o.mode || state.settings.mode, tier: o.tier || state.settings.tier, focus: o.focus || state.settings.focus, files: [] };
  const el = document.createElement('div');
  el.className = 'composer ' + (o.variant === 'compact' ? 'compact' : 'hero');
  el.innerHTML = `
    <div class="attach-row" data-attach hidden></div>
    <textarea rows="1" placeholder="${esc(o.placeholder || 'Ask anything…')}" aria-label="${esc(o.placeholder || 'Ask anything')}"></textarea>
    <div class="composer-bar">
      <div class="left">
        <div class="seg" role="radiogroup" aria-label="Mode">
          ${Object.entries(MODES).map(([k, m]) => `<button type="button" data-mode="${k}" class="${k}" role="radio" aria-checked="${c.mode === k}" title="${esc(m.label)}: ${esc(m.desc)}">${icon(m.icon, 15)}<span>${m.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="right">
        <button type="button" class="icon-btn" data-attach-btn aria-label="Attach files" title="Attach files for the answer to read: PDF, Word, Excel, PowerPoint, text, code, images">${icon('paperclip', 17)}</button>
        <button type="button" class="chip-btn" data-tier aria-haspopup="menu" aria-expanded="false" title="Model: which model answers"></button>
        <button type="button" class="chip-btn" data-focus aria-haspopup="menu" aria-expanded="false" title="Focus: what kind of answer you want"></button>
        <button type="button" class="send" data-send aria-label="Ask" title="Send (Enter)" disabled>${icon('arrowRight', 18)}</button>
      </div>
    </div>`;
  const ta = $('textarea', el), send = $('[data-send]', el), attachBtn = $('[data-attach-btn]', el), attachRow = $('[data-attach]', el);
  const paintChips = () => {
    $$('[data-mode]', el).forEach(b => { const on = b.dataset.mode === c.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('[data-tier]', el).innerHTML = icon(TIERS[c.tier].icon, 15) + `<span class="lbl">${TIERS[c.tier].label}</span>` + icon('chevron', 13, 'class="caret"');
    $('[data-tier]', el).title = `Model: ${TIERS[c.tier].label}. ${TIERS[c.tier].desc}. Click to change.`;
    $('[data-focus]', el).title = `Focus: ${FOCI[c.focus].label}. ${FOCI[c.focus].desc}. Click to change.`;
    $('[data-focus]', el).innerHTML = icon(FOCI[c.focus].icon, 15) + (c.focus !== 'web' ? `<span class="lbl">${FOCI[c.focus].label}</span>` : '') + icon('chevron', 13, 'class="caret"');
  };
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight) + 'px'; if (o.variant === 'compact') el.classList.toggle('multiline', ta.scrollHeight > 44 || c.files.length > 0); };
  const running = () => o.threadId && state.runs.has(o.threadId);
  const paintSend = () => {
    if (running()) { send.disabled = false; send.classList.add('stop'); send.innerHTML = icon('stop', 16); send.setAttribute('aria-label', 'Stop'); }
    else { send.classList.remove('stop'); send.innerHTML = icon('arrowRight', 18); send.setAttribute('aria-label', 'Ask'); const busy = c.files.some(f => f.status === 'uploading'); send.disabled = !ta.value.trim() || !state.ready || busy; send.title = busy ? 'Waiting for the files to finish uploading' : 'Send (Enter)'; }
  };
  // Files travel ahead of the question: each one is uploaded and read as soon as it is picked, so sending is instant.
  const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const paintAttach = () => {
    attachRow.hidden = !c.files.length;
    const reason = f => { const m = String(f.error || 'could not be read'); return m.length > 44 ? m.slice(0, 42) + '…' : m; };
    attachRow.innerHTML = c.files.map((f, i) => `<div class="attach-chip ${esc(f.status)}" title="${esc(f.status === 'error' ? (f.error || 'Could not read this file') : f.status === 'uploading' ? 'Reading the file' : `${fmtSize(f.size)} · ${(f.chars || 0).toLocaleString('en-US')} characters read`)}">${f.status === 'uploading' ? '<span class="spinner tiny"></span>' : icon(f.status === 'error' ? 'alert' : 'file', 13)}${f.status === 'ready' && f.id ? `<button type="button" class="name" data-open="${i}" title="Open ${esc(f.name)}">${esc(f.name)}</button>` : `<span class="name">${esc(f.name)}</span>`}<span class="meta">${f.status === 'uploading' ? 'reading' : f.status === 'error' ? esc(reason(f)) : fmtSize(f.size)}</span>${f.status === 'error' && f.file ? `<button type="button" class="retry" data-retry="${i}" title="Try reading this file again">${icon('refresh', 11)}Retry</button>` : ''}<button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">${icon('x', 11)}</button></div>`).join('');
    $$('[data-rm]', attachRow).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.rm; const f = c.files[i]; if (f && f.id) api('/api/files/' + encodeURIComponent(f.id), { method: 'DELETE' }).catch(() => {}); c.files.splice(i, 1); paintAttach(); autosize(); paintSend(); }));
    $$('[data-retry]', attachRow).forEach(b => b.addEventListener('click', () => { const f = c.files[+b.dataset.retry]; if (f && f.file) uploadItem(f); }));
    $$('[data-open]', attachRow).forEach(b => b.addEventListener('click', () => { const ready = c.files.filter(f => f.status === 'ready' && f.id); openFileViewer(c.files[+b.dataset.open], ready); }));
  };
  // Upload one picked file and read it; the chip shows the outcome, and a failed one can be retried.
  const uploadItem = async (item) => {
    item.status = 'uploading'; item.error = null; paintAttach(); paintSend();
    try {
      const fd = new FormData(); fd.append('file', item.file, item.file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || (res.status === 413 ? 'Too large for your plan' : res.status >= 500 ? 'The file reader is busy; try again' : 'Could not read the file')), { code: data.code });
      Object.assign(item, { id: data.file.id, chars: data.file.chars, stored: data.file.stored, status: 'ready' });
    } catch (e) { item.status = 'error'; item.error = (e && e.message) || 'Could not read the file'; toast(`${item.name}: ${item.error}`, 'bad'); }
    paintAttach(); paintSend();
  };
  const addFiles = async (list) => {
    const lim = state.fileLimits || { perQuestion: 2, maxMb: 10, accept: [] };
    const jobs = [];
    for (const file of Array.from(list || [])) {
      if (c.files.length >= lim.perQuestion) { toast(`Up to ${lim.perQuestion} file${lim.perQuestion > 1 ? 's' : ''} per question on your plan`, 'bad'); break; }
      if (file.size > lim.maxMb * 1048576) { toast(`${file.name} is over ${lim.maxMb} MB`, 'bad'); continue; }
      const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      if (lim.accept.length && !lim.accept.includes(ext)) { toast(`${file.name}: that file type is not supported`, 'bad'); continue; }
      const item = { name: file.name, size: file.size, type: file.type, status: 'uploading', id: null, chars: 0, error: null, file };
      c.files.push(item); jobs.push(item);
    }
    paintAttach(); autosize(); paintSend();
    for (const item of jobs) await uploadItem(item);
  };
  const submit = () => {
    if (running()) { stopRun(o.threadId); return; }
    const text = ta.value.trim(); if (!text) return;
    if (c.files.some(f => f.status === 'uploading')) { toast('One moment, a file is still being read', 'bad'); return; }
    if (c.files.some(f => f.status === 'error')) { toast('A file could not be read. Retry it or remove it before sending.', 'bad'); return; }
    const attachments = c.files.filter(f => f.status === 'ready' && f.id).map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, chars: f.chars, stored: f.stored }));
    c.files = [];
    ta.value = ''; autosize(); paintAttach(); paintSend(); closePop();
    o.onSubmit({ text, mode: c.mode, tier: c.tier, focus: c.focus, attachments });
  };
  ta.addEventListener('input', () => { autosize(); paintSend(); if (o.onInput) o.onInput(ta.value); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  send.addEventListener('click', submit);
  $$('[data-mode]', el).forEach(b => b.addEventListener('click', () => { c.mode = b.dataset.mode; if (c.mode === 'research' && c.tier === 'quick') c.tier = 'default'; paintChips(); ta.focus(); }));
  $('[data-tier]', el).addEventListener('click', (e) => {
    const btn = e.currentTarget;
    openPop(btn, `<div class="pop-h">Model</div>` + menuItems(Object.entries(TIERS).map(([k, t]) => ({ key: k, label: t.label, desc: t.desc, icon: t.icon })), c.tier), {
      align: 'right', onMount: pop => $$('[data-key]', pop).forEach(b => b.addEventListener('click', () => { c.tier = b.dataset.key; paintChips(); closePop(); ta.focus(); }))
    });
  });
  $('[data-focus]', el).addEventListener('click', (e) => {
    const btn = e.currentTarget;
    openPop(btn, `<div class="pop-h">Focus</div>` + menuItems(Object.entries(FOCI).map(([k, f]) => ({ key: k, label: f.label, desc: f.desc, icon: f.icon })), c.focus), {
      align: 'right', onMount: pop => $$('[data-key]', pop).forEach(b => b.addEventListener('click', () => { c.focus = b.dataset.key; paintChips(); closePop(); ta.focus(); }))
    });
  });
  attachBtn.addEventListener('click', () => {
    const inp = $('#fileInput'); inp.accept = (state.fileLimits && state.fileLimits.accept.length ? state.fileLimits.accept.join(',') : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,image/*');
    inp.onchange = () => { addFiles(inp.files); inp.value = ''; ta.focus(); };
    inp.click();
  });
  // Drop files onto the composer, or paste them.
  el.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('dropping'); } });
  el.addEventListener('dragleave', () => el.classList.remove('dropping'));
  el.addEventListener('drop', e => { el.classList.remove('dropping'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  ta.addEventListener('paste', e => { const files = e.clipboardData && e.clipboardData.files; if (files && files.length) { e.preventDefault(); addFiles(files); } });
  if (o.initial) { ta.value = o.initial; }
  paintChips(); paintAttach(); paintSend();
  requestAnimationFrame(autosize);
  el._composer = { el, ta, refresh() { paintSend(); paintAttach(); }, set(v) { ta.value = v; autosize(); paintSend(); ta.focus(); ta.setSelectionRange(v.length, v.length); }, get mode() { return c.mode; } };
  return el;
}

// ---------- Plans ----------
function caps() { return (state.plan && state.plan.caps) || { graph: 'preview', discover: 'locked' }; }
/** Plan names by key, including the keys used before September 2026. */
const PLAN_NAMES = { free: 'Free', essentials: 'Essentials', professional: 'Professional', enterprise: 'Enterprise', pro: 'Essentials', team: 'Professional' };
const PLAN_ORDER = ['free', 'essentials', 'professional', 'enterprise'];
function planLabel(key) { return PLAN_NAMES[key] || key || ''; }
function nextPlanName(key) { const k = key === 'pro' ? 'essentials' : key === 'team' ? 'professional' : key; const i = PLAN_ORDER.indexOf(k); return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_NAMES[PLAN_ORDER[i + 1]] : ''; }
function upgradeCard(title, body, plan) {
  const free = !state.plan || state.plan.key === 'free';
  return `<div class="upgrade-card">${icon('sparkles', 20)}<div><b>${esc(title)}</b><p>${esc(body)}</p></div><a class="btn primary sm" href="/pricing" title="See plans; every plan starts with a free trial">${free ? `Try ${esc(plan)} free` : `Upgrade to ${esc(plan)}`}</a></div>`;
}

// ---------- Home ----------
// Suggested questions come from the person's own graph (see /api/prompts) and only once it has started to form.
const ASPECTS = {
  topic: { label: 'Topic', icon: 'lightbulb', tip: 'Deepens a topic in your graph' },
  entity: { label: 'Entity', icon: 'compare', tip: 'Adds a tool, company, product or place to your graph' },
  goal: { label: 'Goal', icon: 'map', tip: 'Records a goal in your graph' },
  expertise: { label: 'Expertise', icon: 'graduation', tip: 'Shows Ricorsa your level in an area' },
  style: { label: 'Style', icon: 'pen', tip: 'Teaches Ricorsa how you like answers' },
};
async function loadPrompts() {
  const stamp = state.graph ? `${state.graph.events}:${state.graph.updatedAt}` : '0';
  if (state.promptsStamp === stamp && state.prompts) return state.prompts;
  try { const r = await api('/api/prompts'); state.prompts = r.items || []; state.promptsStamp = stamp; } catch { state.prompts = state.prompts || []; }
  return state.prompts;
}
function tilesHtml(items) {
  if (!items || !items.length) return '';
  return `<div class="tiles-head">${icon('loop', 14)}<span>Suggested from your graph</span></div><div class="tiles">${items.map((t, i) => { const a = ASPECTS[t.aspect] || ASPECTS.topic; return `<button type="button" class="tile" data-tile="${i}" title="${esc(t.why || a.tip)}">${icon(a.icon, 17)}<span>${esc(t.q)}</span><em class="aspect">${esc(a.label)}</em></button>`; }).join('')}</div>`;
}
function learnLine() {
  const g = state.graph; if (!g) return '';
  if (g.paused) return `<div class="learn-line">${icon('pause', 14)}<span>Learning is paused, your questions aren’t shaping the graph.</span><a href="#/graph">Resume</a></div>`;
  if (!Object.keys(g.nodes).length) return '';
  const tops = topNodes('topic', 3).map(n => n.label);
  return `<div class="learn-line">${icon('loop', 15)}<span>Learning from ${g.events} conversation${g.events === 1 ? '' : 's'}${tops.length ? ' · lately: ' + esc(tops.join(', ')) : ''}</span><a href="#/graph">Your graph</a></div>`;
}
function quotaNotice() {
  const p = state.plan, u = state.usage; if (!p) return '';
  if (state.user && state.user.admin) return ''; // admins have no counted limits
  if (p.status && !['ACTIVE', 'APPROVAL_PENDING'].includes(p.status) && p.key !== 'free') return `<div class="notice">${icon('info', 17)}<div>Your subscription is ${esc(String(p.status).toLowerCase())}. <a href="/account">Fix it on the Account page</a> to keep your ${esc(p.name)} limits.</div></div>`;
  if (u.today >= p.questionsPerDay) return `<div class="notice">${icon('info', 17)}<div>You have used today\u2019s ${p.questionsPerDay} questions on the ${esc(p.name)} plan. ${p.key === 'free' ? '<a href="/pricing">Start a free trial</a> for up to 300 a day.' : 'The counter resets at midnight UTC.'}</div></div>`;
  if (p.key === 'free' && u.today >= Math.max(1, p.questionsPerDay - 3)) return `<div class="notice info">${icon('info', 17)}<div>${p.questionsPerDay - u.today} free question${p.questionsPerDay - u.today === 1 ? '' : 's'} left today. <a href="/pricing">See plans</a>.</div></div>`;
  return '';
}
function renderHome() {
  const main = $('#main');
  main.innerHTML = `<div class="view">${topbarHtml('')}<div class="scroll"><div class="home">
    <div class="hero-mark"><span class="logomark" style="width:48px;height:48px">${LOGO_SVG(48)}</span>${WORDMARK(34).replace('class="wordmark"', 'class="wordmark big"')}</div>
    <div class="tagline">Ask anything. Get a sourced answer, and be understood a little better each time.</div>
    ${learnLine()}
    <div data-notice>${quotaNotice()}</div>
    <div data-composer></div>
    <div data-tiles>${tilesHtml(state.prompts)}</div>
  </div></div></div>`;
  const comp = createComposer({
    variant: 'hero', initial: state.composerDraft,
    onInput: v => { state.composerDraft = v; },
    onSubmit: ({ text, mode, tier, focus, attachments }) => { state.composerDraft = ''; startThread(text, { mode, tier, focus, attachments }); }
  });
  $('[data-composer]', main).appendChild(comp);
  const wireTiles = () => $$('[data-tile]', main).forEach(b => b.addEventListener('click', () => comp._composer.set(state.prompts[+b.dataset.tile].q)));
  wireTiles();
  loadPrompts().then(items => { const box = $('[data-tiles]', main); if (box && box.isConnected) { box.innerHTML = tilesHtml(items); wireTiles(); } });
  wireTopbar(main);
  if (!('ontouchstart' in window)) comp._composer.ta.focus();
}
function onSampleResolved() {}
function topbarHtml(title, right = '') {
  return `<div class="topbar" data-topbar><button type="button" class="menu-btn" data-menu aria-label="Open menu">${icon('menu', 20)}</button><div class="title">${esc(title)}</div>${right}</div>`;
}
function wireTopbar(root) {
  const m = $('[data-menu]', root); if (m) m.addEventListener('click', openDrawer);
  const sc = $('.scroll', root), tb = $('[data-topbar]', root);
  if (sc && tb) sc.addEventListener('scroll', () => tb.classList.toggle('scrolled', sc.scrollTop > 24), { passive: true });
}

// ---------- Thread ----------
const paintQueue = new Map();
function liveRender(thread, turn, final) {
  if (state.route.name === 'thread' && state.route.id === thread.id) {
    const sec = $(`[data-turn="${turn.id}"]`);
    if (sec) {
      if (final) { paintTurn(sec, thread, turn); }
      else { let fn = paintQueue.get(turn.id); if (!fn) { fn = raf(() => { const s = $(`[data-turn="${turn.id}"]`); if (s) paintTurn(s, thread, turn); }); paintQueue.set(turn.id, fn); } fn(); }
    }
    const comp = $('.dock .composer'); if (comp && comp._composer) comp._composer.refresh();
  }
  if (final) paintQueue.delete(turn.id);
}
function renderThread(id) {
  const main = $('#main');
  const cached = state.threadCache[id];
  if (!cached) {
    main.innerHTML = `<div class="view">${topbarHtml('')}<div class="scroll"><div class="col thread-col"><div class="skel" style="margin-top:40px"><i></i><i></i><i></i><i></i></div></div></div></div>`; wireTopbar(main);
    loadThread(id).then(() => { if (state.route.name === 'thread' && state.route.id === id) renderThread(id); })
      .catch(() => { if (state.route.name === 'thread' && state.route.id === id) { main.innerHTML = `<div class="view">${topbarHtml('')}<div class="scroll"><div class="col"><div class="empty">${icon('info', 28)}<div>That thread isn\u2019t in your library.</div><p><a href="#/">Start a new one</a></p></div></div></div></div>`; wireTopbar(main); } });
    return;
  }
  const thread = cached;
  const right = `<button type="button" class="btn sm ghost" data-share>${icon('share', 15)}<span>Share</span></button><button type="button" class="icon-btn" data-more aria-label="Thread options" aria-haspopup="menu" aria-expanded="false">${icon('more', 18)}</button>`;
  main.innerHTML = `<div class="view">${topbarHtml(thread.title, right)}<div class="scroll" id="threadScroll"><div class="col thread-col" id="turns">${thread.turns.map(t => turnHtml(thread, t)).join('')}</div></div><div class="dock" data-dock></div></div>`;
  thread.turns.forEach(t => { const sec = $(`[data-turn="${t.id}"]`, main); paintTurn(sec, thread, t); wireTurn(sec, thread, t); });
  const last = thread.turns[thread.turns.length - 1];
  const comp = createComposer({ variant: 'compact', placeholder: 'Ask a follow-up', threadId: thread.id, mode: last ? last.mode : undefined, tier: last ? last.tier : undefined, focus: last ? last.focus : undefined,
    onSubmit: ({ text, mode, tier, focus, attachments }) => followUp(thread, text, { mode, tier, focus, attachments }) });
  $('[data-dock]', main).appendChild(comp);
  $('[data-share]', main).addEventListener('click', async () => { const ok = await copyText(threadMarkdown(thread)); toast(ok ? 'Copied the thread as Markdown' : 'Could not copy', ok ? 'ok' : 'bad'); });
  $('[data-more]', main).addEventListener('click', e => threadMenu(e.currentTarget, thread));
  wireTopbar(main);
  const sc = $('#threadScroll', main);
  if (thread.turns.length > 1) { const lastSec = $(`[data-turn="${last.id}"]`, main); if (lastSec) sc.scrollTop = lastSec.offsetTop - 12; }
}
function threadMenu(anchor, thread) {
  const spaces = state.spaces;
  const items = [{ key: 'rename', label: 'Rename', icon: 'edit' }, { key: 'provenance', label: 'Provenance', desc: 'Where this thread began and its hash chain', icon: 'loop' }, { key: 'export', label: 'Export as Markdown', icon: 'download' }];
  if (spaces.length) items.push({ key: 'move', label: thread.spaceId ? 'Move to another Space' : 'Add to a Space', icon: 'layers' });
  if (thread.spaceId) items.push({ key: 'unspace', label: 'Remove from Space', icon: 'x' });
  items.push({ key: 'delete', label: 'Delete thread', icon: 'trash', danger: true });
  openPop(anchor, menuItems(items), { align: 'right', onMount: pop => $$('[data-key]', pop).forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.key; closePop();
    if (k === 'export') exportThread(thread);
    if (k === 'provenance') provenanceModal(thread);
    if (k === 'rename') openModal(`<h2>Rename thread</h2><div class="field"><input type="text" id="rn" value="${esc(thread.title)}" maxlength="120"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="rnOk">Save</button></div>`, { onMount: ov => { const save = async () => { const v = $('#rn').value.trim(); closeModal(); if (v) { thread.title = v; touchThread(thread); render(); try { await api('/api/threads/' + encodeURIComponent(thread.id), { method: 'PATCH', body: { title: v } }); } catch (e) { apiToast(e); } } }; $('#rnOk').addEventListener('click', save); $('#rn').addEventListener('keydown', e => { if (e.key === 'Enter') save(); }); } });
    if (k === 'move') openModal(`<h2>Move to a Space</h2><p class="sub">The Space’s instructions apply to new questions in this thread.</p>${spaces.map(s => `<button type="button" class="pop-item${thread.spaceId === s.id ? ' on' : ''}" data-space="${s.id}"><span style="font-size:18px">${esc(s.emoji)}</span><span><div class="t">${esc(s.name)}</div><div class="d">${esc(truncate(s.description, 80))}</div></span>${icon('check', 16, 'class="chk"')}</button>`).join('')}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button></div>`, { onMount: ov => $$('[data-space]', ov).forEach(b => b.addEventListener('click', async () => { thread.spaceId = b.dataset.space; touchThread(thread); closeModal(); render(); toast('Moved to ' + getSpace(thread.spaceId).name); try { await api('/api/threads/' + encodeURIComponent(thread.id), { method: 'PATCH', body: { spaceId: thread.spaceId } }); } catch (e) { apiToast(e); } })) });
    if (k === 'unspace') { thread.spaceId = null; touchThread(thread); render(); api('/api/threads/' + encodeURIComponent(thread.id), { method: 'PATCH', body: { spaceId: null } }).catch(apiToast); }
    if (k === 'delete') confirmDelete(thread);
  })) });
}
function provenanceModal(thread) {
  if (caps().graph !== 'full') { openModal(`<h2>${icon('loop', 20)}Provenance</h2><p class="sub">Every thread and every node carries a cryptographic id that traces where it began. The full chain is part of the full identity graph.</p>${upgradeCard('See the provenance chain', 'Essentials shows the origin of this thread, the hash of every turn, and which graph nodes each one added.', 'Essentials')}<div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>`); return; }
  const o = thread.origin || null;
  const rows = [];
  if (o) {
    rows.push(['Origin', o.kind === 'discover' ? 'Discover idea' : o.kind === 'graph' ? 'A node in your graph' : 'Asked directly']);
    if (o.title) rows.push([o.kind === 'graph' ? 'Node' : 'Idea', o.title]);
    if (o.nodeId) rows.push(['Node id', o.nodeId]);
    if (o.ideaId) rows.push(['Idea id', o.ideaId]);
    if (o.graphHash) rows.push(['Graph fingerprint', o.graphHash]);
    if (o.subject) rows.push(['Subject', o.subject]);
    if (o.category) rows.push(['Category', o.category]);
    if (o.at) rows.push(['When', new Date(o.at).toLocaleString()]);
  }
  const chainHtml = (thread.turns || []).map((t, i) => `<div class="prov-row"><span class="n">${i + 1}</span><div><div class="t">${esc(truncate(t.q, 90))}</div><div class="u">${esc(t.lineage || 'pending')}</div></div></div>`).join('');
  openModal(`<h2>${icon('loop', 20)}Provenance</h2><p class="sub">Every thread and turn carries a SHA-256 id. Ideas from Discover are hashed against the exact state of your graph they came from, each question chains onto the last, and any node this thread adds to your graph records this lineage.</p>
    ${rows.length ? `<div class="prov">${rows.map(([k, v]) => `<div class="prov-row"><span class="k">${esc(k)}</span><span class="u">${esc(v)}</span></div>`).join('')}</div>` : '<p class="sub">No origin record (older thread).</p>'}
    <div class="sec-h" style="font-size:14px;margin-top:14px">Turn chain</div><div class="prov">${chainHtml || '<div class="sub">No turns yet.</div>'}</div>
    <div class="modal-actions"><button type="button" class="btn" id="provCopy">${icon('copy', 14)}Copy as JSON</button><button type="button" class="btn primary" data-close>Done</button></div>`, {
    onMount: () => $('#provCopy').addEventListener('click', async () => { const ok = await copyText(JSON.stringify({ thread: thread.id, origin: o, turns: (thread.turns || []).map(t => ({ id: t.id, q: t.q, lineage: t.lineage || null })) }, null, 2)); toast(ok ? 'Provenance copied' : 'Could not copy', ok ? 'ok' : 'bad'); })
  });
}
function confirmDelete(thread) {
  openModal(`<h2>Delete this conversation?</h2><p class="sub">\u201c${esc(thread.title)}\u201d will be removed from your library. This can\u2019t be undone.</p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn danger" id="delOk">Delete</button></div>`, {
    onMount: () => $('#delOk').addEventListener('click', async () => { stopRun(thread.id); closeModal(); try { await deleteThreadRemote(thread.id); } catch (e) { apiToast(e, 'Could not delete'); return; } renderSidebar(); if (state.route.name === 'thread' && state.route.id === thread.id) go('#/library'); else render(); toast('Conversation deleted'); })
  });
}
/** Delete several conversations at once (the Recent list). */
function confirmDeleteMany(threads) {
  const list = (threads || []).filter(Boolean); if (!list.length) return;
  openModal(`<h2>Delete ${list.length} recent conversation${list.length === 1 ? '' : 's'}?</h2><p class="sub">These will be removed from your library. Your identity graph keeps what it has already learned. This can\u2019t be undone.</p><ul class="del-list">${list.map(t => `<li>${esc(truncate(t.title, 70))}</li>`).join('')}</ul><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn danger" id="delManyOk">Delete all</button></div>`, {
    onMount: () => $('#delManyOk').addEventListener('click', async () => {
      closeModal();
      let n = 0, failed = 0; const open = state.route.name === 'thread' ? state.route.id : null;
      for (const t of list) { stopRun(t.id); try { await deleteThreadRemote(t.id); n++; } catch { failed++; } }
      renderSidebar(); if (open && !getThreadSummary(open)) go('#/home'); else render();
      toast(failed ? `Deleted ${n}, ${failed} could not be deleted` : `Deleted ${n} conversation${n === 1 ? '' : 's'}`, failed ? 'bad' : 'ok');
    })
  });
}
function turnHtml(thread, t) {
  return `<section class="turn" data-turn="${t.id}">
    <h1 class="q">${esc(t.q)}</h1>
    <div class="q-meta" data-meta></div>
    <div class="tabs" role="tablist">
      <button type="button" class="tab on" role="tab" data-tab="answer">${icon('sparkles', 15)}Answer</button>
      <button type="button" class="tab" role="tab" data-tab="sources">${icon('book', 15)}Sources <span class="n" data-src-n>0</span></button>
    </div>
    <div data-pane="answer">
      <div class="src-row" data-src-row hidden></div>
      <div class="sec-h">${icon('sparkles', 17)}Answer <span class="status" data-status></span></div>
      <div class="answer" data-answer></div>
      <div data-note></div>
      <div class="actions" data-actions hidden></div>
      <div data-learned hidden></div>
      <div class="related" data-related hidden></div>
    </div>
    <div data-pane="sources" hidden></div>
  </section>`;
}
function paintTurn(sec, thread, t) {
  const space = thread.spaceId ? getSpace(thread.spaceId) : null;
  const mode = MODES[t.mode] || MODES.search; const pills = [`<span class="pill ${esc(t.mode)}">${icon(mode.icon, 12)}${mode.label}</span>`];
  if (t.focus && t.focus !== 'web' && FOCI[t.focus]) pills.push(`<span class="pill">${icon(FOCI[t.focus].icon, 12)}${FOCI[t.focus].label}</span>`);
  if (space) pills.push(`<span class="pill space">${esc(space.emoji)} ${esc(space.name)}</span>`);
  for (const a of (t.attachments || [])) pills.push(`<button type="button" class="pill file" data-file="${esc(a.id)}" title="Open ${esc(a.name)} · ${esc(String(a.chars || 0))} characters read">${icon(fileKind(a.name).icon, 12)}${esc(a.name.length > 34 ? a.name.slice(0, 31) + '…' : a.name)}</button>`);
  if (thread.origin && thread.origin.kind === 'discover' && thread.origin.ideaId) pills.push(`<span class="pill hashpill" title="Started from a Discover idea. Idea id ${esc(thread.origin.ideaId)} · graph ${esc(thread.origin.graphHash || '')}">${icon('compass', 12)}From Discover · ${esc(shortHash(thread.origin.ideaId))}</span>`);
  if (thread.origin && thread.origin.kind === 'graph' && thread.origin.nodeId) pills.push(`<a class="pill hashpill" href="#/graph?node=${encodeURIComponent(thread.origin.nodeId)}" title="Started from a node in your graph: ${esc(thread.origin.title || thread.origin.nodeId)}. Open it in the brain.">${icon('brain', 12)}From your graph · ${esc(truncate(thread.origin.title || thread.origin.nodeId, 28))}</a>`);
  if (t.lineage) pills.push(`<span class="pill hashpill" title="Lineage hash ${esc(t.lineage)}">${icon('loop', 12)}${esc(shortHash(t.lineage))}</span>`);
  pills.push(`<span>${relTime(t.createdAt)}</span>`);
  $('[data-meta]', sec).innerHTML = pills.join('');
  $$('[data-file]', sec).forEach(b => b.addEventListener('click', () => { const list = t.attachments || []; openFileViewer(list.find(a => a.id === b.dataset.file), list); }));

  const running = t.status === 'running';
  const sources = t.sources || [];
  $('[data-src-n]', sec).textContent = sources.length;
  const row = $('[data-src-row]', sec);
  if (sources.length) {
    const shown = sources.slice(0, 3), rest = sources.slice(3);
    row.hidden = false;
    row.innerHTML = shown.map(s => srcCard(s)).join('') + (rest.length ? `<button type="button" class="src more" data-open-sources><span class="favs">${rest.slice(0, 4).map(s => `<span class="favi" style="background:${colorFor(s.domain || s.title)}">${esc((s.domain || s.title)[0] || '?')}</span>`).join('')}</span><span class="t">View ${rest.length} more</span></button>` : '');
  } else { row.hidden = true; row.innerHTML = ''; }

  const status = $('[data-status]', sec);
  if (running && !t.answer) status.innerHTML = `<span class="dots">${esc(t.statusText || (t.mode === 'research' ? 'Working through it' : 'Thinking'))}</span>`;
  else if (t.status === 'stopped') status.textContent = 'Stopped';
  else status.textContent = '';

  const ans = $('[data-answer]', sec);
  if (t.answer) renderAnswerInto(ans, t.answer, sources, running, thread);
  else if (running) ans.innerHTML = `<div class="skel"><i></i><i></i><i></i><i></i></div>`;
  else if (t.status === 'pending') ans.innerHTML = `<div class="skel"><i></i><i></i><i></i></div>`;
  else ans.innerHTML = '';

  const note = $('[data-note]', sec); let noteHtml = '';
  if (t.status === 'error' && t.error) {
    const planIssue = PLAN_CODES.has(t.error);
    noteHtml = `<div class="err-box">${icon('alert', 17)}<div>${esc(t.errorMessage || ERROR_COPY[t.error] || ERROR_COPY.upstream_error)}${planIssue ? ' <a href="/pricing">See plans</a>.' : ''}</div>${!planIssue ? `<button type="button" class="btn sm" data-retry>${icon('refresh', 14)}Retry</button>` : ''}</div>`;
  }
  if (t.status === 'done' && t.truncated) noteHtml += `<div class="answer-note warn">${icon('alert', 14)}This answer ran unusually long and was trimmed at the end. Ask a follow-up to keep going.</div>`;
  if (t.status === 'done' && t.tierApplied && t.tier && t.tierApplied !== t.tier) noteHtml += `<div class="answer-note">${icon('info', 14)}Answered with the ${TIERS[t.tierApplied] ? TIERS[t.tierApplied].label : t.tierApplied} model, your plan doesn’t include ${TIERS[t.tier] ? TIERS[t.tier].label : t.tier}.</div>`;
  if (t.tools && t.tools.length) {
    const byServer = {}; for (const c of t.tools) (byServer[c.server] = byServer[c.server] || []).push(c);
    noteHtml += `<div class="answer-note tools-note">${icon('plug', 14)}<span>${running ? 'Using' : 'Used'} your connectors: ${Object.entries(byServer).map(([srv, calls]) => `<b>${esc(srv)}</b> (${calls.map(c => esc(c.name.replace(/_/g, ' ')) + (c.error ? ' ✕' : '')).join(', ')})`).join(' · ')}</span></div>`;
  }
  if (t.status === 'done') { const files = (t.attachments || []).length, vault = (t.sources || []).filter(s => s.domain === 'VDRPros Vault').length, web = (t.sources || []).length - vault; noteHtml += `<div class="answer-note">${icon('info', 14)}${vault && web ? `Answered from ${vault} page${vault === 1 ? '' : 's'} in your VDRPros Vault and web sources retrieved when you asked.` : vault ? `Answered from ${vault} page${vault === 1 ? '' : 's'} in your VDRPros Vault; the numbered citations open the pages.` : files && web ? 'Answered from your files and web sources retrieved when you asked.' : files ? `Answered from ${files === 1 ? 'the file you attached' : 'the files you attached'}; the web was not searched. Ask to search the web if you want outside context.` : 'Sources were retrieved from the web when you asked.'} Ricorsa can still misread them, so verify important details.</div>`; }
  note.innerHTML = noteHtml;

  const actions = $('[data-actions]', sec);
  const canAct = (t.status === 'done' || t.status === 'stopped' || (t.status === 'error' && t.answer)) && !running;
  actions.hidden = !canAct;
  if (canAct) {
    actions.innerHTML = `
      <button type="button" class="btn ghost" data-act="share">${icon('share', 15)}Share</button>
      <button type="button" class="btn ghost" data-act="export">${icon('download', 15)}Export</button>
      <button type="button" class="btn ghost" data-act="rewrite" aria-haspopup="menu" aria-expanded="false">${icon('refresh', 15)}Rewrite</button>
      <span class="spacer"></span>
      <button type="button" class="icon-btn${t.vote === 'up' ? ' on' : ''}" data-act="up" aria-label="Good answer">${icon('thumbUp', 16)}</button>
      <button type="button" class="icon-btn${t.vote === 'down' ? ' on' : ''}" data-act="down" aria-label="Poor answer">${icon('thumbDown', 16)}</button>
      <button type="button" class="icon-btn" data-act="copy" aria-label="Copy answer">${icon('copy', 16)}</button>`;
  }
  const learnedBox = $('[data-learned]', sec);
  learnedBox.innerHTML = (t.status === 'done' && t.learned) ? learnedHtml(thread, t) : '';
  learnedBox.hidden = !learnedBox.innerHTML;
  const rel = $('[data-related]', sec);
  const related = t.related || [];
  if (t.status === 'done' && related.length) {
    rel.hidden = false;
    rel.innerHTML = `<div class="sec-h">${icon('layers', 17)}Related</div><div class="related-list">${related.map((r, i) => `<button type="button" class="related-item" data-rel="${i}"><span>${esc(r)}</span>${icon('plus', 17)}</button>`).join('')}</div>`;
  } else { rel.hidden = true; rel.innerHTML = ''; }

  const spane = $('[data-pane="sources"]', sec);
  spane.innerHTML = sources.length
    ? `<div class="sources-list">${sources.map(s => `<div class="source-card" data-src-n="${s.n}"><span class="n">${s.n}</span><span class="favi" style="background:${colorFor(s.domain || s.title)};margin-top:2px">${esc((s.domain || s.title)[0] || '?')}</span><div><div class="t">${esc(s.title)}</div><div class="u">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(/#\/vault\//.test(s.url) ? 'VDRPros Vault · opens the page in the viewer' : s.url)}</a>` : esc(s.domain || '')}</div></div>${s.url ? `<a class="icon-btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open">${icon('external', 15)}</a>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">${icon('book', 28)}<div>${running ? 'Sources arrive before the answer is written.' : 'No sources were used for this answer.'}</div></div>`;
}
/**
 * A node as a chip. With the node record itself (the Graph page lists) the chip is live: it carries the weight as a
 * fill, marks what is new, strengthening or fading, flags places, and can be hovered (lights the node in the brain),
 * clicked (opens the node panel) and forgotten (the ×).
 */
function nodeChip(type, label, extra = '', id = '', n = null) {
  const T = NODE_TYPES[type]; if (!T) return '';
  let cls = 'nchip', attrs = '';
  if (n) {
    const now = Date.now();
    cls += ' live';
    if (now - n.firstSeen < 7 * DAY_MS) cls += ' new'; else if (isEmergingNode(n, now)) cls += ' em';
    if (isFadingNode(n, now)) cls += ' fade';
    if (isPlaceNode(n)) cls += ' place';
    const facts = `weight ${(n.weight * 100).toFixed(0)} · seen ${n.count}× · first ${relTime(n.firstSeen)} · last ${relTime(n.lastSeen)}${n.geoName ? ' · ' + truncate(n.geoName, 60) : ''}`;
    attrs = ` data-type="${esc(type)}" data-w="${Number(n.weight).toFixed(3)}" data-count="${n.count}" data-first="${n.firstSeen}" data-last="${n.lastSeen}" data-label="${esc(String(label).toLowerCase())}" tabindex="0" role="button" style="--w:${clamp(n.weight, 0.05, 1).toFixed(2)};--ch:${T.hex}" title="${esc(label)} · ${esc(facts)} · click for details"`;
  }
  return `<span class="${cls}" data-node="${esc(id)}"${attrs}><span class="dot ${T.shape}" style="background:${T.hex}"></span>${n && isPlaceNode(n) ? icon('pin', 11, 'class="pin"') : ''}<span class="lbl">${esc(label)}</span>${extra}${id ? `<button type="button" data-forget="${esc(id)}" aria-label="Forget ${esc(label)}" title="Forget">${icon('x', 10)}</button>` : ''}</span>`;
}
function learnedHtml(thread, t) {
  const L = t.learned; if (!L) return '';
  const chips = [];
  normList(L.topics, 4).forEach(x => chips.push(nodeChip('topic', x)));
  normList(L.entities, 4).forEach(x => chips.push(nodeChip('entity', x)));
  normList(L.goals, 2).forEach(x => chips.push(nodeChip('goal', x)));
  (Array.isArray(L.expertise) ? L.expertise : []).slice(0, 3).forEach(x => { const a = cleanLabel(x); if (a.length >= 2) chips.push(nodeChip('expertise', a, x && x.level ? `<span class="lvl">${esc(x.level)}</span>` : '')); });
  normList(L.style, 3).forEach(x => chips.push(nodeChip('style', x)));
  const intent = truncate(String(typeof L.intent === 'string' ? L.intent : '').replace(/\s+/g, ' ').trim(), 220);
  if (!chips.length && !intent) return '';
  let status;
  if (t.learnedMerged) status = `<a class="lnk" href="#/graph">Added to your graph ${icon('arrowRight', 13)}</a>`;
  else if (state.graph && state.graph.paused) status = `<span class="muted">learning paused, not added</span>`;
  else status = `<span class="muted">not added</span>`;
  return `<div class="learned"><span class="lh">${icon('loop', 15)}Learned from this exchange</span>${chips.join('')}${status}${intent ? `<span class="intent">${esc(intent)}</span>` : ''}</div>`;
}
function srcCard(s) {
  const inner = `<span class="t">${esc(s.title)}</span><span class="m"><span class="favi" style="background:${colorFor(s.domain || s.title)}">${esc((s.domain || s.title)[0] || '?')}</span><span class="dom">${esc(s.domain || 'reference')}</span><span class="idx">${s.n}</span></span>`;
  return s.url ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${inner}</a>` : `<button type="button" class="src" data-open-sources>${inner}</button>`;
}
function wireTurn(sec, thread, t) {
  const showTab = (name) => {
    $$('[data-tab]', sec).forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $$('[data-pane]', sec).forEach(p => p.hidden = p.dataset.pane !== name);
  };
  sec.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]'); if (tab) { showTab(tab.dataset.tab); return; }
    if (e.target.closest('[data-open-sources]')) { showTab('sources'); return; }
    const cite = e.target.closest('.cite'); if (cite && cite.tagName !== 'A') { showTab('sources'); const card = $(`.source-card[data-src-n="${cite.dataset.n}"]`, sec); if (card) { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.style.borderColor = 'var(--accent)'; setTimeout(() => card.style.borderColor = '', 1500); } return; }
    const rel = e.target.closest('[data-rel]'); if (rel) { if (state.runs.has(thread.id)) { toast('Wait for the current answer to finish'); return; } followUp(thread, t.related[+rel.dataset.rel], { mode: t.mode === 'research' ? 'search' : t.mode, tier: t.tier, focus: t.focus }); return; }
    if (e.target.closest('[data-retry]')) { if (!state.runs.has(thread.id)) runTurn(thread, t); return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'copy') { const ok = await copyText((t.answer || '').trim()); toast(ok ? 'Answer copied' : 'Could not copy', ok ? 'ok' : 'bad'); }
    if (a === 'share') { const ok = await copyText(`**${t.q}**\n\n${(t.answer || '').trim()}\n\n- Ricorsa`); toast(ok ? 'Copied question and answer' : 'Could not copy', ok ? 'ok' : 'bad'); }
    if (a === 'export') exportThread(thread);
    if (a === 'up' || a === 'down') { t.vote = t.vote === a ? null : a; recordVote(thread, t, t.vote); paintTurn(sec, thread, t); if (t.vote) toast(t.vote === 'up' ? 'Noted, more like this' : 'Noted, Ricorsa will be more direct'); }
    if (a === 'rewrite') {
      const items = [{ key: 'again', label: 'Try again', desc: 'Same question, fresh answer', icon: 'refresh' }, { key: 'concise', label: 'More concise', desc: 'Shorter, just the essentials', icon: 'zap' }, { key: 'detailed', label: 'More detailed', desc: 'Longer, with more depth', icon: 'book' }];
      if (t.tier !== 'complex') items.push({ key: 'complex', label: 'Use the Reasoning model', desc: 'Slower, most capable', icon: 'brain' });
      if (t.mode !== 'research') items.push({ key: 'research', label: 'Switch to Research', desc: 'Full structured report', icon: 'book' });
      openPop(act, `<div class="pop-h">Rewrite</div>` + menuItems(items), { onMount: pop => $$('[data-key]', pop).forEach(b => b.addEventListener('click', () => { closePop(); if (state.runs.has(thread.id)) return; rewriteTurn(thread, t, b.dataset.key); })) });
    }
  });
}

// ---------- Discover: what your graph can become ----------
const DISCOVER_CATS = ['For you', 'Apps', 'Agents', 'Tools', 'Decentralized', 'Data & credentials', 'Content'];
const DISCOVER_HUES = { 'For you': 205, 'Apps': 190, 'Agents': 265, 'Tools': 150, 'Decentralized': 25, 'Data & credentials': 330, 'Content': 100 };
state.discoverCat = 'For you';
state.discoverGen = {};
state.discoverTried = {};
// ---------- Discover previews ----------
// Each idea card shows a small mock of the thing described: a window with the app's own name, menu,
// and the screen it would open on. The generator supplies a preview spec; older or curated ideas get one inferred.
const PV_LAYOUTS = ['dashboard', 'list', 'chat', 'form', 'table', 'map', 'editor', 'cards', 'profile', 'timeline'];
const PV_NAV = { 'For you': ['Home', 'Graph', 'Settings'], 'Apps': ['Home', 'Library', 'Settings'], 'Agents': ['Chat', 'Tasks', 'Log'], 'Tools': ['Tool', 'History', 'Export'], 'Decentralized': ['Profile', 'Consent', 'Network'], 'Data & credentials': ['Data', 'Schema', 'Export'], 'Content': ['Outline', 'Draft', 'Publish'] };
function cap(s) { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function inferPreview(it, cat) {
  const kind = String(it.kind || '').toLowerCase(), title = String(it.title || ''), text = (kind + ' ' + title + ' ' + (it.what || '')).toLowerCase();
  let layout = 'dashboard';
  if (/agent|assistant|bot|tutor|negotiat|watchdog|brief/.test(text)) layout = 'chat';
  else if (/checklist|generator|kit|calculator|template|prompt|glossary|tool/.test(text)) layout = 'form';
  else if (/dataset|export|schema|vocabulary|json/.test(text)) layout = 'table';
  else if (/credential|badge|claim|profile|did|identity document|consent/.test(text)) layout = 'profile';
  else if (/course|newsletter|talk|playbook|guide|lesson|syllabus/.test(text)) layout = 'editor';
  else if (/community|marketplace|union|match/.test(text)) layout = 'cards';
  else if (/queue|reading|feed|notes|knowledge|inbox|tracker/.test(text)) layout = 'list';
  else if (/map|geo|location|place|route/.test(text)) layout = 'map';
  else if (/review|weekly|timeline|history|receipt|log/.test(text)) layout = 'timeline';
  let name = title.replace(/^(a|an|your|the)\s+/i, '').split(/[,:]/)[0].split(' ').slice(0, 3).map(cap).join(' ');
  if (name.length > 18) name = name.split(' ').slice(0, 2).join(' ');
  const builds = (it.builds || []).map(cap);
  const items = builds.length ? builds : ['Overview', 'Details', 'Activity'];
  const cta = { chat: 'Send', form: 'Generate', profile: 'Share', table: 'Export', editor: 'Publish', cards: 'Join', map: 'Locate', timeline: 'Review', list: 'Add', dashboard: 'Refresh' }[layout];
  return { layout, name: name || cap(kind) || 'App', nav: PV_NAV[cat] || PV_NAV['For you'], items, stat: layout === 'dashboard' ? { label: items[0] || 'Signals', value: String(7 + (title.length % 41)) } : null, cta };
}
function normPreview(it, cat) {
  const p = it.preview && typeof it.preview === 'object' ? it.preview : null;
  const base = inferPreview(it, cat);
  if (!p) return base;
  const layout = PV_LAYOUTS.includes(p.layout) ? p.layout : base.layout;
  const list = Array.isArray(p.items) ? p.items.map(x => truncate(String(x || ''), 34)).filter(Boolean) : [];
  const nav = Array.isArray(p.nav) ? p.nav.map(x => truncate(String(x || ''), 14)).filter(Boolean).slice(0, 4) : [];
  return { layout, name: truncate(p.name || base.name, 20), nav: nav.length >= 2 ? nav : base.nav, items: list.length ? list.slice(0, 5) : base.items, stat: p.stat && p.stat.value ? { label: truncate(p.stat.label || '', 18), value: truncate(String(p.stat.value), 8) } : base.stat, cta: truncate(p.cta || base.cta, 14) };
}
function previewHtml(it, cat, seed, rich) {
  const pv = normPreview(it, cat); const hue = DISCOVER_HUES[cat] || 205;
  const e = esc; const w = (i, mod) => 30 + ((seed * 7 + i * 13) % mod);
  // The feature card is tall, so its screen shows more: every item, plus a details panel below.
  const items = pv.items; const n = rich ? 6 : 4;
  const panel = rich ? `<div class="pv-result"><b>${e(pv.nav[1] || 'Details')}</b><em style="width:88%"></em><em style="width:72%"></em><em style="width:80%"></em><em style="width:35%"></em></div>` : '';
  let body = '';
  if (pv.layout === 'dashboard') body = `<div class="pv-cols"><div class="pv-stat"><b>${e(pv.stat ? pv.stat.value : '12')}</b><span>${e(pv.stat ? pv.stat.label : items[0] || '')}</span></div><div class="pv-chart">${[0,1,2,3,4,5].map(i => `<i style="height:${w(i, 60)}%"></i>`).join('')}</div></div><div class="pv-rows">${items.slice(0, rich ? 5 : 3).map(t => `<div class="pv-row"><i></i><span>${e(t)}</span><em style="width:${w(t.length, 22)}%"></em></div>`).join('')}</div>${panel}`;
  else if (pv.layout === 'list') body = `<div class="pv-search">${e('Search ' + pv.name.toLowerCase())}</div><div class="pv-rows">${items.slice(0, n).map((t, i) => `<div class="pv-row"><i class="av"></i><span>${e(t)}</span><em style="width:${w(i, 24)}%"></em></div>`).join('')}</div>${panel}`;
  else if (pv.layout === 'chat') { const m = pv.items; const msgs = [m[0] || 'Here is what changed today.', m[1] || 'Go deeper on the second one.', m[2] || 'On it. Two sources, one caveat.'].concat(rich ? [m[3] || 'Anything else you want watched?', m[4] || 'Add the new one from last week.', m[5] || 'Added. I will brief you Monday.'] : []); body = `<div class="pv-chat">${msgs.map((m, i) => `<div class="pv-msg ${i % 2 ? 'u' : 'a'}">${e(m)}</div>`).join('')}</div><div class="pv-compose"><span>Message ${e(pv.name)}</span><b>${e(pv.cta)}</b></div>`; }
  else if (pv.layout === 'form') body = `<div class="pv-form">${items.slice(0, rich ? 4 : 3).map(t => `<label><span>${e(t)}</span><i></i></label>`).join('')}<b class="pv-btn">${e(pv.cta)}</b></div>${rich ? `<div class="pv-result"><b>Result</b><em style="width:88%"></em><em style="width:72%"></em><em style="width:80%"></em><em style="width:35%"></em></div>` : ''}`;
  else if (pv.layout === 'table') body = `<div class="pv-table"><div class="pv-tr head"><span>${e(pv.nav[0] || 'Field')}</span><span>Type</span><span>Value</span></div>${items.slice(0, rich ? 6 : 4).map((t, i) => `<div class="pv-tr"><span>${e(t)}</span><em style="width:${w(i, 30)}%"></em><em style="width:${w(i + 3, 30)}%"></em></div>`).join('')}</div>${panel}`;
  else if (pv.layout === 'map') body = `<div class="pv-map"><div class="pv-pins">${[0,1,2,3].slice(0, rich ? 4 : 3).map(i => `<i style="left:${18 + w(i, 55)}%;top:${15 + w(i + 5, 50)}%"></i>`).join('')}</div><div class="pv-side">${items.slice(0, rich ? 5 : 3).map(t => `<span>${e(t)}</span>`).join('')}</div></div>${panel}`;
  else if (pv.layout === 'editor') body = `<div class="pv-editor"><div class="pv-outline">${items.slice(0, rich ? 7 : 4).map((t, i) => `<span class="${i === 0 ? 'on' : ''}">${e(t)}</span>`).join('')}</div><div class="pv-doc"><b>${e(items[0] || pv.name)}</b><em style="width:92%"></em><em style="width:78%"></em><em style="width:85%"></em><em style="width:40%"></em>${rich ? `<b class="sub">${e(items[1] || 'Next')}</b><em style="width:88%"></em><em style="width:94%"></em><em style="width:66%"></em><em style="width:90%"></em><em style="width:52%"></em>` : ''}</div></div>`;
  else if (pv.layout === 'cards') body = `<div class="pv-cards">${items.slice(0, rich ? 6 : 4).map(t => `<div class="pv-card"><i></i><span>${e(t)}</span><b>${e(pv.cta)}</b></div>`).join('')}</div>${panel}`;
  else if (pv.layout === 'profile') body = `<div class="pv-profile"><i class="pv-avatar"></i><div><b>${e(pv.name)}</b><span>${e(it.kind || cat)} · verified</span></div><div class="pv-badges">${pv.items.slice(0, 4).map(t => `<span>${e(t)}</span>`).join('')}</div><b class="pv-btn">${e(pv.cta)}</b></div>${rich ? `<div class="pv-sec">Recent activity</div><div class="pv-rows">${pv.nav.map((t, i) => `<div class="pv-row"><i></i><span>${e(t)}</span><em style="width:${w(i, 22)}%"></em></div>`).join('')}</div>` : ''}`;
  else if (pv.layout === 'timeline') body = `<div class="pv-timeline">${items.slice(0, rich ? 6 : 4).map((t, i) => `<div class="pv-ev"><i></i><span>${e(t)}</span><em>${['Mon', 'Tue', 'Thu', 'Fri', 'Sat', 'Mon'][i]}</em></div>`).join('')}</div>${panel}`;
  return `<div class="art pv-wrap" style="--pv-h:${hue}" aria-hidden="true"><div class="pv"><div class="pv-bar"><i></i><i></i><i></i><span class="pv-name">${e(pv.name)}</span><span class="pv-nav">${pv.nav.map(x => `<span>${e(x)}</span>`).join('')}</span></div><div class="pv-body pv-l-${e(pv.layout)}">${body}</div></div></div>`;
}
function renderDiscover() {
  const main = $('#main');
  const cat = state.discoverCat;
  // Discover can be anchored on one node from the Graph page (#/discover?anchor=<node id>): the ideas center on it.
  const anchor = state.route && state.route.query && state.route.query.anchor ? findGraphNode(state.route.query.anchor) : null;
  const key = anchor ? `${cat}|${anchor.id}` : cat;
  const entry = state.discoverGen[key];
  const items = entry ? entry.items : null;
  const nodes = state.graphSize || (state.graph ? Object.keys(state.graph.nodes).length : 0);
  const personal = entry && entry.personal;
  const locked = caps().discover !== 'full';
  const AT = anchor ? NODE_TYPES[anchor.type] || {} : {};
  main.innerHTML = `<div class="view">${topbarHtml('Discover')}<div class="scroll"><div class="col wide">
    <div class="page-h"><h1>${icon('compass', 26)}Discover</h1><div class="disc-tools">${personal ? `<span class="gen-tag">${icon('loop', 14)}Built from your graph</span>` : ''}<button type="button" class="btn sm" data-gen>${icon('sparkles', 15)}<span>${locked ? 'Generate from my graph' : items ? 'Generate again' : 'Generate from my graph'}</span></button></div></div>
    ${locked ? upgradeCard('Discover builds from your graph on the Professional plan', 'Agents, apps, tools, credentials and data products proposed from your own identity graph, each stamped with a provenance id. Below are examples of what it produces.', 'Professional') : ''}
    ${anchor ? `<div class="anchor-row"><span class="anchor-chip" style="--ch:${AT.hex || 'var(--accent)'}"><span class="dot ${AT.shape || 'circle'}"></span><span>Centered on <b>${esc(anchor.label)}</b></span><a class="nchip-x" href="#/discover" aria-label="Remove the anchor" title="Back to ideas from the whole graph">${icon('x', 11)}</a></span><a class="lnk" href="#/graph?node=${encodeURIComponent(anchor.id)}">${icon('brain', 13)}Open it in the brain</a></div>` : ''}
    <p class="page-sub">What your identity graph can become. ${anchor ? (entry && entry.anchor ? `These ideas center on ${esc(anchor.label)} and combine it with the rest of your graph. Open one to start building it with Ricorsa.` : entry ? `Ideas centered on ${esc(anchor.label)} need a fuller graph (a few more conversations); until then, here is what an identity graph can create.` : `Centering ideas on ${esc(anchor.label)}.`) : nodes >= 3 ? 'These ideas are drawn from the topics, entities, goals and expertise in your graph. Open one to start building it with Ricorsa.' : 'Ask a few questions first and these will be drawn from your own graph; until then, here is what an identity graph can create.'} Every idea carries a cryptographic id tied to the exact state of your graph it came from, so anything built from it can be traced back to its origin.${entry && entry.graphHash ? ` <span class="hash" title="SHA-256 fingerprint of your graph at generation time">${icon('loop', 11)}graph ${esc(shortHash(entry.graphHash))}</span>` : ''}</p>
    ${buildsRowHtml()}
    <div class="cat-row">${DISCOVER_CATS.map(c => `<button type="button" class="cat${c === cat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="disc-grid" data-grid>${items ? items.map((it, i) => discoverCard(it, i, cat)).join('') : `<div class="g-empty" style="grid-column:1/-1">${icon('loop', 30)}<div>Nothing generated yet for ${esc(cat)}${anchor ? ` around ${esc(anchor.label)}` : ''}.</div><p>Press \u201cGenerate from my graph\u201d and Ricorsa will propose things you could build.</p></div>`}</div>
  </div></div></div>`;
  $$('[data-cat]', main).forEach(b => b.addEventListener('click', () => { state.discoverCat = b.dataset.cat; const k = anchor ? `${b.dataset.cat}|${anchor.id}` : b.dataset.cat; if (!state.discoverGen[k]) fetchDiscover(b.dataset.cat, false, anchor ? anchor.id : null); renderDiscover(); }));
  if (!state.builds) loadBuilds().then(() => { if (state.route.name === 'discover') { const row = $('[data-builds-row]', main); if (row) row.outerHTML = buildsRowHtml(); wireBuildsRow(main); } });
  wireBuildsRow(main);
  $$('[data-q]', main).forEach(b => b.addEventListener('click', () => {
    const it = items ? items[+b.dataset.idx] : null;
    const origin = it && it.id ? { kind: 'discover', ideaId: it.id, graphHash: it.graphHash, category: cat, title: it.title, at: it.at || Date.now() } : null;
    startThread(b.dataset.q, { mode: 'search', tier: state.settings.tier, focus: 'web', origin });
  }));
  $$('[data-build]', main).forEach(b => b.addEventListener('click', () => { const it = items ? items[+b.dataset.build] : null; if (it) startBuild(it, cat); }));
  // The "builds" chips: hovering one lights nothing here, but clicking opens that node in the brain (the link carries it).
  const genBtn = $('[data-gen]', main);
  if (locked) { genBtn.disabled = true; genBtn.title = 'Generating from your graph is part of the Professional and Enterprise plans'; } else genBtn.addEventListener('click', () => fetchDiscover(cat, !!items, anchor ? anchor.id : null));
  if (!items && !state.discoverTried[key]) { state.discoverTried[key] = true; fetchDiscover(cat, false, anchor ? anchor.id : null); }
  // Arriving from a node panel: the idea it pointed at flashes once.
  if (state.discoverFocus) { const card = main.querySelector(`.disc[data-idea-id="${String(state.discoverFocus).replace(/["\\]/g, '\\$&')}"]`); if (card) { card.classList.add('flash'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); setTimeout(() => card.classList.remove('flash'), 2600); } if (items) state.discoverFocus = null; }
  wireTopbar(main);
}
/** One idea. Its "builds" chips name the graph nodes (or node types) it draws on and open them in the brain. */
function discoverCard(it, i, cat) {
  const builds = (it.builds || []).slice(0, 4).map(x => {
    const n = findGraphNode(x); const t = TYPE_WORDS[String(x).toLowerCase().trim()];
    if (n) { const T = NODE_TYPES[n.type] || {}; return `<a class="nchip link" href="#/graph?node=${encodeURIComponent(n.id)}" title="${esc(n.label)} · ${esc((T.label || '').replace(/s$/, '').replace(/ie$/, 'y').toLowerCase())} in your graph · weight ${(n.weight * 100).toFixed(0)} · open it in the brain"><span class="dot ${T.shape || 'circle'}" style="background:${T.hex || 'var(--accent)'}"></span><span>${esc(x)}</span>${icon('brain', 11, 'class="go"')}</a>`; }
    if (t) { const T = NODE_TYPES[t]; return `<a class="nchip link" href="#/graph?type=${t}" title="Your ${esc(T.label.toLowerCase())} in the graph"><span class="dot ${T.shape}" style="background:${T.hex}"></span><span>${esc(x)}</span>${icon('brain', 11, 'class="go"')}</a>`; }
    return `<span class="nchip"><span class="dot circle" style="background:var(--accent)"></span><span>${esc(x)}</span></span>`;
  }).join('');
  const hash = it.id ? `<span class="hash" title="Provenance id ${esc(it.id)} · graph ${esc(it.graphHash || '')}">${icon('loop', 11)}${esc(shortHash(it.id))}</span>` : '';
  const buildTip = caps().discover === 'full' ? 'Build a working version of this, personalized with your graph' : 'Building from Discover is part of the Professional and Enterprise plans';
  const askQ = `What would "${it.title}" do for me, and what should it include? ${it.what}`;
  return `<div class="disc${i === 0 ? ' feature' : ''}" data-idx="${i}" data-idea-id="${esc(it.id || '')}"><button type="button" class="disc-open" data-build="${i}" data-idx="${i}" title="${esc(buildTip)}">${previewHtml(it, cat, i + 1, i === 0)}<div class="body"><span class="cat-tag">${esc(it.kind || cat)}${hash}</span><span class="h">${esc(it.title)}</span><span class="b">${esc(it.what)}</span>${it.why ? `<span class="why">${icon('sparkles', 12)}<span>${esc(it.why)}</span></span>` : ''}</div></button>${builds ? `<div class="disc-builds" title="The parts of your graph this idea draws on">${builds}</div>` : ''}<div class="disc-actions"><button type="button" class="btn sm ghost" data-q="${esc(askQ)}" data-idx="${i}" title="Start a thread about this idea (the app itself is built with Build it)">${icon('search', 14)}<span>Ask about it</span></button><button type="button" class="btn sm primary" data-build="${i}" title="${esc(buildTip)}">${icon('zap', 14)}<span>Build it</span></button></div></div>`;
}
async function fetchDiscover(cat, refresh, anchorId) {
  const key = anchorId ? `${cat}|${anchorId}` : cat;
  const btn = $('[data-gen]'); if (btn) { btn.disabled = true; btn.innerHTML = icon('sparkles', 15) + '<span class="dots">Generating</span>'; }
  try {
    const r = await api('/api/discover', { body: { category: cat, refresh, ...(anchorId ? { anchor: anchorId } : {}) } });
    state.discoverGen[key] = { items: r.items, personal: !!r.personal, graphHash: r.graphHash || null, anchor: r.anchor || null };
  } catch (err) { apiToast(err, 'Could not generate ideas right now'); }
  const rq = state.route && state.route.query ? state.route.query.anchor : null;
  const routeAnchor = rq ? findGraphNode(rq) : null;
  if (state.route.name === 'discover' && state.discoverCat === cat && ((routeAnchor ? routeAnchor.id : null) === (anchorId || null))) renderDiscover();
}

// ---------- Builds ----------
async function loadBuilds() { try { const r = await api('/api/builds'); state.builds = r.builds || []; } catch { state.builds = state.builds || []; } return state.builds; }
function buildsRowHtml() {
  const list = state.builds || [];
  if (!list.length) return '<div data-builds-row hidden></div>';
  return `<div class="builds-row" data-builds-row><div class="tiles-head">${icon('zap', 14)}<span>Your builds</span></div><div class="builds-list">${list.slice(0, 8).map(b => `<a class="build-chip" href="#/build/${esc(b.id)}" title="${esc(b.summary || b.title)}"><span class="k">${esc(b.kind || 'App')}</span><span class="t">${esc(truncate(b.title, 48))}</span><span class="s ${esc(b.status)}">${b.status === 'building' ? 'building' : b.status === 'error' ? 'stopped' : (b.versions > 1 ? `v${b.versions}` : 'ready')}</span></a>`).join('')}</div></div>`;
}
function wireBuildsRow() {}
// ---------- Build studio: chat on one side, the working app on the other ----------
// A build is a conversation. The first message is the idea; each later message either produces the
// next version (streamed into the app pane as it is written) or gets a plain answer when it was a question.
function newStudio(it, cat) {
  return { sessionId: null, title: it.title, kind: it.kind || 'App', category: cat || null, ideaId: it.id || null, graphHash: it.graphHash || null, spec: it, messages: [], versions: [], current: null, selected: null, live: null, tab: 'chat', view: 'preview', error: null };
}
function startBuild(it, cat) {
  if (caps().discover !== 'full') { openModal(`<h2>${icon('zap', 20)}Build it</h2><p class="sub">Ricorsa turns a Discover idea into a working app, personalized with your graph, and keeps building it with you in a chat.</p>${upgradeCard('Building is part of the Professional plan', 'Professional unlocks Discover fully: ideas generated from your own asset, and any of them built into a working app, tool, agent or dataset you can keep shaping in conversation.', 'Professional')}<div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>`); return; }
  state.studio = newStudio(it, cat);
  state.studio.messages.push({ id: 'm0', role: 'user', text: it.prompt || it.what || it.title, kind: 'request', at: Date.now() });
  go('#/build/live');
  runBuildRequest({ ideaId: it.id, graphHash: it.graphHash, category: cat, kind: it.kind || 'App', title: it.title, what: it.what || it.title, prompt: it.prompt, builds: it.builds });
}
function sendBuildMessage(text) {
  const st = state.studio; if (!st || !st.sessionId) return;
  if (st.live) { toast('Wait for the current version to finish, or stop it', 'bad'); return; }
  st.messages.push({ id: 'u' + Date.now(), role: 'user', text, kind: 'request', at: Date.now() });
  paintStudio();
  runBuildRequest({ sessionId: st.sessionId, message: text });
}
async function runBuildRequest(body) {
  const st = state.studio; if (!st) return;
  const ctl = new AbortController();
  st.live = { ctl, raw: '', statusText: 'Starting', plan: '', reply: '', version: null, buildId: null, html: '', lastFrame: 0 };
  st.error = null; paintStudio();
  let res;
  try {
    res = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw Object.assign(new Error(err.error || 'Build failed'), { status: res.status, code: err.code }); }
  } catch (e) {
    st.messages.push({ id: 'e' + Date.now(), role: 'assistant', text: e.message || 'Could not start the build', kind: 'error', at: Date.now() });
    st.live = null; paintStudio(); return;
  }
  let lastPaint = 0;
  await readSse(res, (ev, data) => {
    const live = st.live; if (!live) return;
    if (ev === 'meta') { if (!st.sessionId && data.sessionId) { st.sessionId = data.sessionId; if (location.hash === '#/build/live') { history.replaceState(null, '', '#/build/' + data.sessionId); state.route = parseRoute(); } } live.buildId = data.buildId; live.version = data.version; live.lineage = data.lineage; }
    else if (ev === 'status') { live.statusText = data.text || ''; paintStudio(); }
    else if (ev === 'model') { live.model = data.model || ''; if (data.fallback) live.fallback = data.fallback; paintStudio(); }
    else if (ev === 'phase') {
      // review: the version is being opened in a browser; repair: the builder rewrites the document, streamed from the top again; final: the check's summary.
      if (data.text === 'review') { live.checking = true; live.issues = null; live.statusText = data.round ? 'Checking the fixed version in a browser' : 'Checking the app in a browser'; }
      if (data.text === 'repair') { live.checking = false; live.raw = ''; live.issues = data.issues || []; live.round = data.round || 1; live.ran = !!data.ran; live.statusText = 'Fixing what the check found'; }
      if (data.text === 'final') { live.checking = false; live.check = data.check || null; live.left = data.left || []; }
      paintStudio(true);
    }
    else if (ev === 'plan') { live.plan = data.text || ''; paintStudio(); }
    else if (ev === 'reply') { live.reply = data.text || ''; paintStudio(); }
    else if (ev === 'delta') { live.raw += data.text || ''; const p = parseBuildRaw(live.raw); if (p.html) live.html = p.html; const now = Date.now(); if (now - lastPaint > 250) { lastPaint = now; paintStudio(); } }
    else if (ev === 'done') {
      if (data.reply) st.messages.push(data.reply);
      if (data.build) {
        if (data.message) st.messages.push(data.message);
        const v = { id: data.build.id, version: data.build.version, status: 'done', summary: data.build.summary, plan: data.build.plan, lineage: data.build.lineage, createdAt: data.build.createdAt, html: data.build.html };
        st.versions = st.versions.filter(x => x.id !== v.id).concat(v);
        st.current = v; st.selected = v.version;
      }
      st.live = null;
    }
    else if (ev === 'error') { st.messages.push(data.messageRecord || { id: 'e' + Date.now(), role: 'assistant', text: data.message || 'The build was interrupted', kind: 'error', at: Date.now() }); st.error = data.code || 'upstream_error'; st.live = null; }
  }).catch(e => { if (st.live) { const stopped = e && e.name === 'AbortError'; st.messages.push({ id: 'e' + Date.now(), role: 'assistant', text: stopped ? 'Stopped before this version was finished.' : (e.message || 'The build was interrupted'), kind: 'error', at: Date.now() }); st.error = stopped ? 'stopped' : 'upstream_error'; st.live = null; } });
  if (st.live) st.live = null;
  paintStudio(true);
  loadBuilds().then(() => { if (state.route.name === 'discover') render(); });
}
function stopBuild() { const st = state.studio; if (st && st.live && st.live.ctl) st.live.ctl.abort(); }
function parseBuildRaw(raw) {
  const t = raw || '';
  const pO = t.indexOf('<plan>'), pC = t.indexOf('</plan>'), aO = t.indexOf('<app>'), aC = t.lastIndexOf('</app>');
  const plan = pO >= 0 ? t.slice(pO + 6, pC > pO ? pC : (aO > pO ? aO : undefined)).trim() : '';
  let html = aO >= 0 ? t.slice(aO + 5, aC > aO ? aC : undefined) : '';
  html = html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '');
  return { plan, html, htmlDone: aC > aO };
}
function renderBuild(id) {
  const main = $('#main');
  if (id === 'live' && state.studio) { main.innerHTML = `<div class="view">${studioTopbar()}<div class="studio" data-studio></div></div>`; wireStudioShell(main); paintStudio(true); return; }
  if (state.studio && state.studio.sessionId === id) { main.innerHTML = `<div class="view">${studioTopbar()}<div class="studio" data-studio></div></div>`; wireStudioShell(main); paintStudio(true); return; }
  main.innerHTML = `<div class="view">${studioTopbar()}<div class="studio" data-studio><div class="empty" style="grid-column:1/-1">${icon('zap', 24)}<div>Loading the build</div></div></div></div>`;
  wireStudioShell(main);
  api('/api/builds/' + encodeURIComponent(id)).then(r => {
    const s = r.session; const spec = s.spec && typeof s.spec === 'object' ? s.spec : { title: s.title, kind: s.kind, what: '' };
    const versions = (r.versions || []).map(v => Object.assign({}, v, { html: r.current && r.current.id === v.id ? r.current.html : null }));
    const messages = (s.messages || []).slice();
    const finished = versions.some(v => v.status === 'done');
    const last = messages[messages.length - 1];
    // A first version that never finished (interrupted, or stopped) gets a plain way to start again.
    if (!finished && !(last && last.kind === 'error')) messages.push({ id: 'interrupted', role: 'assistant', text: versions.some(v => v.status === 'building') ? 'The first version is still being written, or was interrupted. If nothing appears, start again.' : 'The first version was interrupted before it finished. Start again, or add a note first and it will be built in.', kind: 'error', at: Date.now() });
    state.studio = { sessionId: s.id, title: s.title, kind: s.kind, category: s.category, ideaId: s.ideaId, graphHash: s.graphHash, spec, messages, versions, current: r.current && r.current.status === 'done' ? Object.assign({}, r.current) : null, selected: r.current && r.current.status === 'done' ? r.current.version : null, live: null, tab: 'chat', view: 'preview', error: null };
    if (state.route.name === 'build') { $('#main').innerHTML = `<div class="view">${studioTopbar()}<div class="studio" data-studio></div></div>`; wireStudioShell($('#main')); paintStudio(true); }
  }).catch(e => { apiToast(e, 'That build is not available'); go('#/discover'); });
}
function studioTopbar() {
  const st = state.studio;
  return topbarHtml(st ? st.title : 'Build', `<div class="studio-tabs" data-studio-tabs><button type="button" class="tab-btn on" data-tab="chat">${icon('sparkles', 14)}Chat</button><button type="button" class="tab-btn" data-tab="app">${icon('zap', 14)}App</button></div>`);
}
function wireStudioShell(root) {
  wireTopbar(root);
  $$('[data-studio-tabs] [data-tab]', root).forEach(b => b.addEventListener('click', () => { if (state.studio) state.studio.tab = b.dataset.tab; $$('[data-studio-tabs] [data-tab]', root).forEach(x => x.classList.toggle('on', x === b)); const s = $('[data-studio]', root); if (s) s.dataset.tab = b.dataset.tab; }));
}
function studioMessageHtml(m, st) {
  if (m.role === 'user') return `<div class="smsg user"><div class="bubble">${esc(m.text)}</div></div>`;
  if (m.kind === 'error') return `<div class="smsg bot err"><div class="bubble">${icon('alert', 15)}<span>${esc(m.text)}</span></div><div class="smsg-actions"><button type="button" class="btn sm" data-retry-build>${icon('refresh', 13)}Try again</button></div></div>`;
  if (m.kind === 'plan') {
    const lines = String(m.text || '').split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
    const v = st.versions.find(x => x.id === m.buildId);
    return `<div class="smsg bot"><div class="bubble"><div class="smsg-title">${icon('zap', 14)}Version ${esc(m.version || (v && v.version) || '')} ${v && v.status === 'done' ? 'is ready' : 'was written'}</div><ul class="build-plan">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${checkLineHtml(m)}</div>${m.buildId ? `<div class="smsg-actions"><button type="button" class="btn sm${st.selected === (m.version || (v && v.version)) ? ' primary' : ''}" data-show-version="${esc(m.version || (v && v.version) || '')}">${icon('external', 13)}Show this version</button></div>` : ''}</div>`;
  }
  return `<div class="smsg bot"><div class="bubble">${md(m.text || '')}</div></div>`;
}
/** A readable name for the model that wrote a version. */
function modelName(id) {
  const m = String(id || '');
  if (!m) return '';
  if (/^claude-fable/i.test(m)) return 'Claude Fable ' + (m.match(/fable-(\d+)(?:-(\d+))?/i) ? m.match(/fable-(\d+)(?:-(\d+))?/i).slice(1).filter(Boolean).join('.') : '');
  if (/^claude-opus/i.test(m)) return 'Claude Opus ' + (m.match(/opus-(\d+)(?:-(\d+))?/i) ? m.match(/opus-(\d+)(?:-(\d+))?/i).slice(1).filter(Boolean).join('.') : '');
  if (/^claude-sonnet/i.test(m)) return 'Claude Sonnet ' + (m.match(/sonnet-(\d+)(?:-(\d+))?/i) ? m.match(/sonnet-(\d+)(?:-(\d+))?/i).slice(1).filter(Boolean).join('.') : '');
  if (/^kimi-k(\d[\d.]*)/i.test(m)) return 'Kimi K' + m.match(/^kimi-k(\d[\d.]*)/i)[1] + (/code/i.test(m) ? ' code' : '') + (/thinking/i.test(m) ? ' thinking' : '') + (/turbo/i.test(m) ? ' turbo' : '') + (/highspeed/i.test(m) ? ' highspeed' : '');
  if (/^gpt-/i.test(m)) return 'GPT-' + m.slice(4).replace(/-preview$/, '').replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, '');
  if (/^o[1-9](-|$)/i.test(m)) return m.replace(/-(\d{4}-\d{2}-\d{2})$/, '');
  if (/^gemini-/i.test(m)) return 'Gemini ' + m.slice(7).replace(/-preview.*$/, '').replace(/-(\d{2}-\d{2}|\d{3})$/, '').replace(/-/g, ' ');
  if (/^grok-/i.test(m)) return 'Grok ' + m.slice(5).replace(/-/g, ' ');
  if (/^deepseek-/i.test(m)) return 'DeepSeek ' + m.slice(9).replace(/-/g, ' ');
  if (/^(mistral|magistral|codestral|ministral|pixtral|devstral)-/i.test(m)) return m.replace(/-latest$/, '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
  if (/llama/i.test(m)) return m.replace(/^meta-llama\//i, '').replace(/^llama-?/i, 'Llama ').replace(/-instruct.*$|-instant$/i, '');
  return m.length > 34 ? m.slice(0, 32) + '…' : m;
}
/** The configured model could not be used and another wrote instead: say so, with what the provider answered, so a slow or weaker build is never a mystery. */
function isAdmin() { return !!(state.user && state.user.admin); }
function fallbackLineHtml(fb, model, live) {
  if (!fb || !fb.wanted || !isAdmin()) return '';
  return `<div class="smsg-sub fallback">${icon('alert', 12)}<span>${esc(modelName(fb.wanted))} could not be used${fb.why ? ` (${esc(fb.why)})` : ''}${model ? `, so ${esc(modelName(model))} ${live ? 'is writing' : 'wrote'} this version` : ''}. An admin can check the model accounts under Settings.</span></div>`;
}
/** What the check of a version found, under its plan: how it was checked and what, if anything, is left. */
function checkLineHtml(m) {
  const fb = fallbackLineHtml(m.fallback, m.model);
  const c = m.check; if (!c) return (m.model && isAdmin() ? `<div class="smsg-sub">Written by ${esc(modelName(m.model))}</div>` : '') + fb;
  const by = m.model && isAdmin() ? `Written by ${esc(modelName(m.model))} · ` : '';
  let line;
  if (c.ran) line = `${by}Opened in a browser: ${c.clicked} control${c.clicked === 1 ? '' : 's'} pressed, ${c.screens} screen${c.screens === 1 ? '' : 's'} opened${c.rounds ? `, ${c.rounds} fix round${c.rounds === 1 ? '' : 's'}` : ''}${c.left ? ` · ${c.left} note${c.left === 1 ? '' : 's'} left` : ' · everything responded'}`;
  else line = `${by}Checked by a code review${c.rounds ? ` with ${c.rounds} fix round${c.rounds === 1 ? '' : 's'}` : ''}${c.left ? ` · ${c.left} note${c.left === 1 ? '' : 's'} left` : ''}`;
  const left = m.left && m.left.length ? `<details class="build-left"><summary>What is left</summary><ul>${m.left.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>` : '';
  return `<div class="smsg-sub check">${icon('check', 12)}<span>${line}</span></div>${fb}${left}`;
}
function paintStudio(final) {
  const root = $('[data-studio]'); const st = state.studio; if (!root || !st) return;
  root.dataset.tab = st.tab || 'chat';
  if (!root.dataset.ready) {
    root.dataset.ready = '1';
    root.innerHTML = `<section class="studio-chat"><div class="studio-msgs" data-msgs></div><div class="studio-compose"><div class="studio-hints" data-hints></div><div class="studio-input"><textarea data-compose rows="2" placeholder="Ask for a change, add a screen, or ask how it works"></textarea><button type="button" class="send-btn" data-send aria-label="Send">${icon('arrowUp', 18)}</button></div></div></section>
      <section class="studio-app"><div class="studio-bar"><span class="cat-tag" data-s-kind></span><div class="versions" data-versions></div><span class="build-status" data-s-status></span><span class="spacer"></span><div class="seg studio-view" role="radiogroup" aria-label="View" data-s-view><button type="button" class="on" data-view="preview" role="radio" aria-checked="true">${icon('eye', 14)}<span>Preview</span></button><button type="button" data-view="code" role="radio" aria-checked="false">${icon('code', 14)}<span>Code</span></button></div><button type="button" class="btn sm" data-s-open title="Open the app in its own tab">${icon('external', 14)}<span>Open</span></button><button type="button" class="btn sm" data-s-download title="Save the app as a single HTML file">${icon('download', 14)}<span>Download</span></button><button type="button" class="btn sm" data-s-copy title="Copy the app's source">${icon('copy', 14)}<span>Copy</span></button></div><div class="studio-frame-wrap"><iframe class="studio-frame" data-s-frame sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" title="Your app" referrerpolicy="no-referrer"></iframe><div class="studio-code" data-s-code hidden><div class="studio-code-meta" data-s-code-meta></div><pre data-s-code-text></pre></div><div class="build-overlay" data-s-overlay><div class="spinner"></div><div data-s-overlay-text>Building</div></div></div></section>`;
    $$('[data-s-view] [data-view]', root).forEach(b => b.addEventListener('click', () => { if (state.studio) state.studio.view = b.dataset.view; paintStudio(true); }));
    const ta = $('[data-compose]', root);
    const send = () => { const t = ta.value.trim(); if (!t) return; ta.value = ''; sendBuildMessage(t); };
    $('[data-send]', root).addEventListener('click', () => { if (state.studio && state.studio.live) stopBuild(); else send(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    $('[data-s-open]', root).addEventListener('click', () => { const v = currentVersion(); if (!v) { toast('Wait for a version to finish', 'bad'); return; } window.open('/app/run#' + encodeURIComponent(v.id) + ':' + encodeURIComponent(v.version || ''), '_blank', 'noopener'); });
    $('[data-s-download]', root).addEventListener('click', () => { const html = shownHtml(); if (!html) { toast('Nothing to download yet', 'bad'); return; } downloadFile(slugify(st.title || 'ricorsa-app') + '.html', html, 'text/html'); toast('Saved'); });
    $('[data-s-copy]', root).addEventListener('click', async () => { const html = shownHtml(); if (!html) { toast('Nothing to copy yet', 'bad'); return; } const ok = await copyText(html); toast(ok ? 'Source copied' : 'Could not copy', ok ? 'ok' : 'bad'); });
  }
  const live = st.live;
  // Chat
  const msgs = $('[data-msgs]', root);
  const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  let html = st.messages.map(m => studioMessageHtml(m, st)).join('');
  if (live) {
    if (live.reply) html += `<div class="smsg bot"><div class="bubble">${md(live.reply)}</div></div>`;
    else html += `<div class="smsg bot live"><div class="bubble">${live.plan ? `<div class="smsg-title">${icon('zap', 14)}Version ${esc(live.version || '')}: ${live.issues ? 'fixing what the check found' : live.checking ? 'checking it in a browser' : 'writing the app'}</div><ul class="build-plan">${live.plan.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${live.issues && live.issues.length ? `<div class="build-review"><div class="smsg-title">${icon('alert', 14)}${live.ran ? 'The browser check found' : 'The review found'} ${live.issues.length} part${live.issues.length === 1 ? '' : 's'} to fix${live.round > 1 ? ` (round ${live.round})` : ''}</div><ul>${live.issues.slice(0, 6).map(i => `<li>${esc(i)}</li>`).join('')}${live.issues.length > 6 ? `<li>and ${live.issues.length - 6} more</li>` : ''}</ul></div>` : ''}<div class="dots">${esc(live.statusText || 'Working')}</div>${live.html ? `<div class="smsg-sub">${live.html.split('\n').length} lines written${live.model && isAdmin() ? ` · ${esc(modelName(live.model))}` : ''}</div>` : (live.model && isAdmin() ? `<div class="smsg-sub">${esc(modelName(live.model))}</div>` : '')}${fallbackLineHtml(live.fallback, live.model, true)}</div></div>`;
  }
  msgs.innerHTML = html || `<div class="empty">${icon('zap', 24)}<div>Nothing here yet.</div></div>`;
  $$('[data-show-version]', msgs).forEach(b => b.addEventListener('click', () => showVersion(+b.dataset.showVersion)));
  $$('[data-retry-build]', msgs).forEach(b => b.addEventListener('click', () => {
    if (st.live) return;
    const finished = st.versions.some(v => v.status === 'done');
    const lastReq = [...st.messages].reverse().find(m => m.role === 'user');
    if (!st.sessionId) runBuildRequest({ ideaId: st.ideaId, graphHash: st.graphHash, category: st.category, kind: st.kind, title: st.title, what: st.spec && st.spec.what || st.title, prompt: st.spec && st.spec.prompt, builds: st.spec && st.spec.builds });
    // Nothing finished yet: write the first version again (the notes so far are folded in). Otherwise retry the last change.
    else if (!finished) runBuildRequest({ sessionId: st.sessionId, restart: true });
    else if (lastReq) runBuildRequest({ sessionId: st.sessionId, message: lastReq.text });
  }));
  if (atBottom || final) msgs.scrollTop = msgs.scrollHeight;
  const hints = $('[data-hints]', root);
  const done = !live && st.current && st.current.status === 'done';
  // Next steps: what the builder suggested for the latest version, always on offer once a version exists.
  const lastPlan = [...st.messages].reverse().find(m => m.kind === 'plan');
  const steps = done ? ((lastPlan && lastPlan.next && lastPlan.next.length ? lastPlan.next : nextStepsFor(st.kind)).slice(0, 4)) : [];
  hints.innerHTML = steps.length ? `<span class="hints-label">${icon('sparkles', 13)}Next steps</span>${steps.map(h => `<button type="button" class="chip" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}` : '';
  $$('[data-hint]', hints).forEach(b => b.addEventListener('click', () => sendBuildMessage(b.dataset.hint)));
  const ta = $('[data-compose]', root); const sendBtn = $('[data-send]', root);
  ta.disabled = !st.sessionId && !live ? false : false;
  sendBtn.innerHTML = live ? icon('stop', 16) : icon('arrowUp', 18);
  sendBtn.title = live ? 'Stop' : 'Send';
  ta.placeholder = live ? 'Building… you can stop it, or wait to send the next change' : (st.sessionId ? 'Ask for a change, add a screen, or ask how it works' : 'Starting the first version');
  // App pane
  $('[data-s-kind]', root).textContent = st.kind || 'App';
  const versions = st.versions.slice().sort((a, b) => a.version - b.version);
  $('[data-versions]', root).innerHTML = versions.map(v => `<button type="button" class="vchip${st.selected === v.version && !live ? ' on' : ''}${v.status === 'error' ? ' bad' : ''}" data-v="${v.version}" title="${esc(v.summary || '')}">v${v.version}</button>`).join('') + (live && live.version ? `<span class="vchip live">v${live.version}…</span>` : '');
  $$('[data-v]', root).forEach(b => b.addEventListener('click', () => showVersion(+b.dataset.v)));
  const stEl = $('[data-s-status]', root);
  stEl.textContent = live ? (live.statusText || 'Building') : st.error ? 'Stopped' : (st.current ? 'Ready' : 'No version yet');
  stEl.className = 'build-status ' + (live ? 'live' : st.error ? 'bad' : 'ok');
  const frame = $('[data-s-frame]', root), overlay = $('[data-s-overlay]', root);
  const showHtml = live && live.html ? live.html : shownHtml();
  const now = Date.now();
  // Preview or Code. Code shows the document as it is written, line by line; Preview runs it.
  const view = st.view === 'code' ? 'code' : 'preview';
  $$('[data-s-view] [data-view]', root).forEach(b => { const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const codeWrap = $('[data-s-code]', root), codeText = $('[data-s-code-text]', root), codeMeta = $('[data-s-code-meta]', root);
  codeWrap.hidden = view !== 'code';
  frame.hidden = view === 'code';
  if (view === 'code') {
    if (codeText.dataset.len !== String(showHtml.length)) {
      codeText.dataset.len = String(showHtml.length);
      codeText.textContent = showHtml;
      // Follow the writing while a version streams; leave the reader alone once it is finished.
      if (live) codeWrap.scrollTop = codeWrap.scrollHeight;
    }
    const lines = showHtml ? showHtml.split('\n').length : 0;
    codeMeta.textContent = showHtml ? `${lines.toLocaleString('en-US')} lines · ${(showHtml.length / 1024).toFixed(1)} KB${live ? ' · writing' : (st.selected ? ` · v${st.selected}` : '')}` : '';
  } else if (showHtml && (final || !live || now - (live.lastFrame || 0) > 2500)) { if (live) live.lastFrame = now; const hash = String(showHtml.length) + ':' + (st.selected || '') + ':' + (live ? 'live' : 'done') + (window.RicorsaBridge ? ':b' : ':nb'); if (frame.dataset.hash !== hash) { frame.dataset.hash = hash; frame.srcdoc = window.RicorsaBridge ? window.RicorsaBridge.wrap(showHtml) : showHtml; } }
  // The live line to Ricorsa's model for the app in the frame (window.ricorsa.ask inside the app): one host for the page, the version on screen answering for itself.
  if (window.RicorsaBridge) window.RicorsaBridge.host(() => $('[data-s-frame]'), () => { const s = state.studio; if (!s) return null; const v = s.versions.find(x => x.version === s.selected); return (v && v.id) || (s.current && s.current.id) || (s.live && (s.live.buildId || s.sessionId)) || s.sessionId || null; });
  overlay.hidden = !(live && !live.html && !live.reply);
  $('[data-s-overlay-text]', root).textContent = live ? (live.statusText || 'Building') : '';
}
function nextStepsFor(kind) {
  const k = String(kind || '').toLowerCase();
  if (/tool/.test(k)) return ['Add a history of past runs with one-click reuse', 'Add export to CSV and JSON', 'Add keyboard shortcuts for the main actions', 'Make it work well on a phone'];
  if (/agent/.test(k)) return ['Add an approvals queue for consequential steps', 'Let me edit the rules the agent works from', 'Add a timeline of every run with outcomes', 'Add a settings screen for pace and limits'];
  if (/dapp|decentral|credential|did/.test(k)) return ['Add a screen to import and verify a credential from JSON', 'Show the key pair and let me rotate it', 'Add a shareable, signed export of my data', 'Add an audit log of every signature'];
  return ['Add a settings screen', 'Add search and filters to the main list', 'Add export and import of my data', 'Make it work well on a phone'];
}
function currentVersion() { const st = state.studio; if (!st) return null; return st.versions.find(v => v.version === st.selected && v.status === 'done') || st.current || null; }
function shownHtml() { const st = state.studio; if (!st) return ''; const v = st.versions.find(x => x.version === st.selected); if (v && v.html) return v.html; if (st.current && (!v || st.current.id === v.id)) return st.current.html || ''; return ''; }
async function showVersion(n) {
  const st = state.studio; if (!st) return;
  const v = st.versions.find(x => x.version === n); if (!v) return;
  st.selected = n;
  if (!v.html) { try { const r = await api('/api/builds/' + encodeURIComponent(st.sessionId) + '?version=' + n); if (r.current) v.html = r.current.html; } catch (e) { apiToast(e, 'Could not load that version'); } }
  if (state.route.name === 'build') { st.tab = 'app'; const root = $('[data-studio]'); if (root) { root.dataset.tab = 'app'; $$('[data-studio-tabs] [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === 'app')); } paintStudio(true); }
}

// ---------- Spaces ----------
const EMOJIS = ['🗂️', '🔬', '💼', '✈️', '📚', '🧪', '🏠', '💡', '🎨', '📈', '🩺', '⚙️'];
function renderSpaces() {
  const main = $('#main');
  const counts = {}; for (const t of state.threads) if (t.spaceId) counts[t.spaceId] = (counts[t.spaceId] || 0) + 1;
  const limitNote = state.plan && state.spaces.length >= state.plan.spaces ? `<p class="page-sub">The ${esc(state.plan.name)} plan allows ${state.plan.spaces} Space${state.plan.spaces === 1 ? '' : 's'}. <a href="/pricing">See plans</a> for more.</p>` : '';
  main.innerHTML = `<div class="view">${topbarHtml('Spaces')}<div class="scroll"><div class="col wide">
    <div class="page-h"><h1>${icon('layers', 26)}Spaces</h1><button type="button" class="btn primary sm" data-new-space>${icon('plus', 15)}<span>Create a Space</span></button></div>
    <p class="page-sub">A Space groups threads around a project and gives Ricorsa standing instructions: a persona, a house style, background it should assume.</p>${limitNote}
    <div class="space-grid">
      <button type="button" class="space-card new" data-new-space>${icon('folderPlus', 26)}<span>New Space</span></button>
      ${state.spaces.map(s => `<a class="space-card" href="#/space/${s.id}"><span class="emo">${esc(s.emoji)}</span><span class="n">${esc(s.name)}</span><span class="d">${esc(s.description || (s.instructions ? truncate(s.instructions, 90) : 'No description yet'))}</span><span class="c">${counts[s.id] || 0} thread${counts[s.id] === 1 ? '' : 's'}</span></a>`).join('')}
    </div>
  </div></div></div>`;
  $$('[data-new-space]', main).forEach(b => b.addEventListener('click', () => spaceModal()));
  wireTopbar(main);
}
function spaceModal(space) {
  const s = space || { emoji: '🗂️', name: '', description: '', instructions: '' };
  openModal(`<h2>${space ? 'Edit Space' : 'Create a Space'}</h2><p class="sub">Threads started here follow the Space’s instructions.</p>
    <div class="field"><label>Icon</label><div class="emoji-row">${EMOJIS.map(e => `<button type="button" data-emo="${e}" class="${e === s.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
    <div class="field"><label for="spName">Name</label><input type="text" id="spName" value="${esc(s.name)}" maxlength="60" placeholder="e.g. Q4 competitor research"></div>
    <div class="field"><label for="spDesc">Description</label><input type="text" id="spDesc" value="${esc(s.description)}" maxlength="140" placeholder="What this Space is for"></div>
    <div class="field"><label for="spInstr">Instructions for Ricorsa</label><textarea id="spInstr" placeholder="e.g. Answer as a patient tutor for a first-year statistics student. Prefer worked examples. Keep answers under 250 words.">${esc(s.instructions)}</textarea><span class="hint">Sent with every question in this Space.</span></div>
    <div class="modal-actions">${space ? `<button type="button" class="btn danger left" id="spDel">Delete Space</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="spOk">${space ? 'Save' : 'Create'}</button></div>`, {
    onMount: ov => {
      let emoji = s.emoji;
      $$('[data-emo]', ov).forEach(b => b.addEventListener('click', () => { emoji = b.dataset.emo; $$('[data-emo]', ov).forEach(x => x.classList.toggle('on', x === b)); }));
      $('#spOk').addEventListener('click', async () => {
        const name = $('#spName').value.trim(); if (!name) { $('#spName').focus(); return; }
        const desc = $('#spDesc').value.trim(), instr = $('#spInstr').value.trim();
        try {
          if (space) { await api('/api/spaces/' + encodeURIComponent(space.id), { method: 'PATCH', body: { emoji, name, description: desc, instructions: instr } }); Object.assign(space, { emoji, name, description: desc, instructions: instr }); closeModal(); render(); toast('Space saved'); }
          else { const r = await api('/api/spaces', { body: { emoji, name, description: desc, instructions: instr } }); state.spaces.push(r.space); closeModal(); go('#/space/' + r.space.id); toast('Space created'); }
        } catch (e) { apiToast(e, 'Could not save the Space'); }
      });
      const del = $('#spDel'); if (del) del.addEventListener('click', async () => {
        try { await api('/api/spaces/' + encodeURIComponent(space.id), { method: 'DELETE' }); } catch (e) { apiToast(e); return; }
        state.spaces = state.spaces.filter(x => x.id !== space.id);
        for (const t of state.threads) if (t.spaceId === space.id) t.spaceId = null;
        for (const t of Object.values(state.threadCache)) if (t.spaceId === space.id) t.spaceId = null;
        closeModal(); go('#/spaces'); toast('Space deleted. Its threads stay in your Library');
      });
      $('#spName').focus();
    }
  });
}
function renderSpace(id) {
  const s = getSpace(id); const main = $('#main');
  if (!s) { main.innerHTML = `<div class="view">${topbarHtml('')}<div class="scroll"><div class="col"><div class="empty">${icon('layers', 28)}<div>That Space isn’t in this browser.</div><p><a href="#/spaces">All Spaces</a></p></div></div></div></div>`; wireTopbar(main); return; }
  const threads = state.threads.filter(t => t.spaceId === s.id);
  main.innerHTML = `<div class="view">${topbarHtml(s.name, `<button type="button" class="btn sm ghost" data-edit>${icon('edit', 15)}<span>Edit</span></button>`)}<div class="scroll"><div class="col">
    <div class="space-hero"><span class="emo">${esc(s.emoji)}</span><div><h1>${esc(s.name)}</h1>${s.description ? `<p>${esc(s.description)}</p>` : ''}${s.instructions ? `<div class="instr">${esc(s.instructions)}</div>` : ''}</div></div>
    <div data-composer style="margin-bottom:24px"></div>
    <div class="sec-h" style="margin-bottom:6px">${icon('plug', 17)}Connectors in this Space<span class="spacer"></span><button type="button" class="btn sm" data-space-conn-add>${icon('plus', 14)}<span>Add to this Space</span></button></div>
    <div data-space-conns><div class="skel"><i></i></div></div>
    <div class="sec-h" style="margin:22px 0 6px">${icon('library', 17)}Threads in this Space</div>
    ${threads.length ? `<div class="list">${threads.map(t => threadRow(t)).join('')}</div>` : `<div class="empty">${icon('library', 28)}<div>Nothing here yet, ask the first question above.</div></div>`}
  </div></div></div>`;
  const comp = createComposer({ variant: 'hero', placeholder: `Ask in ${s.name}…`, onSubmit: ({ text, mode, tier, focus, attachments }) => startThread(text, { mode, tier, focus, attachments, spaceId: s.id }) });
  $('[data-composer]', main).appendChild(comp);
  $('[data-edit]', main).addEventListener('click', () => spaceModal(s));
  const scope = { spaceId: s.id, spaceName: s.name, onAdded: () => paintSpaceConnectors(s) };
  $('[data-space-conn-add]', main).addEventListener('click', () => { if ((state.connLimit || 0) <= 0 && !isAdmin() && state.connectors) { toast('Connectors are part of the Essentials, Professional and Enterprise plans', 'bad'); return; } addConnectorModal(null, scope); });
  wireRows(main);
  wireTopbar(main);
  (state.connectors ? Promise.resolve() : loadConnectors()).then(() => paintSpaceConnectors(s)).catch(() => { const box = $('[data-space-conns]', main); if (box) box.innerHTML = `<p class="page-sub">Your connectors could not be loaded.</p>`; });
}
/**
 * The connectors a thread in this Space can use: the ones sourced for it (unique to it, or shared with a few
 * Spaces) and the ones available everywhere. Others can be brought in without adding them again.
 */
function paintSpaceConnectors(s) {
  const box = $('[data-space-conns]'); if (!box) return;
  const all = state.connectors || [];
  const here = all.filter(c => (c.spaceIds || []).includes(s.id));
  const everywhere = all.filter(c => !(c.spaceIds || []).length);
  const elsewhere = all.filter(c => (c.spaceIds || []).length && !(c.spaceIds || []).includes(s.id));
  const chip = (c, kind) => { const st = connStatus(c); return `<div class="space-conn${c.enabled ? '' : ' off'}" data-sc="${esc(c.id)}"><span class="conn-logo sm" style="background:${c.preset === 'vdrpros' ? '#0B6E63' : colorFor(c.name)}">${c.preset === 'vdrpros' ? 'V' : c.preset === 'website' ? 'W' : esc(c.name[0] || '?').toUpperCase()}</span><span class="t"><b>${esc(c.name)}</b><small>${kind === 'here' ? ((c.spaceIds || []).length === 1 ? 'Only in this Space' : `In ${(c.spaceIds || []).length} Spaces`) : 'Everywhere'}${c.enabled ? '' : ' · off'}${c.status !== 'ok' ? ` · ${esc(st.text)}` : ''}</small></span>${kind === 'here' ? `<button type="button" class="btn sm ghost" data-sc-scope title="Change the Spaces it is used in">${icon('layers', 13)}</button>` : ''}</div>`; };
  box.innerHTML = `${here.length || everywhere.length ? `<div class="space-conn-grid">${here.map(c => chip(c, 'here')).join('')}${everywhere.map(c => chip(c, 'all')).join('')}</div>` : `<p class="page-sub" style="margin:4px 0 6px">No connectors reach this Space yet. Add one here to keep it unique to this Space, or connect one under <a href="#/connectors">Connectors</a> for every thread.</p>`}
    ${elsewhere.length ? `<p class="page-sub" style="margin:8px 0 0">${elsewhere.length === 1 ? 'One connector is limited to other Spaces' : `${elsewhere.length} connectors are limited to other Spaces`}: <button type="button" class="linklike" data-sc-bring>use one here too</button>.</p>` : ''}`;
  $$('[data-sc-scope]', box).forEach(b => b.addEventListener('click', () => { const c = all.find(x => x.id === b.closest('[data-sc]').dataset.sc); if (c) connectorScopeModal(c, () => paintSpaceConnectors(s)); }));
  const bring = $('[data-sc-bring]', box); if (bring) bring.addEventListener('click', () => openModal(`<h2>${icon('plug', 20)}Use in ${esc(s.name)} too</h2><p class="sub">These connectors are limited to other Spaces. Pick one to make it available here as well.</p>
    ${elsewhere.map(c => `<button type="button" class="pop-item" data-bring="${esc(c.id)}"><span class="conn-logo sm" style="background:${colorFor(c.name)}">${esc(c.name[0] || '?').toUpperCase()}</span><span><div class="t">${esc(c.name)}</div><div class="d">${scopeText(c)}</div></span></button>`).join('')}
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button></div>`, {
    onMount: ov => $$('[data-bring]', ov).forEach(b => b.addEventListener('click', async () => { const c = all.find(x => x.id === b.dataset.bring); if (!c) return; try { const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body: { spaceIds: [...(c.spaceIds || []), s.id] } }); Object.assign(c, r.connector); closeModal(); paintSpaceConnectors(s); toast(`${c.name} can now be used in ${s.name}`); } catch (err) { apiToast(err); } }))
  }));
}

// ---------- Library ----------
state.libQuery = '';
function threadRow(t) {
  const space = t.spaceId ? getSpace(t.spaceId) : null;
  const n = t.turnCount != null ? t.turnCount : (t.turns || []).length;
  const snippet = truncate(t.snippet || 'No answer yet', 140);
  return `<div class="row" data-open="${t.id}" role="link" tabindex="0">${icon('clock', 16)}<div class="main"><span class="t">${esc(t.title)}</span><span class="s">${esc(snippet)}</span></div><div class="meta">${space ? `<span>${esc(space.emoji)} ${esc(space.name)}</span>` : ''}<span>${n} turn${n === 1 ? '' : 's'}</span><span>${relTime(t.updatedAt)}</span><button type="button" class="icon-btn del" data-del="${t.id}" aria-label="Delete thread">${icon('trash', 15)}</button></div></div>`;
}
function wireRows(root) {
  $$('[data-open]', root).forEach(r => {
    const open = () => go('#/thread/' + r.dataset.open);
    r.addEventListener('click', e => { if (e.target.closest('[data-del]')) return; open(); });
    r.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
  $$('[data-del]', root).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const t = getThreadSummary(b.dataset.del); if (t) confirmDelete(t); }));
}
function renderLibrary() {
  const main = $('#main');
  const q = state.libQuery.trim().toLowerCase();
  const threads = state.threads.filter(t => !q || t.title.toLowerCase().includes(q) || (t.snippet || '').toLowerCase().includes(q));
  main.innerHTML = `<div class="view">${topbarHtml('Library')}<div class="scroll"><div class="col wide">
    <div class="page-h"><h1>${icon('library', 26)}Library</h1><span class="gen-tag">${state.threads.length} thread${state.threads.length === 1 ? '' : 's'}</span></div>
    <div class="search-in">${icon('search', 16)}<input type="search" placeholder="Search your threads" value="${esc(state.libQuery)}" aria-label="Search threads"></div>
    ${threads.length ? `<div class="list">${threads.map(t => threadRow(t)).join('')}</div>` : `<div class="empty">${icon('library', 28)}<div>${q ? 'No threads match that search.' : 'No threads yet. Ask something on the home page.'}</div></div>`}
    ${state.spaces.length ? `<div class="sec-h" style="margin-top:8px">${icon('layers', 17)}Spaces</div><div class="space-grid">${state.spaces.map(s => `<a class="space-card" href="#/space/${s.id}"><span class="emo">${esc(s.emoji)}</span><span class="n">${esc(s.name)}</span><span class="d">${esc(s.description || 'No description')}</span></a>`).join('')}</div>` : ''}
  </div></div></div>`;
  const inp = $('input[type=search]', main);
  inp.addEventListener('input', () => { state.libQuery = inp.value; const pos = inp.selectionStart; renderLibrary(); const i2 = $('#main input[type=search]'); i2.focus(); i2.setSelectionRange(pos, pos); });
  wireRows(main);
  wireTopbar(main);
}


// ---------- Your graph ----------
function shapeSvg(type, x, y, r, hex) {
  const T = NODE_TYPES[type] || NODE_TYPES.topic;
  switch (T.shape) {
    case 'square': return `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}" rx="${(r * 0.28).toFixed(1)}" fill="${hex}" stroke="var(--card)" stroke-width="2"/>`;
    case 'diamond': return `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}" rx="${(r * 0.22).toFixed(1)}" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" fill="${hex}" stroke="var(--card)" stroke-width="2"/>`;
    case 'hex': { const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push(`${(x + r * 1.08 * Math.cos(a)).toFixed(1)},${(y + r * 1.08 * Math.sin(a)).toFixed(1)}`); } return `<polygon points="${pts.join(' ')}" fill="${hex}" stroke="var(--card)" stroke-width="2"/>`; }
    case 'ring': return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r - 1).toFixed(1)}" fill="var(--card)" stroke="${hex}" stroke-width="2.5"/>`;
    default: return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hex}" stroke="var(--card)" stroke-width="2"/>`;
  }
}
function layoutGraph(nodes, edges, W, H) {
  const types = Object.keys(NODE_TYPES); const pos = {};
  nodes.forEach((n, i) => {
    const ti = types.indexOf(n.type); const ang = (ti / types.length) * Math.PI * 2 + ((i * 0.618) % 1) * 1.1 - 0.3;
    const r = Math.min(W, H) * (0.16 + 0.24 * (1 - n.weight));
    pos[n.id] = { x: W / 2 + Math.cos(ang) * r, y: H / 2 + Math.sin(ang) * r * 0.85, vx: 0, vy: 0 };
  });
  const ITER = 240;
  for (let it = 0; it < ITER; it++) {
    const t = 1 - it / ITER;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = pos[nodes[i].id], b = pos[nodes[j].id]; let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
      const minD = 64 + 30 * (nodes[i].weight + nodes[j].weight) + 2.2 * Math.min(nodes[i].label.length, 28);
      const f = ((d < minD ? (minD - d) * 0.6 : 0) + 2600 / d2) * (0.3 + 0.7 * t);
      dx /= d; dy /= d; a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const e of edges) {
      const a = pos[e.a], b = pos[e.b]; if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) + 0.01; const target = 170 - 60 * e.weight;
      const f = (d - target) * 0.025 * (0.4 + e.weight); dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const n of nodes) { const p = pos[n.id]; p.vx += (W / 2 - p.x) * 0.003; p.vy += (H / 2 - p.y) * 0.007; p.x += p.vx * 0.5; p.y += p.vy * 0.5; p.vx *= 0.55; p.vy *= 0.55; p.x = clamp(p.x, 70, W - 70); p.y = clamp(p.y, 34, H - 34); }
  }
  return pos;
}
/** Load the living-brain module once (graph3d.js); the flat SVG map is the fallback if it cannot be fetched. */
function ensureGraph3D() {
  if (window.RicorsaGraph3D) return Promise.resolve(true);
  return new Promise(resolve => {
    let sc = document.querySelector('script[data-graph3d]');
    if (!sc) { sc = document.createElement('script'); sc.src = '/app/assets/graph3d.js'; sc.dataset.graph3d = '1'; document.head.appendChild(sc); }
    sc.addEventListener('load', () => resolve(!!window.RicorsaGraph3D)); sc.addEventListener('error', () => resolve(false));
    if (window.RicorsaGraph3D) resolve(true);
  });
}
/**
 * The brain's model, assembled from what the account holds: the graph's nodes and edges, the threads (Memory, grouped
 * by Space), the intents (Discovery), the built apps (Action) and the connectors (Communication), plus the pathways
 * from each learned node to the conversation that taught it.
 */
function brainModel(g) {
  const nodes = []; const edges = [];
  const graphNodes = Object.values(g.nodes || {}).sort((a, b) => b.weight - a.weight).slice(0, 260);
  const kept = new Set(graphNodes.map(n => n.id));
  for (const n of graphNodes) nodes.push({ id: n.id, kind: n.type, label: n.label, weight: n.weight, count: n.count, firstSeen: n.firstSeen, lastSeen: n.lastSeen, level: n.level, origin: n.origin && n.origin.threadId ? n.origin.threadId : null, meta: n });
  for (const e of Object.values(g.edges || {})) if (kept.has(e.a) && kept.has(e.b)) edges.push({ a: e.a, b: e.b, weight: e.weight, at: e.lastSeen });
  const threads = (state.threads || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 140);
  const newest = threads.length ? (threads[0].updatedAt || Date.now()) : Date.now();
  for (const t of threads) {
    const age = Math.max(0, newest - (t.updatedAt || 0)) / 86400000;
    nodes.push({ id: 'thread:' + t.id, kind: 'thread', label: t.title || 'Conversation', weight: Math.min(1, 0.22 + 0.05 * Math.min(8, t.turnCount || 1) + 0.3 * Math.max(0, 1 - age / 60)), count: t.turnCount || 1, firstSeen: t.createdAt || t.updatedAt, lastSeen: t.updatedAt || t.createdAt, spaceId: t.spaceId || null, meta: t });
  }
  for (const n of graphNodes) if (n.origin && n.origin.threadId && nodes.some(x => x.id === 'thread:' + n.origin.threadId)) edges.push({ a: n.id, b: 'thread:' + n.origin.threadId, weight: 0.35, at: n.firstSeen });
  (g.intents || []).slice(0, 40).forEach((it, i) => { const id = 'intent:' + (it.turnId || i); nodes.push({ id, kind: 'intent', label: it.text.replace(/^You(’|')re\s+/i, '').replace(/^You\s+(want|need|are)\s+/i, ''), weight: Math.max(0.15, 0.5 - i * 0.01), count: 1, firstSeen: it.at, lastSeen: it.at, meta: it }); if (it.threadId && nodes.some(x => x.id === 'thread:' + it.threadId)) edges.push({ a: id, b: 'thread:' + it.threadId, weight: 0.25, at: it.at }); });
  for (const b of (state.builds || []).slice(0, 60)) nodes.push({ id: 'build:' + b.id, kind: 'build', label: b.title || 'Built app', weight: 0.55, count: (b.versions && b.versions.length) || 1, firstSeen: b.createdAt || b.updatedAt, lastSeen: b.updatedAt || b.createdAt, meta: b });
  for (const c of (state.connectors || []).slice(0, 40)) nodes.push({ id: 'conn:' + c.id, kind: 'connector', label: c.name || c.preset || 'Connector', weight: 0.45, count: 1, firstSeen: c.createdAt || Date.now(), lastSeen: c.updatedAt || c.createdAt || Date.now(), meta: c });
  const domain = state.user && state.user.email && state.user.email.includes('@') ? state.user.email.split('@')[1] : '';
  return { nodes, edges, spaces: (state.spaces || []).map(s => ({ id: s.id, name: s.name })), org: { name: domain || 'Your organization' } };
}
const BRAIN_STOPS = [['Today', 0], ['1 week', 7], ['1 month', 30], ['6 months', 182], ['1 year', 365], ['5 years', 1826]];
/** The learned node types and the cortex each lives in (the brain's KIND map, mirrored so the lists can follow a region). */
const TYPE_CORTEX = { topic: 'knowledge', expertise: 'knowledge', entity: 'identity', goal: 'opportunity', style: 'communication' };
const DAY_MS = 86400000;
/** A Discover idea's "builds" word as a node type, when it names one (curated ideas name types; personal ideas name nodes). */
const TYPE_WORDS = { topic: 'topic', topics: 'topic', entity: 'entity', entities: 'entity', goal: 'goal', goals: 'goal', expertise: 'expertise', style: 'style', styles: 'style' };
/** The list controls on the Graph page. They outlive a re-render, so a filter survives a forget or a refresh. */
state.gfilter = { q: '', sort: 'weight', show: 'all', cortex: null, t: null, view: 'brain' };
/** Strengthening: it came back recently and more than once (the brain's own Emerging view is a little wider; the lists mark recurrence). */
function isEmergingNode(n, t) { t = t || Date.now(); return (t - n.lastSeen) < 14 * DAY_MS && (n.count || 1) >= 2; }
function isFadingNode(n, t) { t = t || Date.now(); return n.weight < 0.3 && (t - n.lastSeen) > 30 * DAY_MS; }
function isPlaceNode(n) { return !!(n && (n.place || (n.geo && n.geo.type === 'Point'))); }
/** A learned node as the brain models it, so the node panel works from a chip whether or not the brain is mounted. */
function brainNodeFor(n) {
  if (!n) return null;
  const live = state.graph3d && state.graph3d.node ? state.graph3d.node(n.id) : null;
  return live || { id: n.id, kind: n.type, label: n.label, weight: n.weight, count: n.count, firstSeen: n.firstSeen, lastSeen: n.lastSeen, level: n.level, origin: n.origin && n.origin.threadId ? n.origin.threadId : null, meta: n };
}
/** Every mounted view of the graph (the brain, the map), so a hover, a search or a time change reaches all of them. */
function graphViews() { return [state.graph3d, state.graphMap].filter(v => v && v.destroy); }
/** Light a node in every view; with nothing to light, fall back to the node pinned by "Show in the brain" (state.gPinned). */
function lightNode(id) { const want = id || state.gPinned || null; graphViews().forEach(v => { if (v.highlight) v.highlight(want); }); }
/** Find a node by id, or by label (Discover's "builds" chips name nodes by label). */
function findGraphNode(ref) {
  const g = state.graph; if (!g || !ref) return null;
  if (g.nodes[ref]) return g.nodes[ref];
  const key = String(ref).toLowerCase().trim();
  return Object.values(g.nodes).find(n => n.label.toLowerCase() === key) || Object.values(g.nodes).find(n => slugify(n.label) === slugify(key)) || null;
}
/** Mark the chip for a node (hot: hovered in the brain; on: selected), clearing the mark elsewhere. */
function markChip(main, id, cls) {
  $$('.nchip.' + cls, main).forEach(c => c.classList.remove(cls));
  if (!id) return null;
  const c = main.querySelector(`.nchip.live[data-node="${String(id).replace(/["\\]/g, '\\$&')}"]`);
  if (c) c.classList.add(cls);
  return c;
}
/** Load the map module once (graphmap.js). */
function ensureGraphMap() {
  if (window.RicorsaGraphMap) return Promise.resolve(true);
  return new Promise(resolve => {
    let sc = document.querySelector('script[data-graphmap]');
    if (!sc) { sc = document.createElement('script'); sc.src = '/app/assets/graphmap.js'; sc.dataset.graphmap = '1'; document.head.appendChild(sc); }
    sc.addEventListener('load', () => resolve(!!window.RicorsaGraphMap)); sc.addEventListener('error', () => resolve(false));
    if (window.RicorsaGraphMap) resolve(true);
  });
}
/** The question "Ask about this" starts for a node, in the person's own voice. */
function askFor(n, gn) {
  const L = n.label;
  if (gn && isPlaceNode(gn)) return `What is happening in ${L} that matters for my work?`;
  switch (n.kind) {
    case 'topic': return `Give me a current briefing on ${L}: what has changed lately and what matters for my work.`;
    case 'entity': return `What is the latest on ${L} that matters for what I am working on?`;
    case 'goal': return `What are the next concrete steps toward this goal: ${L}?`;
    case 'expertise': return `Given my level in ${L}, what should I learn or do next?`;
    case 'intent': return `Help me with this: ${L}`;
    default: return '';
  }
}
/** Discover ideas already generated this session that draw on a node (its label appears in the idea's "builds"). */
function ideasDrawingOn(label) {
  const key = String(label || '').toLowerCase().trim(); const out = [];
  for (const [k, entry] of Object.entries(state.discoverGen || {})) {
    if (!entry || !entry.items) continue;
    const cat = k.split('|')[0];
    for (const it of entry.items) if ((it.builds || []).some(b => String(b).toLowerCase().trim() === key) && !out.some(o => o.it.title === it.title)) out.push({ cat, key: k, it });
  }
  return out.slice(0, 4);
}
/** Light one node in whichever view is showing and bring the stage into view. */
async function showInBrain(id, preferMap) {
  const main = $('#main'); const f = state.gfilter;
  const stage = $('#g3d', main); if (!stage) return;
  const gn = state.graph && state.graph.nodes[id]; const onMap = !!(gn && gn.geo && gn.geo.type === 'Point');
  const want = preferMap && onMap ? 'map' : (f.view === 'map' && !onMap ? 'brain' : f.view);
  if (want !== f.view || (want === 'map' && !state.graphMap)) await showGraphView(main, state.graph, want);
  if (!stage.isConnected) return;
  state.gPinned = id;
  graphViews().forEach(v => { if (v.select) v.select(id); });
  lightNode(id);
  markChip(main, id, 'on');
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  clearTimeout(state.gHighlightTimer);
  state.gHighlightTimer = setTimeout(() => { if (state.gPinned === id) state.gPinned = null; lightNode(null); }, 7000);
}
/** Swap the stage between the living brain and the map; the time, search, labels and region focus carry over. */
async function showGraphView(main, g, view) {
  const f = state.gfilter; f.view = view === 'map' ? 'map' : 'brain';
  $$('[data-g3d-view]', main).forEach(b => { const on = b.dataset.g3dView === f.view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const bstage = $('#g3dStage', main), mstage = $('#gmapStage', main);
  if (!bstage || !mstage) return;
  if (f.view === 'map') {
    mstage.hidden = false; bstage.hidden = true;
    const ok = await ensureGraphMap();
    if (!mstage.isConnected) return;
    if (!ok) { mstage.hidden = true; bstage.hidden = false; f.view = 'brain'; $$('[data-g3d-view]', main).forEach(b => b.classList.toggle('on', b.dataset.g3dView === 'brain')); toast('The map could not be loaded', 'bad'); return; }
    if (!state.graphMap) {
      const tip = $('#gmTip', main);
      const attribution = state.geo && state.geo.provider === 'custom' ? 'Place data from the configured geocoder' : 'Place data © OpenStreetMap contributors';
      state.graphMap = window.RicorsaGraphMap.mount(mstage, brainModel(g), {
        attribution,
        onHover: (n, x, y) => {
          markChip(main, n ? n.id : null, 'hot');
          if (!tip) return;
          if (!n) { tip.style.opacity = '0'; return; }
          const gn = n.meta || {};
          tip.innerHTML = `<b>${esc(n.label)}</b>${esc(truncate(gn.geoName || '', 70))}${gn.geoKind ? ' · ' + esc(gn.geoKind) : ''}<br><span style="opacity:.75">seen ${n.count}× · weight ${(n.weight * 100).toFixed(0)} · ${relTime(n.lastSeen)} · click for details</span>`;
          tip.style.opacity = '1'; const r = mstage.getBoundingClientRect(); tip.style.left = Math.min(r.width - 280, Math.max(8, x + 14)) + 'px'; tip.style.top = Math.max(8, y - 10) + 'px';
        },
        onSelect: (n) => { markChip(main, n.id, 'on'); if (state.graph3d) state.graph3d.select(n.id); nodePanel(n, state.graph3d); },
      });
      state.graphMap.setTime(f.t || Date.now()); state.graphMap.setQuery(f.q); state.graphMap.setLabels(!!($('#g3dLabels', main) || { checked: true }).checked); state.graphMap.focus(f.cortex);
    }
  } else { bstage.hidden = false; mstage.hidden = true; }
  $$('[data-brain-only]', main).forEach(el => el.classList.toggle('off', f.view === 'map'));
  const note = $('#g3dNote', main); if (note) note.textContent = f.view === 'map' ? 'The map is the same graph seen by place: every entity the geocoder could put somewhere (a city, a county, a site, an address your work is about), in the colors of its cortex, connected where the places were learned together. Places are added after the answer that names them. Drag to pan, scroll to zoom, hover a place for details, click for more.' : main.dataset.brainNote || '';
}
/** Mount the living brain into the graph page and wire the toolbar, the time controls, the cortex legend, the map and the node panel. */
async function mountGraph3D(main, g, fallback) {
  const stage = $('#g3dStage', main); if (!stage) return;
  const [ok] = await Promise.all([ensureGraph3D(), state.builds ? Promise.resolve() : loadBuilds().catch(() => {}), state.connectors ? Promise.resolve() : api('/api/connectors').then(r => { state.connectors = r.items || []; }).catch(() => {})]);
  if (!stage.isConnected) return;
  const tip = $('#gTip', main);
  if (!ok) {
    const box = $('#g3d', main); if (box) box.outerHTML = `<div class="g-wrap"><svg viewBox="0 0 ${fallback.W} ${fallback.H}" role="img" aria-label="Map of what Ricorsa has learned: ${fallback.all.length} nodes">${fallback.svg}</svg><div class="g-tip" id="gTip"></div></div>`;
    wireFallbackSvg(main, g);
    return;
  }
  if (state.graph3d && state.graph3d.destroy) { try { state.graph3d.destroy(); } catch (e) {} }
  if (state.graphMap && state.graphMap.destroy) { try { state.graphMap.destroy(); } catch (e) {} state.graphMap = null; }
  const f = state.gfilter; f.t = null;
  const when = $('#g3dWhen', main), scrub = $('#g3dScrub', main), play = $('#g3dPlay', main);
  const fmtWhen = (t, now) => t >= now - 60000 ? 'Today' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const kindLabel = (n) => n.kind === 'thread' ? 'Conversation' : n.kind === 'build' ? 'Built' : n.kind === 'connector' ? 'Connector' : n.kind === 'intent' ? 'Pattern' : (NODE_TYPES[n.kind] ? NODE_TYPES[n.kind].label.replace(/s$/, '').replace(/ie$/, 'y') : n.kind);
  let lastApply = 0;   // the lists follow the replay at most a few times a second
  const ctl = window.RicorsaGraph3D.mount(stage, brainModel(g), {
    onHover: (n, x, y) => {
      markChip(main, n && NODE_TYPES[n.kind] ? n.id : null, 'hot');
      if (!tip) return;
      if (!n) { tip.style.opacity = '0'; return; }
      const C = ctl.CORTEX[ctl.cortexOf(n)]; const settled = Math.round(ctl.settled(n) * 100);
      const facts = n.kind === 'thread' ? `${n.count} turn${n.count === 1 ? '' : 's'}` : n.kind === 'intent' ? 'inferred from a conversation' : n.kind === 'build' ? 'built in the studio' : n.kind === 'connector' ? 'connected channel' : `seen ${n.count}× · weight ${(n.weight * 100).toFixed(0)}`;
      tip.innerHTML = `<b>${esc(n.label)}</b>${esc(kindLabel(n))}${n.level ? ' · ' + esc(n.level) : ''} · ${facts}<br><span style="opacity:.75">${esc(C ? C.label : '')}${settled < 60 ? ` · settling (${settled}%)` : ''}${ctl.emerging(n) ? ' · strengthening' : ''} · ${relTime(n.lastSeen)} · click for details</span>`;
      tip.style.opacity = '1'; const r = stage.getBoundingClientRect(); tip.style.left = Math.min(r.width - 280, Math.max(8, x + 14)) + 'px'; tip.style.top = Math.max(8, y - 10) + 'px';
    },
    onSelect: (n) => { markChip(main, NODE_TYPES[n.kind] ? n.id : null, 'on'); nodePanel(n, ctl); },
    onTime: (t, playing) => { const { first, now } = ctl.range(); if (scrub) scrub.value = String(Math.round(1000 * (t - first) / Math.max(1, now - first))); if (when) when.textContent = fmtWhen(t, now); if (play) play.querySelector('span').textContent = playing ? 'Stop' : 'Replay'; $$('[data-g3d-stop]', main).forEach(b => b.classList.toggle('on', false)); f.t = t >= now - 60000 ? null : t; if (state.graphMap) state.graphMap.setTime(t); const ts = performance.now(); if (!playing || ts - lastApply > 150) { lastApply = ts; applyGraphFilters(main); } },
  });
  state.graph3d = ctl;
  const find = $('#g3dFind', main);
  if (find) { find.value = f.q; if (f.q) ctl.setQuery(f.q); find.addEventListener('input', () => { f.q = find.value.trim().toLowerCase(); graphViews().forEach(v => v.setQuery(f.q)); applyGraphFilters(main); }); }
  $('#g3dLabels', main).addEventListener('change', e => graphViews().forEach(v => v.setLabels(e.target.checked)));
  $('#g3dReset', main).addEventListener('click', () => { (f.view === 'map' && state.graphMap ? state.graphMap : ctl).resetView(); });
  const em = $('#g3dEmerging', main); if (em) em.addEventListener('click', () => { const on = ctl.setEmerging(!em.classList.contains('on')); em.classList.toggle('on', on); em.setAttribute('aria-pressed', String(on)); });
  const la = $('#g3dLattice', main); if (la) la.addEventListener('click', () => { const on = ctl.setLattice(!la.classList.contains('on')); la.classList.toggle('on', on); la.setAttribute('aria-pressed', String(on)); });
  const de = $('#g3dDensity', main); if (de) de.addEventListener('change', e => ctl.setDensity(e.target.value));
  const setTime = (t, now) => { ctl.setTime(t); if (state.graphMap) state.graphMap.setTime(t); f.t = t >= now - 60000 ? null : t; applyGraphFilters(main); };
  const setStop = (days) => { const { first, now } = ctl.range(); const t = days ? Math.max(first, now - days * 86400000) : now; setTime(t, now); if (when) when.textContent = days ? fmtWhen(t, now) : 'Today'; if (scrub) scrub.value = String(Math.round(1000 * (t - first) / Math.max(1, now - first))); if (play) play.querySelector('span').textContent = 'Replay'; $$('[data-g3d-stop]', main).forEach(b => b.classList.toggle('on', Number(b.dataset.g3dStop) === days)); };
  $$('[data-g3d-stop]', main).forEach(b => b.addEventListener('click', () => setStop(Number(b.dataset.g3dStop))));
  if (scrub) scrub.addEventListener('input', () => { const { first, now } = ctl.range(); const t = first + (now - first) * (Number(scrub.value) / 1000); setTime(t, now); if (when) when.textContent = fmtWhen(t, now); if (play) play.querySelector('span').textContent = 'Replay'; $$('[data-g3d-stop]', main).forEach(b => b.classList.remove('on')); });
  if (play) play.addEventListener('click', () => { if (ctl.playing()) ctl.stop(); else ctl.play(); });
  $$('[data-g3d-view]', main).forEach(b => b.addEventListener('click', () => showGraphView(main, g, b.dataset.g3dView)));
  const reg = $('#g3dRegions', main);
  if (reg) {
    const counts = ctl.counts();
    reg.innerHTML = Object.entries(ctl.CORTEX).map(([k, C]) => `<button type="button" class="g3d-region" data-g3d-region="${k}" style="--rc:${C.hex}" aria-pressed="false" title="Hover to light this region; click to keep it and filter the lists below to it"><b><i></i>${esc(C.label)}</b><span>${esc(C.sub)}</span><em>${counts[k] || 0} node${(counts[k] || 0) === 1 ? '' : 's'}</em></button>`).join('');
    const focusAll = (k) => graphViews().forEach(v => v.focus(k));
    $$('[data-g3d-region]', reg).forEach(b => {
      const key = b.dataset.g3dRegion;
      b.addEventListener('mouseenter', () => { if (!reg.querySelector('.pinned')) { focusAll(key); softenChips(main, key); } });
      b.addEventListener('mouseleave', () => { if (!reg.querySelector('.pinned')) { focusAll(null); softenChips(main, null); } });
      b.addEventListener('click', () => { const pinned = b.classList.contains('pinned'); $$('[data-g3d-region]', reg).forEach(x => { x.classList.remove('pinned'); x.setAttribute('aria-pressed', 'false'); }); softenChips(main, null); if (!pinned) { b.classList.add('pinned'); b.setAttribute('aria-pressed', 'true'); focusAll(key); f.cortex = key; } else { focusAll(null); f.cortex = null; } applyGraphFilters(main); });
    });
    if (f.cortex) { const b = reg.querySelector(`[data-g3d-region="${f.cortex}"]`); if (b) { b.classList.add('pinned'); b.setAttribute('aria-pressed', 'true'); focusAll(f.cortex); } else f.cortex = null; }
  }
  if (f.view === 'map') await showGraphView(main, g, 'map');
  if (!stage.isConnected) return;
  applyGraphFilters(main);
  // Arriving with a node in the address (from Discover, or a link): light it and bring its chip into view.
  const want = state.route && state.route.query && state.route.query.node ? findGraphNode(state.route.query.node) : null;
  if (want) { const c = markChip(main, want.id, 'on'); showInBrain(want.id, false); if (c) setTimeout(() => c.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600); }
}
/** Hovering a region: chips outside it soften (the pin hides them instead, through the filters). */
function softenChips(main, cortex) { $$('.nchip.live', main).forEach(c => c.classList.toggle('soft', !!cortex && TYPE_CORTEX[c.dataset.type] !== cortex)); }
/** The flat SVG fallback (when the brain module could not load): hover shows facts, click forgets. */
function wireFallbackSvg(main, g) {
  const wrap = $('.g-wrap', main), tip = $('#gTip', main); if (!wrap || !tip) return;
  const show = (el, ev) => { const n = g.nodes[el.dataset.node]; if (!n) return; const T = NODE_TYPES[n.type]; tip.innerHTML = `<b>${esc(n.label)}</b>${T.label}${n.level ? ' · ' + esc(n.level) : ''} · seen ${n.count}× · weight ${(n.weight * 100).toFixed(0)}<br><span style="opacity:.75">first ${relTime(n.firstSeen)} · last ${relTime(n.lastSeen)} · click for details</span>${n.origin ? `<br><span style="opacity:.75;font-family:var(--mono);font-size:11px">origin ${esc(shortHash(n.origin.lineage || n.origin.threadId))}${n.origin.ideaId ? ' · idea ' + esc(shortHash(n.origin.ideaId)) : ''}</span>` : ''}`; const r = wrap.getBoundingClientRect(); const x = ev ? ev.clientX - r.left : r.width / 2, y = ev ? ev.clientY - r.top : r.height / 2; tip.style.left = Math.min(x + 12, r.width - 250) + 'px'; tip.style.top = (y + 14) + 'px'; tip.style.opacity = '1'; };
  $$('.node', wrap).forEach(el => {
    el.addEventListener('mousemove', ev => show(el, ev)); el.addEventListener('mouseleave', () => tip.style.opacity = '0');
    el.addEventListener('focus', () => show(el)); el.addEventListener('blur', () => tip.style.opacity = '0');
    const open = () => { const n = g.nodes[el.dataset.node]; if (n) nodePanel(brainNodeFor(n), null); };
    el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}
/** Refresh the mounted brain, the map and the lists after the graph changed (learning while it is open): new nodes are born on screen. */
function refreshBrain() {
  if (!(state.graph && state.route && state.route.name === 'graph')) return;
  const main = $('#main'); const g = state.graph;
  const model = brainModel(g);
  if (state.graph3d) { try { state.graph3d.update(model); } catch (e) {} }
  if (state.graphMap) { try { state.graphMap.update(model); } catch (e) {} }
  const all = Object.values(g.nodes).sort((a, b) => b.weight - a.weight || b.lastSeen - a.lastSeen);
  const box = $('#gTypes', main); if (box) { box.innerHTML = graphTypeCardsHtml(all); wireGraphChips(main, g); applyGraphFilters(main); }
  const stats = $('#gStats', main); if (stats) stats.innerHTML = graphStatsHtml(g, all);
  const reg = $('#g3dRegions', main); if (reg && state.graph3d) { const counts = state.graph3d.counts(); $$('[data-g3d-region]', reg).forEach(b => { const em = b.querySelector('em'); const k = b.dataset.g3dRegion; if (em) em.textContent = `${counts[k] || 0} node${(counts[k] || 0) === 1 ? '' : 's'}`; }); }
}
function graphStatsHtml(g, all) {
  const places = all.filter(n => n.geo && n.geo.type === 'Point').length;
  return `<div class="g-stat"><b>${all.length}</b><span>nodes</span></div><div class="g-stat"><b>${Object.keys(g.edges).length}</b><span>connections</span></div><div class="g-stat"><b>${g.events}</b><span>learning events</span></div><div class="g-stat"><b>${g.intents.length}</b><span>intents recorded</span></div>${places ? `<div class="g-stat"><b>${places}</b><span>place${places === 1 ? '' : 's'} on the map</span></div>` : ''}`;
}
/** The five type cards, each a list of live chips. */
function graphTypeCardsHtml(all) {
  return Object.entries(NODE_TYPES).map(([t, T]) => {
    const list = all.filter(n => n.type === t);
    const sw = `<span class="sw dot ${T.shape}" style="display:inline-block;width:10px;height:10px;border-radius:${T.shape === 'circle' || T.shape === 'ring' ? '50%' : '2px'};background:${T.shape === 'ring' ? 'transparent' : T.hex};${T.shape === 'ring' ? `border:2px solid ${T.hex};box-sizing:border-box;` : ''}${T.shape === 'diamond' ? 'transform:rotate(45deg) scale(.85);' : ''}${T.shape === 'hex' ? 'clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);border-radius:0;' : ''}"></span>`;
    const chips = list.map(n => nodeChip(t, n.label, `<span class="cnt" title="Seen ${n.count} time${n.count === 1 ? '' : 's'} · weight ${(n.weight * 100).toFixed(0)}">×${n.count}</span>${n.level ? `<span class="lvl">${esc(n.level)}</span>` : ''}`, n.id, n)).join('');
    return `<div class="g-type${t === 'topic' ? ' wide' : ''}" data-type-card="${t}"><h3>${sw}${T.label}<span class="gen-tag" data-type-count="${t}">${list.length}</span></h3><p>${T.desc}</p><div class="chips">${chips || '<span class="none">Nothing yet</span>'}<span class="none" data-none-match hidden>Nothing here matches</span></div></div>`;
  }).join('');
}
/** The list toolbar: what to sort by, what to show, and the count; the search box in the brain's bar filters the lists too. */
function graphListBarHtml(all) {
  const places = all.filter(isPlaceNode).length;
  return `<div class="g-list-bar" id="gListBar">
    <span class="g-list-count" id="gListCount">${all.length} node${all.length === 1 ? '' : 's'}</span>
    <label class="g3d-check">Sort <select id="gSort" aria-label="Sort the lists"><option value="weight">Strongest first</option><option value="recent">Most recent</option><option value="seen">Most seen</option><option value="newest">Newest</option><option value="alpha">A to Z</option></select></label>
    <label class="g3d-check">Show <select id="gShow" aria-label="Which nodes to show"><option value="all">Everything</option><option value="strong">Strong (weight 55 and up)</option><option value="em">Strengthening</option><option value="new">New this week</option><option value="fade">Fading</option>${places ? '<option value="place">Places</option>' : ''}</select></label>
    <button type="button" class="btn sm ghost" id="gListClear" hidden>${icon('x', 12)}<span>Clear</span></button>
    <span class="spacer"></span>
    <span class="g-list-hint">${icon('brain', 13)}<span>Hover a chip to find it in the brain; click it for details, what it connects to and what Discover would build from it.</span></span>
  </div>`;
}
/** Apply the list controls: the search, the pinned region, the "show" choice, the time scrubber and the sort, and update every count. */
function applyGraphFilters(main) {
  main = main || $('#main'); const f = state.gfilter; const g = state.graph; if (!g) return;
  const t = f.t || Date.now();
  const chips = $$('.g-type .nchip.live', main);
  const keyOf = { weight: c => -Number(c.dataset.w), recent: c => -Number(c.dataset.last), seen: c => -Number(c.dataset.count), newest: c => -Number(c.dataset.first), alpha: c => c.dataset.label };
  const key = keyOf[f.sort] || keyOf.weight;
  let shown = 0;
  for (const c of chips) {
    const n = g.nodes[c.dataset.node]; if (!n) { c.hidden = true; continue; }
    let ok = n.firstSeen <= t;
    if (ok && f.q) ok = c.dataset.label.includes(f.q);
    if (ok && f.cortex) ok = TYPE_CORTEX[n.type] === f.cortex;
    if (ok) switch (f.show) { case 'strong': ok = n.weight >= 0.55; break; case 'em': ok = isEmergingNode(n, t); break; case 'new': ok = t - n.firstSeen < 7 * DAY_MS; break; case 'fade': ok = isFadingNode(n, t); break; case 'place': ok = isPlaceNode(n); break; default: break; }
    c.hidden = !ok; if (ok) shown++;
  }
  for (const card of $$('.g-type', main)) {
    const box = $('.chips', card); const list = $$('.nchip.live', box);
    const sorted = list.slice().sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -1 : ka > kb ? 1 : 0; });
    if (sorted.some((c, i) => c !== list[i])) sorted.forEach(c => box.appendChild(c));
    const visible = list.filter(c => !c.hidden).length;
    const none = $('[data-none-match]', box); if (none) { none.hidden = !(list.length && !visible); box.appendChild(none); }
    const cnt = $('[data-type-count]', card); if (cnt) cnt.textContent = visible === list.length ? String(list.length) : `${visible} of ${list.length}`;
  }
  const count = $('#gListCount', main); if (count) count.textContent = shown === chips.length ? `${chips.length} node${chips.length === 1 ? '' : 's'}` : `${shown} of ${chips.length} nodes`;
  const active = !!(f.q || f.cortex || f.show !== 'all' || f.t);
  const clear = $('#gListClear', main); if (clear) clear.hidden = !active;
  const sort = $('#gSort', main); if (sort && sort.value !== f.sort) sort.value = f.sort;
  const show = $('#gShow', main); if (show && show.value !== f.show) show.value = f.show;
}
function clearGraphFilters(main) {
  const f = state.gfilter; f.q = ''; f.show = 'all'; f.cortex = null;
  const find = $('#g3dFind', main); if (find) find.value = '';
  graphViews().forEach(v => { v.setQuery(''); v.focus(null); });
  $$('[data-g3d-region]', main).forEach(b => { b.classList.remove('pinned'); b.setAttribute('aria-pressed', 'false'); });
  softenChips(main, null);
  if (f.t) { const b = main.querySelector('[data-g3d-stop="0"]'); if (b) b.click(); else f.t = null; }
  applyGraphFilters(main);
}
/** Wire the list toolbar (once per render) and the chips (after every rebuild). */
function wireGraphLists(main, g) {
  const f = state.gfilter;
  const sort = $('#gSort', main), show = $('#gShow', main), clear = $('#gListClear', main);
  if (sort) { sort.value = f.sort; sort.addEventListener('change', () => { f.sort = sort.value; applyGraphFilters(main); }); }
  if (show) { show.value = f.show; if (show.value !== f.show) { f.show = 'all'; show.value = 'all'; } show.addEventListener('change', () => { f.show = show.value; applyGraphFilters(main); }); }
  if (clear) clear.addEventListener('click', () => clearGraphFilters(main));
  wireGraphChips(main, g);
}
function wireGraphChips(main, g) {
  const box = $('#gTypes', main); if (!box) return;
  const light = lightNode;
  $$('.nchip.live', box).forEach(c => {
    const id = c.dataset.node;
    c.addEventListener('mouseenter', () => light(id));
    c.addEventListener('mouseleave', () => light(null));
    c.addEventListener('focus', () => light(id));
    c.addEventListener('blur', () => light(null));
    c.addEventListener('click', async (e) => {
      const fb = e.target.closest('[data-forget]');
      if (fb) {
        e.stopPropagation(); const n = g.nodes[fb.dataset.forget];
        try { await forgetNode(fb.dataset.forget); } catch (err) { apiToast(err); return; }
        light(null); refreshBrain(); toast(n ? `Forgot \u201c${truncate(n.label, 30)}\u201d` : 'Forgotten');
        return;
      }
      const n = state.graph && state.graph.nodes[id]; if (!n) return;
      markChip(main, n.id, 'on'); graphViews().forEach(v => v.select && v.select(n.id));
      nodePanel(brainNodeFor(n), state.graph3d);
    });
    c.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); c.click(); } });
  });
}
/** Everything about one node: what it is, where it came from, what it connects to, and what can be done with it. */
function nodePanel(n, ctl) {
  ctl = ctl || (state.graph3d && state.graph3d.destroy ? state.graph3d : null);
  const C = ctl ? ctl.CORTEX[ctl.cortexOf(n)] : null; const settled = ctl ? Math.round(ctl.settled(n) * 100) : 100;
  const when = (v) => v ? `${new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${relTime(v)})` : '';
  const g = state.graph;
  const kindLabel = n.kind === 'thread' ? 'Conversation' : n.kind === 'build' ? 'Built in the studio' : n.kind === 'connector' ? 'Connected channel' : n.kind === 'intent' ? 'Pattern Ricorsa inferred' : (NODE_TYPES[n.kind] ? NODE_TYPES[n.kind].label.replace(/s$/, '').replace(/ie$/, 'y') : n.kind);
  const learned = !!(g && NODE_TYPES[n.kind]);
  const gn = learned ? g.nodes[n.id] || null : null;
  const linked = learned ? Object.values(g.edges).filter(e => e.a === n.id || e.b === n.id).map(e => ({ node: g.nodes[e.a === n.id ? e.b : e.a], w: e.weight })).filter(x => x.node).sort((a, b) => b.w - a.w).slice(0, 10) : [];
  const taught = n.kind === 'thread' && g ? Object.values(g.nodes).filter(x => x.origin && 'thread:' + x.origin.threadId === n.id).sort((a, b) => b.weight - a.weight).slice(0, 10) : [];
  const open = n.kind === 'thread' ? `#/thread/${esc(n.meta.id)}` : n.kind === 'build' ? `#/build/${esc(n.meta.id)}` : n.kind === 'connector' ? '#/connectors' : n.origin ? `#/thread/${esc(n.origin)}` : (n.meta && n.meta.threadId ? `#/thread/${esc(n.meta.threadId)}` : '');
  const ideas = learned ? ideasDrawingOn(n.label) : [];
  const place = isPlaceNode(gn);
  const geoLine = place ? (gn.geo ? `On the map as ${esc(truncate(gn.geoName || n.label, 80))}${gn.geoKind ? ` (${esc(gn.geoKind)})` : ''}.` : gn.geoFailedAt ? 'A place Ricorsa could not put on the map.' : 'A place; Ricorsa puts it on the map after the next answer.') : '';
  const org = gn && gn.origin ? gn.origin : null;
  const askQ = askFor(n, gn);
  const chip = (x) => `<button type="button" class="chip" data-np-node="${esc(x.id)}" title="${esc(x.label)} · weight ${(x.weight * 100).toFixed(0)}"><i style="background:${(NODE_TYPES[x.type] || {}).hex || '#888'}"></i>${esc(truncate(x.label, 30))}</button>`;
  openModal(`<h2><i style="display:inline-block;width:12px;height:12px;margin-right:8px;border-radius:${n.kind === 'entity' || n.kind === 'connector' ? '3px' : '50%'};background:${C ? C.hex : ((NODE_TYPES[n.kind] || {}).hex || '#888')};vertical-align:-1px"></i>${esc(n.label)}</h2>
    <p class="sub">${esc(kindLabel)}${n.level ? ` · ${esc(n.level)}` : ''}${C ? ` · ${esc(C.label)}` : ''}${settled < 60 ? ` · still settling (${settled}%)` : ''}${ctl && ctl.emerging(n) ? ' · strengthening now' : ''}${place ? ' · place' : ''}</p>
    <div class="node-facts">
      ${learned ? `<div><small>Weight</small><b>${(n.weight * 100).toFixed(0)}</b></div><div><small>Seen</small><b>${n.count}×</b></div>` : n.kind === 'thread' ? `<div><small>Turns</small><b>${n.count}</b></div><div><small>Space</small><b>${esc((state.spaces.find(s => s.id === n.spaceId) || {}).name || 'None')}</b></div>` : ''}
      <div><small>First</small><b>${esc(when(n.firstSeen))}</b></div>
      <div><small>Last</small><b>${esc(when(n.lastSeen))}</b></div>
    </div>
    ${geoLine ? `<p class="sub node-geo">${icon('pin', 13)}<span>${geoLine}</span></p>` : ''}
    ${linked.length ? `<div class="node-links"><small>Connected to</small><div class="chips">${linked.map(x => chip(x.node)).join('')}</div></div>` : ''}
    ${taught.length ? `<div class="node-links"><small>Taught Ricorsa</small><div class="chips">${taught.map(chip).join('')}</div></div>` : ''}
    ${ideas.length ? `<div class="node-links"><small>Discover ideas that draw on it</small><div class="np-ideas">${ideas.map(x => `<button type="button" class="np-idea" data-np-idea="${esc(x.key)}" data-np-idea-id="${esc(x.it.id || '')}"><span class="k">${esc(x.it.kind || x.cat)}</span><span>${esc(truncate(x.it.title, 64))}</span></button>`).join('')}</div></div>` : ''}
    ${learned && org ? `<p class="sub" style="margin-top:10px">Learned from a conversation${org.ideaId ? ' started from a Discover idea' : ''}${org.lineage ? ` · lineage <span class="hash">${esc(shortHash(org.lineage))}</span>` : ''}.</p>` : ''}
    <div class="modal-actions wrap">${learned ? `<button type="button" class="btn danger left" id="npForget">Forget</button>` : ''}${n.kind === 'thread' && taught.length && ctl ? `<button type="button" class="btn left" id="npTrace">${icon('sparkles', 14)}Trace what it taught</button>` : ''}${learned && $('#g3d') ? `<button type="button" class="btn" id="npShow">${icon('brain', 14)}<span>Show in the brain</span></button>` : ''}${place && gn.geo && $('#g3d') ? `<button type="button" class="btn" id="npMap">${icon('map', 14)}<span>On the map</span></button>` : ''}${learned ? `<button type="button" class="btn" id="npDiscover" title="Ideas centered on this node, combined with the rest of your graph">${icon('compass', 14)}<span>Discover from this</span></button>` : ''}${askQ ? `<button type="button" class="btn" id="npAsk" title="${esc(askQ)}">${icon('search', 14)}<span>Ask about this</span></button>` : ''}${open ? `<a class="btn" href="${open}" data-close>${n.kind === 'thread' ? 'Open the conversation' : n.kind === 'build' ? 'Open in the studio' : n.kind === 'connector' ? 'Open Connectors' : 'Open the conversation'}</a>` : ''}<button type="button" class="btn primary" data-close>Done</button></div>`, {
    onMount: (ov) => {
      const f = $('#npForget', ov); if (f) f.addEventListener('click', async () => { closeModal(); try { await forgetNode(n.id); } catch (e) { apiToast(e); return; } if (state.route.name === 'graph') refreshBrain(); toast(`Forgot \u201c${truncate(n.label, 30)}\u201d`); });
      const tr = $('#npTrace', ov); if (tr) tr.addEventListener('click', () => { closeModal(); ctl.traceThread(n.meta.id, { label: 'What \u201c' + truncate(n.label, 60) + '\u201d taught Ricorsa' }); });
      const sh = $('#npShow', ov); if (sh) sh.addEventListener('click', () => { closeModal(); showInBrain(n.id, false); });
      const mp = $('#npMap', ov); if (mp) mp.addEventListener('click', () => { closeModal(); showInBrain(n.id, true); });
      const di = $('#npDiscover', ov); if (di) di.addEventListener('click', () => { closeModal(); go('#/discover?anchor=' + encodeURIComponent(n.id)); });
      const ak = $('#npAsk', ov); if (ak) ak.addEventListener('click', () => { closeModal(); startThread(askQ, { mode: 'search', tier: state.settings.tier, focus: 'web', origin: { kind: 'graph', nodeId: n.id, title: truncate(n.label, 120), at: Date.now() } }); });
      $$('[data-np-node]', ov).forEach(b => b.addEventListener('click', () => { const x = g.nodes[b.dataset.npNode]; if (!x) return; graphViews().forEach(v => { if (v.select) v.select(x.id); }); lightNode(x.id); markChip($('#main'), x.id, 'on'); nodePanel(brainNodeFor(x), ctl); }));
      $$('[data-np-idea]', ov).forEach(b => b.addEventListener('click', () => { closeModal(); const [cat, anchor] = b.dataset.npIdea.split('|'); state.discoverCat = cat; state.discoverFocus = b.dataset.npIdeaId || null; go(anchor ? '#/discover?anchor=' + encodeURIComponent(anchor) : '#/discover'); }));
    }
  });
}
/** The graph's provenance for a compliance reader: fingerprint, subject, counts and the latest lineage entries, and the export. */
async function graphProvenanceModal() {
  openModal(`<h2>${icon('loop', 20)}Provenance</h2><p class="sub">Reading your graph's fingerprint…</p><div class="skel"><i></i><i></i><i></i></div><div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>`);
  let s;
  try { s = await api('/api/graph/export?summary=1'); } catch (e) { apiToast(e, 'Could not read the provenance'); closeModal(); return; }
  if (!$('#overlay')) return;
  const fmt = (v) => v ? `${new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${new Date(v).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
  const rows = [['Graph fingerprint', s.fingerprint], ['Subject id', s.subject], ['Nodes', `${s.nodes} (${s.withOrigin} with a recorded origin, ${s.fromIdeas} traced to a Discover idea, ${s.anchored} on the map)`], ['Connections', String(s.edges)], ['Intents', String(s.intents)], ['Learning events', String(s.events)], ['Updated', fmt(s.updatedAt)]];
  if (s.full) rows.push(['Threads in the chain', `${s.threads} thread${s.threads === 1 ? '' : 's'}, ${s.turns} turn${s.turns === 1 ? '' : 's'}`]);
  const latest = (s.latest || []).map(x => `<div class="prov-row"><span class="n">${x.fromIdea ? icon('compass', 12) : icon('search', 12)}</span><div><div class="t">${esc(truncate(x.thread, 70))} <span class="muted">· ${relTime(x.at)}${x.added ? ` · added ${x.added} node${x.added === 1 ? '' : 's'}` : ''}</span></div><div class="u">${esc(x.lineage || 'pending')}</div></div></div>`).join('');
  openModal(`<h2>${icon('loop', 20)}Provenance</h2>
    <p class="sub">Your graph's SHA-256 fingerprint changes whenever the graph does, so a copy can be checked against the state it came from. The subject id is a one-way hash of your account, never the account itself. Every node records the conversation and turn that taught it; every turn chains onto the last from the thread's origin, a Discover idea or the thread itself.</p>
    <div class="prov">${rows.map(([k, v]) => `<div class="prov-row"><span class="k">${esc(k)}</span><span class="u">${esc(v)}</span></div>`).join('')}</div>
    ${s.full ? `<div class="sec-h" style="font-size:14px;margin-top:14px">Latest lineage</div><div class="prov">${latest || '<div class="sub">No turns yet.</div>'}</div>` : `<p class="sub" style="margin-top:12px">The full lineage chain (every thread's origin, every turn's hash and the nodes each turn added) is part of the full identity graph on Essentials and above; the export below carries what your plan includes.</p>`}
    <div class="modal-actions"><button type="button" class="btn" id="provExport">${icon('download', 14)}<span>Export with provenance</span></button><button type="button" class="btn" id="provCopy">${icon('copy', 14)}<span>Copy fingerprint</span></button><button type="button" class="btn primary" data-close>Done</button></div>`, {
    onMount: (ov) => {
      $('#provExport', ov).addEventListener('click', () => exportGraph());
      $('#provCopy', ov).addEventListener('click', async () => { const ok = await copyText(s.fingerprint); toast(ok ? 'Fingerprint copied' : 'Could not copy', ok ? 'ok' : 'bad'); });
    }
  });
}
/** Download the graph with its provenance from the server (the file name carries the fingerprint). */
async function exportGraph() {
  try {
    const r = await fetch('/api/graph/export', { credentials: 'same-origin' });
    if (!r.ok) throw Object.assign(new Error('Could not export the graph'), { status: r.status });
    const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'ricorsa-graph.json';
    downloadFile(name, await r.text(), 'application/json'); toast('Saved ' + name);
  } catch (e) { apiToast(e, 'Could not export the graph'); }
}
function renderGraph() {
  const main = $('#main'); const g = state.graph || { nodes: {}, edges: {}, intents: [], events: 0, paused: false, votes: { up: 0, down: 0 } };
  const all = Object.values(g.nodes).sort((a, b) => b.weight - a.weight || b.lastSeen - a.lastSeen);
  const drawn = all.slice(0, 42); const drawnIds = new Set(drawn.map(n => n.id));
  const edges = Object.values(g.edges).filter(e => drawnIds.has(e.a) && drawnIds.has(e.b));
  const W = 960, H = Math.max(380, Math.min(600, 320 + drawn.length * 8));
  let svg = '';
  if (drawn.length) {
    const pos = layoutGraph(drawn, edges, W, H);
    svg += edges.map(e => { const a = pos[e.a], b = pos[e.b]; return `<line class="edge" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-width="${(0.8 + e.weight * 1.8).toFixed(1)}" opacity="${(0.18 + e.weight * 0.35).toFixed(2)}"/>`; }).join('');
    svg += drawn.map(n => {
      const p = pos[n.id], r = 6 + 10 * n.weight, T = NODE_TYPES[n.type];
      const label = truncate(n.label, 28);
      return `<g class="node" tabindex="0" data-node="${esc(n.id)}" role="img" aria-label="${esc(n.label)}, ${T.label}, weight ${(n.weight * 100).toFixed(0)}"><circle class="halo" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r + 4).toFixed(1)}"/>${shapeSvg(n.type, p.x, p.y, r, T.hex)}<text class="lbl${n.weight < 0.3 ? ' dim' : ''}" x="${(p.x + r + 5).toFixed(1)}" y="${(p.y + 4).toFixed(1)}">${esc(label)}</text></g>`;
    }).join('');
  }
  const preview = caps().graph !== 'full';
  const places = all.filter(isPlaceNode).length;
  const brainNote = preview
    ? 'This is the preview of your living brain: the strongest of what Ricorsa has learned, your conversations, and what you have been trying to do. Six cortices are the layers of your intelligence, not brain anatomy; the body is your organization, the governed boundary. Essentials shows every node, every pathway and where each one came from. Drag to orbit, scroll to zoom, hover a node for details.'
    : 'Six cortices are the layers of your intelligence, not brain anatomy. The body is your organization, the governed boundary; the blue lattice is IGL, which checks every pathway Discover walks. What Ricorsa learns is born beside the conversation that taught it and settles into its cortex as it recurs. Hover a chip below to find it here; click a node for what it connects to and what Discover would build from it; click a conversation and trace what it taught. Drag to orbit, scroll to zoom.';
  main.dataset.brainNote = brainNote;
  main.innerHTML = `<div class="view">${topbarHtml('Your graph')}<div class="scroll"><div class="col wide">
    <div class="page-h"><h1>${icon('loop', 26)}Your graph</h1><div class="g-controls"><label class="switch${g.paused ? '' : ' on'}" id="learnSwitch"><i></i><span>${g.paused ? 'Learning paused' : 'Learning on'}</span></label><button type="button" class="btn sm" id="gProvenance" title="Fingerprint, subject id and lineage">${icon('key', 14)}<span>Provenance</span></button><button type="button" class="btn sm" id="gExport" title="Download the graph with its provenance">${icon('download', 14)}<span>Export</span></button><button type="button" class="btn sm danger" id="gReset">Reset</button></div></div>
    <p class="page-sub">Your living intelligence: everything Ricorsa has learned from ${g.events} conversation${g.events === 1 ? '' : 's'}, the conversations themselves, what you built and what you connected, inside your governed boundary. It belongs to your account and is folded into every question you ask. Weights strengthen with repetition and fade when unused; forget anything with the \u00d7 on a chip.</p>
    ${g.paused ? `<div class="paused-banner">${icon('pause', 16)}<span>Learning is paused. Answers still use what\u2019s here, but new conversations won\u2019t change it.</span></div>` : ''}
    <div class="g-stats" id="gStats">${graphStatsHtml(g, all)}</div>
    ${preview ? upgradeCard('This is the preview of your graph', `Ricorsa is learning you on every plan. Essentials shows the whole graph: every node and pathway, what you have been trying to do lately, where each node came from, and the lineage behind it.${all.length ? ` You have ${state.graphSize || all.length} nodes so far${(state.graphSize || 0) > all.length ? `; the ${all.length} strongest are shown here` : ''}.` : ''}`, 'Essentials') : ''}
    ${g.intents.length ? `<div class="intents"><h3>Lately you\u2019ve been trying to</h3><ol>${g.intents.slice(0, 5).map(i => `<li>${esc(i.text.replace(/^You(\u2019|')re\s+/i, '').replace(/^You\s+(want|need|are)\s+/i, ''))}<span class="when">${relTime(i.at)}</span></li>`).join('')}</ol></div>` : ''}
    ${drawn.length ? `<div class="g3d" id="g3d">
      <div class="g3d-bar">
        <div class="g3d-view" role="group" aria-label="View"><button type="button" data-g3d-view="brain" class="on" aria-pressed="true">${icon('brain', 13)}<span>Brain</span></button><button type="button" data-g3d-view="map" aria-pressed="false" title="${places ? `${places} place${places === 1 ? '' : 's'} in your graph` : 'Places Ricorsa learns are put on the map'}">${icon('map', 13)}<span>Map${places ? ` <em>${places}</em>` : ''}</span></button></div>
        <input type="search" id="g3dFind" placeholder="Find anything in your brain" aria-label="Find a node" autocomplete="off">
        <button type="button" class="g3d-toggle" id="g3dEmerging" aria-pressed="false" data-brain-only title="Light what is strengthening right now">${icon('sparkles', 13)}<span>Emerging</span></button>
        <button type="button" class="g3d-toggle on" id="g3dLattice" aria-pressed="true" data-brain-only title="The IGL governance lattice: every pathway Discover walks is checked against it">${icon('key', 13)}<span>Governance</span></button>
        <span class="spacer"></span>
        <label class="g3d-check" data-brain-only>Density <select id="g3dDensity" aria-label="Intelligence density"><option value="min">Minimal</option><option value="std" selected>Standard</option><option value="max">Maximum</option></select></label>
        <label class="g3d-check"><input type="checkbox" id="g3dLabels" checked> Labels</label>
        <button type="button" class="btn sm" id="g3dReset" title="Back to the starting view">${icon('refresh', 13)}<span>Reset view</span></button>
      </div>
      <div class="g3d-stage" id="g3dStage"><div class="g-tip" id="gTip"></div></div>
      <div class="g3d-stage" id="gmapStage" hidden><div class="g-tip" id="gmTip"></div></div>
      <div class="g3d-time">
        <button type="button" class="btn sm" id="g3dPlay" title="Watch your brain form from the first thing learned to now">${icon('clock', 13)}<span>Replay</span></button>
        <div class="g3d-stops">${BRAIN_STOPS.map(([l, d]) => `<button type="button" data-g3d-stop="${d}" class="${d === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>
        <input type="range" id="g3dScrub" min="0" max="1000" value="1000" aria-label="Point in time">
        <span class="g3d-when" id="g3dWhen">Today</span>
      </div>
      <div class="g3d-regions" id="g3dRegions"></div>
      <div class="g3d-note" id="g3dNote">${brainNote}</div>
    </div>`
      : `<div class="g-empty">${icon('loop', 30)}<div>Nothing learned yet.</div><p>Ask a few questions and come back, each answer adds what it revealed about what you\u2019re working on.</p><p><a href="#/">Ask something</a></p></div>`}
    ${all.length ? graphListBarHtml(all) : ''}
    <div class="g-types" id="gTypes">${graphTypeCardsHtml(all)}</div>
  </div></div></div>`;
  // interactions
  const stage = $('#g3dStage', main);
  if (stage) mountGraph3D(main, g, { W, H, svg, all });
  wireGraphLists(main, g);
  applyGraphFilters(main);
  $('#learnSwitch', main).addEventListener('click', async () => { try { await setGraphPaused(!g.paused); } catch (e) { apiToast(e); return; } renderGraph(); toast(state.graph.paused ? 'Learning paused' : 'Learning on'); });
  $('#gProvenance', main).addEventListener('click', () => graphProvenanceModal());
  $('#gExport', main).addEventListener('click', () => exportGraph());
  $('#gReset', main).addEventListener('click', () => openModal(`<h2>Reset your graph?</h2><p class="sub">Everything Ricorsa has learned about you is erased. Your threads stay.</p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn danger" id="rsOk">Reset</button></div>`, { onMount: () => $('#rsOk').addEventListener('click', async () => { closeModal(); try { await resetGraph(); } catch (e) { apiToast(e); return; } renderGraph(); toast('Graph reset'); }) }));
  // Arriving with a type in the address (from a Discover idea's chips): bring that list into view.
  const wantType = state.route && state.route.query && state.route.query.type ? TYPE_WORDS[String(state.route.query.type).toLowerCase().trim()] || '' : '';
  if (wantType && NODE_TYPES[wantType]) { const card = main.querySelector(`[data-type-card="${wantType}"]`); if (card) { card.classList.add('flash'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); setTimeout(() => card.classList.remove('flash'), 2600); } }
  wireTopbar(main);
}

// ---------- Settings ----------
function openSettings() {
  const s = state.settings;
  const sel = (id, opts, cur) => `<select id="${id}">${Object.entries(opts).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('')}</select>`;
  openModal(`<h2>${icon('settings', 20)}Settings</h2><p class="sub">Defaults for new questions. Each composer can still override them.</p>
    <div class="setting"><div class="l"><b>Default mode</b><small>Search answers fast; Research writes a structured report.</small></div>${sel('stMode', MODES, s.mode)}</div>
    <div class="setting"><div class="l"><b>Default model</b><small>Best balances speed and depth; Reasoning thinks longest.</small></div>${sel('stTier', TIERS, s.tier)}</div>
    <div class="setting"><div class="l"><b>Default focus</b><small>Shapes the framing and the kind of references used.</small></div>${sel('stFocus', FOCI, s.focus)}</div>
    <div class="setting"><div class="l"><b>Answer length</b><small>Applies to Search mode.</small></div>${sel('stLen', LENGTHS, s.length)}</div>
    <div class="setting"><div class="l"><b>Learning loop</b><small>Let each answer update your identity graph, which shapes how later questions are read.</small></div><select id="stLearn"><option value="on"${state.graph && state.graph.paused ? '' : ' selected'}>On</option><option value="paused"${state.graph && state.graph.paused ? ' selected' : ''}>Paused</option></select></div>
    ${state.user && state.user.admin ? `<div class="setting"><div class="l"><b>Sign-ups and activity</b><small>Admin only. Every account on Ricorsa: when it signed up, its plan, what it has asked and built, when it was last seen.</small></div><button type="button" class="btn sm" data-accounts>${icon('users', 14)}Accounts</button></div>
    <div class="setting"><div class="l"><b>Demo as plan</b><small>Admin only. See Ricorsa the way a Free, Essentials, Professional or Enterprise customer sees it; your own limits stay off.</small></div><select id="stDemo"><option value=""${!s.demoPlan ? ' selected' : ''}>Admin (everything)</option><option value="free"${s.demoPlan === 'free' ? ' selected' : ''}>Free</option><option value="essentials"${s.demoPlan === 'essentials' || s.demoPlan === 'pro' ? ' selected' : ''}>Essentials</option><option value="professional"${s.demoPlan === 'professional' || s.demoPlan === 'team' ? ' selected' : ''}>Professional</option><option value="enterprise"${s.demoPlan === 'enterprise' ? ' selected' : ''}>Enterprise</option></select></div>
    <div class="setting"><div class="l"><b>Grant a plan by email</b><small>Admin only. Give someone Essentials, Professional or Enterprise without a subscription: a consultant, a partner, a pilot. It lands on their account when they sign in with that address.</small></div><button type="button" class="btn sm" data-grants>${icon('key', 14)}Grants</button></div>
    <div class="setting"><div class="l"><b>Model accounts</b><small>Admin only. Add a provider's API key (Anthropic, OpenAI, Google, xAI, Mistral, DeepSeek, Groq, Moonshot, OpenRouter, Together or any compatible endpoint), see what each account answers, and choose the active model for each part of Ricorsa.</small></div><button type="button" class="btn sm" data-models>${icon('zap', 14)}Manage</button></div>` : ''}
    <div class="setting"><div class="l"><b>Plan and usage</b><small>${state.user && state.user.admin ? `Admin account${s.demoPlan ? `, showing the ${esc(state.plan ? state.plan.name : '')} plan` : ''}. No question limits. Today ${state.usage.today} questions, this month ${state.usage.month}${state.usage.research ? `, Research ${state.usage.research}` : ''}.` : `${esc(state.plan ? state.plan.name : 'Free')} plan. Today ${state.usage.today} of ${state.plan ? state.plan.questionsPerDay : 0} questions, this month ${state.usage.month} of ${state.plan ? state.plan.questionsPerMonth : 0}${state.plan && state.plan.researchPerMonth ? `, Research ${state.usage.research} of ${state.plan.researchPerMonth}` : ''}.`}</small></div><a class="btn sm" href="/account">Account</a></div>
    <div class="setting"><div class="l"><b>Export everything</b><small>All threads, Spaces and your graph as one JSON file.</small></div><a class="btn sm" href="/api/account/export">${icon('download', 14)}Export</a></div>
    <div class="setting"><div class="l"><b>Sign out</b><small>Signed in as ${esc(state.user ? (state.user.email || state.user.name || '') : '')}. Sign out to switch to a different account.</small></div><a class="btn sm" href="/auth/logout">Sign out</a></div>
    <div class="about">Threads, Spaces, settings and your identity graph are stored in your Ricorsa account and used only inside your own questions. Sources are retrieved live from the web at the moment you ask.</div>
    <div class="modal-actions"><button type="button" class="btn primary" data-close>Done</button></div>`, {
    onMount: ov => {
      const bind = (id, key) => $(id).addEventListener('change', e => { s[key] = e.target.value; persistSettings(); });
      bind('#stMode', 'mode'); bind('#stTier', 'tier'); bind('#stFocus', 'focus'); bind('#stLen', 'length');
      const demo = $('#stDemo'); if (demo) demo.addEventListener('change', async e => { s.demoPlan = e.target.value; try { await api('/api/me', { method: 'PATCH', body: { demoPlan: e.target.value } }); await bootstrap(); renderSidebar(); render(); toast(e.target.value ? `Showing Ricorsa as a ${state.plan ? state.plan.name : e.target.value} customer` : 'Back to full admin access'); } catch (err) { apiToast(err); } });
      $('#stLearn').addEventListener('change', async e => { try { await setGraphPaused(e.target.value === 'paused'); } catch (err) { apiToast(err); } });
      const gr = $('[data-grants]', ov); if (gr) gr.addEventListener('click', () => grantsModal());
      const mo = $('[data-models]', ov); if (mo) mo.addEventListener('click', () => modelsModal());
      const ac = $('[data-accounts]', ov); if (ac) ac.addEventListener('click', () => accountsModal());
    }
  });
}
/**
 * Admins: the model accounts. Every provider Ricorsa can talk to is a card: add the provider's API key (pasted here,
 * stored sealed) and every model on that account becomes available; then choose the active model for each part of
 * the product. Check sends one tiny message so the provider's exact answer is on screen.
 */
const TIER_LABEL = { quick: 'Fast answers', default: 'Best answers', complex: 'Reasoning answers', build: 'Build studio', ideas: 'Discover ideas' };
const TIER_NOTE = { quick: 'Planning, rewrites and the Fast setting', default: 'Search answers and built apps', complex: 'The Reasoning setting', build: 'Writing and repairing apps', ideas: 'Discover ideas' };
const NOT_CHAT = /embed|whisper|tts|image|dall|moderation|audio|realtime|rerank|transcri|speech|-vl-|vision-only|guard|ocr|sora|veo|imagen|video|babbage|davinci|computer-use/i;
const KEY_OWNER_NAMES = { anthropic: 'an Anthropic', openrouter: 'an OpenRouter', groq: 'a Groq', xai: 'an xAI', google: 'a Google' };
/** What to do about a refusal, read from the probe when there is one and from the stored answer otherwise. */
function providerHint(p, probe) {
  const msg = (probe && probe.message) || p.error || (p.setAside && p.setAside.why) || '';
  const hm = /HTTP (\d{3})/.exec(msg); const st = probe ? probe.status : hm ? +hm[1] : 0;
  if (p.mcp) return 'This address is an MCP server, not a model API. Remove it here and add it under Connectors as a custom MCP server.';
  // A key pasted into the wrong card (an Anthropic key on the DeepSeek card) is the commonest slip; the prefix gives it away.
  if (p.keyOwner && p.keyOwner !== p.id && !p.custom && !p.aggregator) return `The key stored here looks like ${KEY_OWNER_NAMES[p.keyOwner] || "another provider's"} key. Remove it, or replace it with a key from ${p.name}.`;
  if (st === 401 || /invalid.*key|api key.*invalid|incorrect api key|authentication|unauthorized/i.test(msg)) return `The key is not accepted. Paste a current key from ${p.custom ? 'the endpoint' : p.name}.`;
  if (st === 402 || /credit|billing|balance|quota|insufficient/i.test(msg)) return 'The account behind this key has no credit or is over its quota. Add credit to the organization that owns this key, then press Check.';
  if (st === 404 || /no longer available|not found|does not exist|unknown model/i.test(msg)) return 'The model used for the check is not available to this key. Press Check to try the newest one on the account, or pick another model below.';
  if (/max_completion_tokens|unsupported parameter/i.test(msg)) return 'The check used a request format this model does not take. Press Check to run it again.';
  if (st === 403) return 'The key is valid but not allowed to use this model or this API. Check the key permissions and the organization plan.';
  if (/No model list came back/i.test(msg)) return 'The endpoint did not list its models. Use Replace key to give a model id to test with.';
  if (st === 0 && msg && /fetch|network|timeout|timed out|econn|abort|socket|dns|certificate/i.test(msg)) return 'The provider could not be reached from this server.';
  return '';
}
function providerStatusHtml(p, probe) {
  if (!p.configured) return `<span class="muted">No key yet.</span>`;
  const when = p.checkedAt ? ` <small class="muted">${esc(relTime(p.checkedAt))}</small>` : '';
  if (p.setAside) return `<span class="bad">Set aside until ${esc(new Date(p.setAside.until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}:</span> ${esc(p.setAside.why || '')}`;
  if (probe) return probe.ok ? `<span class="ok">Working.</span> ${esc(probe.message)} in ${Math.round(probe.ms / 100) / 10}s.` : `<span class="bad">Refused${probe.status ? ` (HTTP ${probe.status})` : ''}:</span> ${esc(probe.message)}`;
  if (p.status === 'ok') return `<span class="ok">Working.</span>${when}`;
  if (p.status === 'refused') return `<span class="bad">Refused:</span> ${esc(p.error || '')}${when}`;
  return `<span class="muted">Key set, not checked yet.</span>`;
}
async function modelsModal(opts = {}) {
  openModal(`<h2>${icon('zap', 20)}Model accounts</h2><p class="sub">${opts.probe ? 'Asking every provider with a key for one tiny message.' : 'Loading the accounts.'}</p><div class="skel"><i></i><i></i><i></i></div>`, { wide: true });
  let r;
  try { r = await api('/api/admin/models' + (opts.probe ? '?probe=1' : '')); } catch (e) { apiToast(e, 'Could not load the model accounts'); return; }
  paintModels(r);
}
function paintModels(r) {
  const providers = r.providers || []; const probes = r.probes || {}; const settings = r.settings || {};
  const configured = providers.filter(p => p.configured);
  const chatModels = p => (p.models || []).filter(id => !NOT_CHAT.test(id)).sort();
  const cards = providers.map(p => {
    const probe = probes[p.id]; const hint = p.configured ? providerHint(p, probe) : '';
    return `<div class="prov-card${p.configured ? '' : ' off'}" data-prov="${esc(p.id)}">
      <div class="prov-head"><b>${esc(p.name)}</b><span class="prov-src">${p.source === 'env' ? 'Server key' : p.source === 'account' ? 'Key added here' : 'No key'}</span></div>
      <div class="prov-status">${providerStatusHtml(p, probe)}${hint ? `<br><small>${esc(hint)}</small>` : ''}</div>
      <div class="prov-meta">${p.configured ? (p.models && p.models.length ? `${p.models.length} model${p.models.length === 1 ? '' : 's'} on the account` : 'No model list from this provider') : (p.aggregator ? 'One key reaches many models.' : 'Add a key to use its models.')}${p.keyTail ? ` · Key ends in <span style="white-space:nowrap">…${esc(p.keyTail)}</span>` : ''}${p.custom ? ` · ${esc(p.baseUrl)}` : ''}</div>
      <div class="prov-actions">
        ${p.configured && !p.mcp ? `<button type="button" class="btn sm" data-check title="Send one tiny message and list the models">${icon('refresh', 13)}<span>Check</span></button>` : ''}
        <button type="button" class="btn sm${p.configured ? '' : ' primary'}" data-key>${icon('key', 13)}<span>${p.source === 'account' ? 'Replace key' : 'Add key'}</span></button>
        ${p.source === 'account' ? `<button type="button" class="btn sm ghost" data-forget title="${p.custom ? 'Remove this endpoint' : p.envKeys && p.envKeys.length ? 'Remove the key added here; a server key stays' : 'Remove the key added here'}">${icon('trash', 13)}<span>Remove</span></button>` : ''}
        ${p.docs ? `<a class="btn sm ghost" href="${esc(p.docs)}" target="_blank" rel="noopener">${icon('external', 13)}<span>Get a key</span></a>` : ''}
      </div></div>`;
  }).join('');
  const tierRows = Object.keys(TIER_LABEL).map(t => {
    const info = (r.tiers || {})[t] || {}; const chosen = settings[t] || null;
    const provOpts = `<option value="">Automatic</option>` + configured.map(p => `<option value="${esc(p.id)}"${chosen && chosen.provider === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    return `<div class="tier-row" data-tier="${t}">
      <div class="tier-l"><b>${esc(TIER_LABEL[t])}</b><small>${esc(TIER_NOTE[t])}. Now: ${esc(modelName(info.resolved) || info.resolved || '')}${info.provider ? ` on ${esc(info.provider)}` : ''}${info.resolved && info.configured && info.resolved !== info.configured ? ` <span class="bad">wanted ${esc(modelName(info.configured))}</span>` : ''}</small></div>
      <select data-tier-prov aria-label="Provider for ${esc(TIER_LABEL[t])}">${provOpts}</select>
      <span data-tier-model-wrap></span>
    </div>`;
  }).join('');
  openModal(`<h2>${icon('zap', 20)}Model accounts</h2><p class="sub">Add a provider's API key and every model on that account can be the active model for any part of Ricorsa. Keys are stored sealed in your database; customers never see provider names or errors.</p>
    <div class="prov-grid">${cards}
      <button type="button" class="prov-card add" data-add-custom>${icon('plus', 18)}<b>Custom endpoint</b><span>Any OpenAI-compatible API by base URL: a gateway, a proxy, a model you host yourself.</span></button>
    </div>
    <div class="sec-h" style="margin:18px 0 6px">${icon('settings', 16)}Active models</div>
    <p class="sub">Automatic uses the server's settings and the best model each account can serve. A choice applies as soon as it is saved; if that provider refuses later, the next one that works takes over so answers keep coming.</p>
    <div class="tier-grid">${tierRows}</div>
    <div class="models-check" style="margin-top:14px">
      <div class="row"><b>Browser check</b><span>${r.browserRun ? `<span class="ok">On.</span> Every built app is opened in a real browser.` : `<span class="bad">Off.</span> Built apps get a code review only (no Browser Run binding on this deployment).`}</span></div>
      <div class="row"><b>Web search</b><span>${r.search ? `<span class="ok">On.</span>` : `<span class="bad">Off.</span> No BRAVE_API_KEY.`}</span></div>
    </div>
    <div class="modal-actions"><button type="button" class="btn left" data-check-all>${icon('refresh', 14)}<span>Check every account</span></button><button type="button" class="btn" data-close>Close</button><button type="button" class="btn primary" data-save-tiers>Save choices</button></div>`, {
    wide: true,
    onMount: ov => {
      const byId = Object.fromEntries(providers.map(p => [p.id, p]));
      // A tier's model control follows its provider: a select of the provider's chat models, or a text field when the provider gave no list.
      // It opens on the saved choice; failing that on what the tier runs now, if this provider serves it; failing that on the
      // provider's newest general model, never on whatever sorts first.
      const modelControl = (row, t) => {
        const pid = $('[data-tier-prov]', row).value; const wrap = $('[data-tier-model-wrap]', row); const chosen = settings[t] || null; const info = (r.tiers || {})[t] || {};
        if (!pid) { wrap.innerHTML = `<span class="muted" style="font-size:12.5px">Best available</span>`; return; }
        const p = byId[pid]; const ids = p ? chatModels(p) : []; const rec = p && p.recommended ? p.recommended : '';
        const saved = chosen && chosen.provider === pid ? chosen.model : '';
        const cur = saved || (info.resolved && ids.includes(info.resolved) ? info.resolved : '') || rec || '';
        const label = id => `${esc(modelName(id) === id ? id : `${modelName(id)} (${id})`)}${id === rec ? ' · suggested' : ''}`;
        if (ids.length) wrap.innerHTML = `<select data-tier-model aria-label="Model">${(cur && !ids.includes(cur) ? [cur, ...ids] : ids).map(id => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${label(id)}</option>`).join('')}</select>`;
        else wrap.innerHTML = `<input type="text" data-tier-model value="${esc(cur)}" placeholder="Model id" aria-label="Model id" maxlength="160">`;
      };
      $$('.tier-row', ov).forEach(row => { const t = row.dataset.tier; modelControl(row, t); $('[data-tier-prov]', row).addEventListener('change', () => modelControl(row, t)); });
      $$('.prov-card[data-prov]', ov).forEach(card => {
        const p = byId[card.dataset.prov]; if (!p) return;
        const ck = $('[data-check]', card); if (ck) ck.addEventListener('click', async () => { ck.disabled = true; ck.querySelector('span').textContent = 'Checking'; try { const res = await api('/api/admin/providers', { body: { id: p.id } }); toast(res.probe.ok ? `${p.name}: working, ${res.probe.models} model${res.probe.models === 1 ? '' : 's'}` : `${p.name}: ${res.probe.message}`, res.probe.ok ? 'ok' : 'bad'); } catch (err) { apiToast(err); } modelsModal(); });
        $('[data-key]', card).addEventListener('click', () => providerKeyModal(p));
        const fg = $('[data-forget]', card); if (fg) fg.addEventListener('click', () => openModal(`<h2>Remove ${esc(p.name)}${p.custom ? '' : ' key'}?</h2><p class="sub">${p.custom ? 'The endpoint and its key are removed from your account.' : p.envKeys && p.envKeys.length && p.source === 'account' ? 'The key added here is removed. If the server has one of its own, that one is used again.' : 'The key is removed; tiers set to this provider fall back to the next model that works.'}</p><div class="modal-actions"><button type="button" class="btn" id="pkKeep">Keep</button><button type="button" class="btn danger" id="pkDel">Remove</button></div>`, {
          onMount: () => { $('#pkKeep').addEventListener('click', () => modelsModal()); $('#pkDel').addEventListener('click', async () => { try { await api('/api/admin/providers?id=' + encodeURIComponent(p.id), { method: 'DELETE' }); toast(`${p.name} removed`); modelsModal(); } catch (err) { apiToast(err); } }); }
        }));
      });
      $('[data-add-custom]', ov).addEventListener('click', () => providerKeyModal(null));
      $('[data-check-all]', ov).addEventListener('click', () => modelsModal({ probe: true }));
      $('[data-save-tiers]', ov).addEventListener('click', async () => {
        const tiers = {};
        for (const row of $$('.tier-row', ov)) {
          const pid = $('[data-tier-prov]', row).value; const m = $('[data-tier-model]', row);
          if (!pid) { tiers[row.dataset.tier] = null; continue; }
          const model = m ? m.value.trim() : ''; if (!model) { toast(`Choose a model for ${TIER_LABEL[row.dataset.tier]}`, 'bad'); if (m) m.focus(); return; }
          tiers[row.dataset.tier] = { provider: pid, model };
        }
        const b = $('[data-save-tiers]', ov); b.disabled = true; b.textContent = 'Saving';
        try { await api('/api/admin/models', { method: 'PUT', body: { tiers } }); toast('Model choices saved'); modelsModal(); } catch (err) { b.disabled = false; b.textContent = 'Save choices'; apiToast(err, 'Could not save the choices'); }
      });
    }
  });
}
/** A key pasted into the wrong provider's card is the commonest slip: the prefixes give most of them away. */
function keyLooksWrong(id, key) {
  const owner = key.startsWith('sk-ant-') ? 'anthropic' : key.startsWith('sk-or-') ? 'openrouter' : key.startsWith('gsk_') ? 'groq' : key.startsWith('xai-') ? 'xai' : key.startsWith('AIza') ? 'google' : null;
  const NAMES = { anthropic: 'Anthropic', openrouter: 'OpenRouter', groq: 'Groq', xai: 'xAI', google: 'Google' };
  if (owner && owner !== id) return `This looks like ${owner === 'anthropic' ? 'an' : 'a'} ${NAMES[owner]} key. Each provider needs its own key from its own console.`;
  if (id === 'anthropic' && !key.startsWith('sk-ant-')) return 'Anthropic keys start with sk-ant-. Check that this key came from console.anthropic.com.';
  return '';
}
/** Paste a provider's API key (or add a custom endpoint). The key is sent once, sealed on the server and checked right away. */
function providerKeyModal(p) {
  const custom = !p || p.custom;
  openModal(`<h2>${icon('key', 20)}${p ? `${p.source === 'account' ? 'Replace the key for' : 'Add a key for'} ${esc(p.name)}` : 'Add a custom endpoint'}</h2>
    <p class="sub">${p && p.keyHint ? esc(p.keyHint) + ' ' : ''}Paste the key below. It is stored sealed in Ricorsa's database, never shown again, and Ricorsa sends one tiny message right away to confirm it works and to list the models on the account.</p>
    ${!p ? `<div class="field"><label for="pkName">Name</label><input type="text" id="pkName" maxlength="60" placeholder="e.g. Company gateway"></div>
    <div class="field"><label for="pkBase">Base URL</label><input type="url" id="pkBase" maxlength="500" placeholder="https://api.example.com/v1"><span class="hint">The address the OpenAI-compatible endpoints hang off: chat/completions and models are added to it.</span></div>
    <div class="field"><label for="pkKind">API style</label><select id="pkKind"><option value="openai">OpenAI-compatible (chat completions)</option><option value="anthropic">Anthropic Messages API</option></select></div>` : p.custom ? `<div class="field"><label for="pkBase">Base URL</label><input type="url" id="pkBase" maxlength="500" value="${esc(p.baseUrl)}"></div>` : ''}
    <div class="field"><label for="pkKey">API key</label><input type="password" id="pkKey" maxlength="4000" autocomplete="off" spellcheck="false" placeholder="Paste the key"></div>
    ${custom ? `<div class="field"><label for="pkModel">Model id to test with (optional)</label><input type="text" id="pkModel" maxlength="160" value="${esc(p && p.probeModel ? p.probeModel : '')}" placeholder="e.g. the id the gateway documents"><span class="hint">Used for the one-message check when the endpoint does not list its models.</span></div>` : ''}
    <div class="modal-actions"><button type="button" class="btn" id="pkBack">Back</button><button type="button" class="btn primary" id="pkOk">Save and check</button></div>`, {
    onMount: ov => {
      $('#pkBack', ov).addEventListener('click', () => modelsModal());
      let warned = '';
      $('#pkOk', ov).addEventListener('click', async () => {
        const key = $('#pkKey', ov).value.trim(); if (!key) { $('#pkKey', ov).focus(); return; }
        const wrong = p && !custom ? keyLooksWrong(p.id, key) : '';
        if (wrong && warned !== key) { warned = key; toast(wrong, 'bad'); $('#pkOk', ov).textContent = 'Save anyway'; return; }
        const body = { id: p ? p.id : '', apiKey: key };
        if (!p) {
          const name = $('#pkName', ov).value.trim(), base = $('#pkBase', ov).value.trim();
          if (!name) { $('#pkName', ov).focus(); return; } if (!base) { $('#pkBase', ov).focus(); return; }
          if (/\/(mcp|sse)\/?$/i.test(base)) { toast('That address is an MCP server. Add it under Connectors as a custom MCP server; this screen takes model APIs.', 'bad'); $('#pkBase', ov).focus(); return; }
          body.id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'custom_' + Date.now().toString(36);
          body.name = name; body.baseUrl = base; body.kind = $('#pkKind', ov).value;
        } else if (custom) { const base = $('#pkBase', ov).value.trim(); if (base) body.baseUrl = base; }
        if (custom) { const pm = $('#pkModel', ov); if (pm && pm.value.trim()) body.probeModel = pm.value.trim(); }
        const b = $('#pkOk', ov); b.disabled = true; b.textContent = 'Checking';
        try {
          const res = await api('/api/admin/providers', { method: 'PUT', body });
          toast(res.probe.ok ? `${res.provider.name}: working, ${res.probe.models} model${res.probe.models === 1 ? '' : 's'} available` : `${res.provider.name} saved, but it answered: ${res.probe.message}`, res.probe.ok ? 'ok' : 'bad');
          modelsModal();
        } catch (err) { b.disabled = false; b.textContent = 'Save and check'; apiToast(err, 'Could not save the key'); }
      });
      const first = $('#pkName', ov) || $('#pkKey', ov); if (first) first.focus();
    }
  });
}
/**
 * Admins: who has signed up and what they are doing. Totals, sign-ups per day, the plan mix, and every account
 * with its plan, usage this month and last visit; searchable, exportable as CSV. The staff console at
 * manage.ricorsa.com has the full grid with customers, licenses and invoices.
 */
async function accountsModal() {
  openModal(`<h2>${icon('users', 20)}Sign-ups and activity</h2><p class="sub">Loading the accounts.</p><div class="skel"><i></i><i></i><i></i></div>`, { wide: true });
  let r;
  try { r = await api('/api/admin/accounts'); } catch (e) { apiToast(e, 'Could not load the accounts'); return; }
  const t = r.totals || {}; const accounts = r.accounts || [];
  const day = v => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const n = v => Number(v || 0).toLocaleString('en-US');
  const tile = (label, value, small) => `<div class="stat"><small>${esc(label)}</small><b>${esc(String(value))}</b>${small ? `<span>${esc(small)}</span>` : ''}</div>`;
  const days = Object.entries(r.signupsByDay || {}); const peak = Math.max(1, ...days.map(([, v]) => v));
  const spark = days.map(([d, v]) => `<i style="height:${Math.max(2, Math.round(v / peak * 100))}%" title="${esc(day(d + 'T12:00:00Z'))}: ${v} sign-up${v === 1 ? '' : 's'}"></i>`).join('');
  const planChips = Object.entries(r.plans || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(planLabel(k))} <b>${n(v)}</b></span>`).join('');
  const status = a => a.admin ? 'staff' : a.subscriptionStatus ? a.subscriptionStatus.toLowerCase().replace(/_/g, ' ') : a.plan === 'free' ? '' : 'granted';
  const row = a => `<tr><td><div class="who"><b>${esc(a.email || a.name || a.id)}</b>${a.name && a.email ? `<small>${esc(a.name)}</small>` : ''}</div></td><td>${esc(a.planName || planLabel(a.plan))}${status(a) ? ` <small class="muted">${esc(status(a))}</small>` : ''}</td><td>${esc(day(a.createdAt))}</td><td>${a.lastSeenAt ? esc(relTime(a.lastSeenAt)) : '<span class="muted">never</span>'}</td><td class="num">${n(a.questionsThisMonth)}${a.researchThisMonth ? ` <small class="muted">+${n(a.researchThisMonth)} reports</small>` : ''}</td><td class="num">${n(a.threads)}</td><td class="num">${n(a.builds)}</td></tr>`;
  openModal(`<h2>${icon('users', 20)}Sign-ups and activity</h2><p class="sub">Everyone with a Ricorsa account, newest first. Usage is this calendar month. The full picture, with customers, licenses and invoices, is the staff console at <a href="https://manage.ricorsa.com" target="_blank" rel="noopener">manage.ricorsa.com</a>.</p>
    <div class="stat-grid">
      ${tile('Accounts', n(t.accounts), t.staff ? `${n(t.staff)} staff` : '')}
      ${tile('New, 24 hours', n(t.new1), `${n(t.new7)} in 7 days, ${n(t.new30)} in 30`)}
      ${tile('Active, 7 days', n(t.active7), `${n(t.active30)} in 30 days`)}
      ${tile('Questions', n(t.questionsThisMonth), `this month${t.researchThisMonth ? `, ${n(t.researchThisMonth)} reports` : ''}`)}
      ${tile('Threads', n(t.threads))}
      ${tile('Apps built', n(t.builds))}
    </div>
    <div class="spark-row"><div class="spark" aria-label="Sign-ups per day, last 30 days">${spark}</div><small class="muted">Sign-ups per day, last 30 days</small></div>
    <div class="chips" style="margin:10px 0 14px">${planChips || '<span class="muted">No accounts yet.</span>'}</div>
    <div class="sec-h"><span>${accounts.length} account${accounts.length === 1 ? '' : 's'}</span><span class="spacer"></span><input type="search" id="acFind" placeholder="Find by email or name" aria-label="Find an account" style="max-width:240px"><button type="button" class="btn sm" id="acCsv">${icon('download', 13)}CSV</button></div>
    <div class="grant-list tall"><table class="grants accounts"><thead><tr><th>Account</th><th>Plan</th><th>Signed up</th><th>Last seen</th><th class="num">Questions</th><th class="num">Threads</th><th class="num">Apps</th></tr></thead><tbody id="acRows">${accounts.length ? accounts.map(row).join('') : '<tr><td colspan="7" class="muted">Nobody has signed up yet.</td></tr>'}</tbody></table></div>
    <div class="modal-actions"><span class="muted" style="margin-right:auto;font-size:12px">As of ${esc(new Date(r.at || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</span><button type="button" class="btn" id="acAgain">${icon('refresh', 14)}Refresh</button><button type="button" class="btn primary" data-close>Done</button></div>`, {
    wide: true,
    onMount: ov => {
      $('#acFind', ov).addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        const list = q ? accounts.filter(a => (a.email || '').toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q)) : accounts;
        $('#acRows', ov).innerHTML = list.length ? list.map(row).join('') : '<tr><td colspan="7" class="muted">No account matches.</td></tr>';
      });
      $('#acCsv', ov).addEventListener('click', () => {
        const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const lines = [['email', 'name', 'plan', 'status', 'signed_up', 'last_seen', 'questions_this_month', 'reports_this_month', 'threads', 'apps'].join(',')]
          .concat(accounts.map(a => [a.email, a.name, a.plan, status(a), a.createdAt ? new Date(a.createdAt).toISOString() : '', a.lastSeenAt ? new Date(a.lastSeenAt).toISOString() : '', a.questionsThisMonth, a.researchThisMonth, a.threads, a.builds].map(cell).join(',')));
        downloadFile(`ricorsa-accounts-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'), 'text/csv');
        toast('Saved the account list');
      });
      $('#acAgain', ov).addEventListener('click', () => accountsModal());
    }
  });
}
/** Admins: plans granted by email, and a form to add one. */
async function grantsModal() {
  let grants = [];
  try { const r = await api('/api/admin/grants'); grants = r.grants || []; } catch (e) { apiToast(e, 'Could not load the grants'); return; }
  const when = (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const rows = grants.length ? grants.map(g => `<tr><td>${esc(g.email)}</td><td>${esc(planLabel(g.plan))}${g.status === 'TRIAL' ? ' trial' : ''}</td><td>${g.endsAt ? 'until ' + esc(when(g.endsAt)) : 'open-ended'}</td><td>${g.appliedTo ? `<span class="ok">Applied ${esc(when(g.appliedAt))}</span>` : '<span class="muted">Waiting for first sign-in</span>'}</td><td><button type="button" class="btn sm ghost" data-del-grant="${esc(g.email)}" title="Remove this grant">${icon('trash', 13)}</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No grants yet.</td></tr>';
  openModal(`<h2>${icon('key', 20)}Plans granted by email</h2><p class="sub">The plan lands on the account the first time the person signs in with that address, or right away if they already have one. Ends on the date you set, or never.</p>
    <form id="grantForm" class="grant-form"><div class="field"><label for="grEmail">Email</label><input type="email" id="grEmail" required placeholder="name@company.com"></div><div class="field"><label for="grPlan">Plan</label><select id="grPlan"><option value="professional">Professional</option><option value="essentials">Essentials</option><option value="enterprise">Enterprise</option></select></div><div class="field"><label for="grKind">Kind</label><select id="grKind"><option value="LICENSED">License</option><option value="TRIAL">Trial</option></select></div><div class="field"><label for="grEnds">Ends (optional)</label><input type="date" id="grEnds"></div><div class="field wide"><label for="grNote">Note (optional)</label><input type="text" id="grNote" maxlength="200" placeholder="e.g. Marketing consultant"></div><button type="submit" class="btn primary sm">${icon('plus', 14)}Grant</button></form>
    <div class="grant-list"><table class="grants"><thead><tr><th>Email</th><th>Plan</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Done</button></div>`, {
    onMount: ov => {
      $('#grantForm', ov).addEventListener('submit', async e => {
        e.preventDefault();
        const body = { email: $('#grEmail', ov).value.trim(), plan: $('#grPlan', ov).value, status: $('#grKind', ov).value, endsAt: $('#grEnds', ov).value || null, note: $('#grNote', ov).value.trim() };
        try { const r = await api('/api/admin/grants', { body }); toast(r.applied ? `${body.email} now has ${r.planName || planLabel(body.plan)}` : `${body.email} gets ${r.planName || planLabel(body.plan)} at first sign-in`); grantsModal(); } catch (err) { apiToast(err, 'Could not save the grant'); }
      });
      $$('[data-del-grant]', ov).forEach(b => b.addEventListener('click', async () => { try { await api('/api/admin/grants?email=' + encodeURIComponent(b.dataset.delGrant), { method: 'DELETE' }); toast('Grant removed'); grantsModal(); } catch (err) { apiToast(err); } }));
    }
  });
}

// ---------- Render / init ----------
// ---------- Connectors ----------
// Outside applications and MCP servers the person has linked. Enabled connectors become tools the model
// can call while it answers, so a question about their own issues, pages, deals or data is answered from the source.
const AUTH_LABEL = { none: 'No sign-in', bearer: 'Token', oauth: 'Sign in with the app' };
function connStatus(c) {
  if (c.status === 'ok') return { cls: 'ok', text: `${c.tools.length} tool${c.tools.length === 1 ? '' : 's'}${c.allowedTools ? ` · ${c.allowedTools.length} allowed` : ''}` };
  if (c.status === 'needs_auth') return { cls: 'warn', text: c.authType === 'oauth' ? 'Needs sign-in' : c.authType === 'bearer' ? 'Token rejected' : 'Needs a sign-in' };
  if (c.status === 'error') return { cls: 'bad', text: 'Not reachable' };
  return { cls: '', text: 'Not checked yet' };
}
async function loadConnectors() {
  const r = await api('/api/connectors');
  state.connectors = r.items || []; state.catalog = r.catalog || []; state.connLimit = r.limit || 0; state.connCallback = r.callback || '';
  return r;
}
function renderConnectors() {
  const main = $('#main');
  main.innerHTML = `<div class="view">${topbarHtml('Connectors')}<div class="scroll"><div class="col wide">
    <div class="page-h"><h1>${icon('plug', 26)}Connectors</h1><button type="button" class="btn primary sm" data-add-conn>${icon('plus', 15)}<span>Add connector</span></button></div>
    <p class="page-sub">Connect Ricorsa to the apps and MCP servers you use. When a connector is on, its tools are available to every answer, or only inside the Spaces you choose: ask about your own issues, pages, deals, customers or code and Ricorsa reads the live source instead of guessing. Credentials are stored encrypted and never leave your account.</p>
    <div data-conn-list><div class="skel"><i></i><i></i></div></div>
  </div></div></div>`;
  wireTopbar(main);
  $('[data-add-conn]', main).addEventListener('click', () => { if (state.connLimit <= 0 && !(state.user && state.user.admin)) { toast('Connectors are part of the Essentials, Professional and Enterprise plans', 'bad'); return; } addConnectorModal(); });
  loadConnectors().then(() => { paintConnectors(); afterOauthReturn(); }).catch(e => { const box = $('[data-conn-list]', main); if (box) box.innerHTML = `<div class="empty">${icon('alert', 26)}<div>${esc((e && e.message) || 'Could not load your connectors')}</div></div>`; });
}
function afterOauthReturn() {
  const q = state.route.query || {}; if (!q.oauth) return;
  if (q.oauth === 'ok') toast('Connected. Its tools are ready to use.'); else toast(q.reason ? `Sign-in did not finish: ${q.reason}` : 'Sign-in did not finish', 'bad');
  history.replaceState(null, '', '#/connectors'); state.route = parseRoute();
}
function paintConnectors() {
  const box = $('[data-conn-list]'); if (!box) return;
  const list = state.connectors || []; const limit = state.connLimit; const admin = state.user && state.user.admin;
  let html = '';
  if (limit <= 0 && !admin) html += upgradeCard('Connectors are part of the paid plans', 'Essentials links up to 3 outside apps, MCP servers, websites or document vaults to your answers; Professional links 25 and Enterprise 100.', 'Essentials');
  else if (list.length >= limit && !admin) html += `<p class="page-sub">You are using all ${limit} connectors on the ${esc(state.plan ? state.plan.name : '')} plan. <a href="/pricing">See plans</a> for more.</p>`;
  if (!list.length) {
    const picks = (state.catalog || []).filter(p => p.key !== 'custom').slice(0, 6);
    html += `<div class="conn-empty"><div class="empty">${icon('plug', 28)}<div>No connectors yet.</div><p>Start with one of these, or add any MCP server by URL.</p></div>
      <div class="conn-cat">${picks.map(p => `<button type="button" class="conn-pick" data-pick="${esc(p.key)}" ${limit <= 0 && !admin ? 'disabled' : ''}><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span><em>${p.flow === 'vault' ? 'One-time code by email' : p.flow === 'site' ? 'Reads the site for you' : esc(AUTH_LABEL[p.auth])}</em></button>`).join('')}</div></div>`;
  } else {
    html += `<div class="conn-list">${list.map(c => {
      const st = connStatus(c); const dom = c.preset === 'vdrpros' ? 'VDRPros Vault' : c.preset === 'website' && c.site ? (domainOf(c.site.rootUrl) || c.site.rootUrl) : (domainOf(c.url) || c.url);
      return `<div class="conn-card${c.enabled ? '' : ' off'}" data-conn="${esc(c.id)}">
        <div class="conn-main">
          <span class="conn-logo" style="background:${c.preset === 'vdrpros' ? '#0B6E63' : colorFor(c.name)}">${c.preset === 'vdrpros' ? 'V' : c.preset === 'website' ? 'W' : esc(c.name[0] || '?').toUpperCase()}</span>
          <div class="conn-txt"><b>${esc(c.name)}</b><span class="conn-url" title="${esc(c.preset === 'website' && c.site ? c.site.rootUrl : c.url)}">${esc(dom)} · ${c.preset === 'vdrpros' ? 'Connected with a one-time code' : c.preset === 'website' ? (c.site ? `${c.site.pages} page${c.site.pages === 1 ? '' : 's'} read${c.site.rendered ? ` (${c.site.rendered} in a browser)` : ''}${c.site.crawledAt ? ` · ${new Date(c.site.crawledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}` : 'Website') : esc(AUTH_LABEL[c.authType] || c.authType)}</span>
            <span class="conn-status ${st.cls}">${esc(st.text)}${c.lastError && c.status !== 'ok' ? `: ${esc(truncate(c.lastError, 120))}` : ''}</span>
            <span class="conn-scope">${scopeText(c)}</span></div>
          <label class="switch${c.enabled ? ' on' : ''}" title="${c.enabled ? 'On: its tools are available to answers' : 'Off: kept, but not used'}" data-toggle><i></i><span>${c.enabled ? 'On' : 'Off'}</span></label>
        </div>
        <div class="conn-actions">
          ${c.authType === 'oauth' ? `<a class="btn sm${c.status === 'needs_auth' ? ' primary' : ''}" href="/api/connectors/${encodeURIComponent(c.id)}/oauth/start" title="Sign in to the app and approve access">${icon('key', 14)}<span>${c.status === 'needs_auth' ? 'Sign in' : 'Sign in again'}</span></a>` : ''}
          <button type="button" class="btn sm" data-test title="Reach the server and refresh its tool list">${icon('refresh', 14)}<span>Test</span></button>
          <button type="button" class="btn sm" data-tools title="Choose which of its tools Ricorsa may use" ${c.tools.length ? '' : 'disabled'}>${icon('check', 14)}<span>Tools</span></button>
          <button type="button" class="btn sm" data-scope title="Use it everywhere, or only in chosen Spaces">${icon('layers', 14)}<span>Where</span></button>
          ${c.preset === 'website' ? `<button type="button" class="btn sm" data-reread title="Read the site again and replace its pages">${icon('loop', 14)}<span>Read again</span></button>` : ''}
          ${c.preset === 'vdrpros' ? `<button type="button" class="btn sm${c.status === 'needs_auth' ? ' primary' : ''}" data-reconnect title="Connect the Vault again with a new code">${icon('key', 14)}<span>Reconnect</span></button>` : c.preset === 'website' ? '' : `<button type="button" class="btn sm" data-edit title="Rename, change the URL or the token">${icon('edit', 14)}<span>Edit</span></button>`}
          <button type="button" class="btn sm danger" data-remove title="Remove this connector and its credentials">${icon('trash', 14)}<span>Remove</span></button>
        </div>
      </div>`; }).join('')}</div>`;
    html += `<p class="page-sub" style="margin-top:14px">Answers that used a connector say so under the answer. Ricorsa asks a connector only when the question is about your own data in that app.</p>`;
  }
  box.innerHTML = html;
  $$('[data-pick]', box).forEach(b => b.addEventListener('click', () => addConnectorModal(b.dataset.pick)));
  $$('.conn-card', box).forEach(card => {
    const c = (state.connectors || []).find(x => x.id === card.dataset.conn); if (!c) return;
    $('[data-toggle]', card).addEventListener('click', async e => { e.preventDefault(); try { const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body: { enabled: !c.enabled } }); Object.assign(c, r.connector); paintConnectors(); } catch (err) { apiToast(err); } });
    $('[data-test]', card).addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; b.querySelector('span').textContent = 'Testing'; try { const r = await api('/api/connectors/' + encodeURIComponent(c.id) + '/test', { method: 'POST' }); Object.assign(c, r.connector); toast(c.status === 'ok' ? `${c.name}: ${c.tools.length} tool${c.tools.length === 1 ? '' : 's'} available` : `${c.name}: ${c.lastError || 'not reachable'}`, c.status === 'ok' ? 'ok' : 'bad'); } catch (err) { apiToast(err); } paintConnectors(); });
    const tb = $('[data-tools]', card); if (tb) tb.addEventListener('click', () => toolsModal(c));
    const sc = $('[data-scope]', card); if (sc) sc.addEventListener('click', () => connectorScopeModal(c));
    const eb = $('[data-edit]', card); if (eb) eb.addEventListener('click', () => editConnectorModal(c));
    const rb = $('[data-reconnect]', card); if (rb) rb.addEventListener('click', () => vaultConnectModal((state.catalog || []).find(p => p.key === 'vdrpros'), c));
    const rr = $('[data-reread]', card); if (rr) rr.addEventListener('click', () => siteReadModal(c));
    $('[data-remove]', card).addEventListener('click', () => openModal(`<h2>Remove ${esc(c.name)}?</h2><p class="sub">Its credentials are deleted from your account. Past answers keep their notes.</p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn danger" id="cDel">Remove</button></div>`, {
      onMount: () => $('#cDel').addEventListener('click', async () => { try { await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'DELETE' }); state.connectors = state.connectors.filter(x => x.id !== c.id); closeModal(); paintConnectors(); toast('Connector removed'); } catch (err) { apiToast(err); } })
    }));
  });
}
/** Where a connector applies: everywhere, or only in the Spaces it is limited to. */
function scopeText(c) {
  const ids = c.spaceIds || [];
  if (!ids.length) return 'Available everywhere';
  const names = ids.map(id => getSpace(id)).filter(Boolean).map(sp => `${esc(sp.emoji)} ${esc(sp.name)}`);
  return `Only in ${names.length ? names.join(', ') : `${ids.length} Space${ids.length === 1 ? '' : 's'}`}`;
}
/** A connector sourced for a Space stays unique to it: tick the Spaces it may be used in, or none for everywhere. */
function connectorScopeModal(c, after) {
  const spaces = state.spaces || []; const ids = c.spaceIds || [];
  openModal(`<h2>${icon('layers', 20)}Where ${esc(c.name)} is used</h2><p class="sub">Tick the Spaces this connector belongs to; threads in those Spaces can use it and no others can. Leave every box clear to make it available everywhere.</p>
    ${spaces.length ? `<div class="tool-list">${spaces.map(sp => `<label class="tool-row"><input type="checkbox" data-sp="${esc(sp.id)}"${ids.includes(sp.id) ? ' checked' : ''}><span><b>${esc(sp.emoji)} ${esc(sp.name)}</b>${sp.description ? `<small>${esc(truncate(sp.description, 90))}</small>` : ''}</span></label>`).join('')}</div>` : `<div class="empty" style="padding:18px 0">${icon('layers', 24)}<div>No Spaces yet.</div><p>Create one under <a href="#/spaces" data-close>Spaces</a>, then limit connectors to it here.</p></div>`}
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button>${spaces.length ? `<button type="button" class="btn primary" id="scOk">Save</button>` : ''}</div>`, {
    onMount: ov => { const ok = $('#scOk', ov); if (!ok) return; ok.addEventListener('click', async () => {
      const picked = $$('[data-sp]', ov).filter(x => x.checked).map(x => x.dataset.sp);
      ok.disabled = true; ok.textContent = 'Saving';
      try { const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body: { spaceIds: picked } }); Object.assign(c, r.connector); closeModal(); paintConnectors(); if (after) after(); toast(picked.length ? `${c.name}: only in ${picked.length} Space${picked.length === 1 ? '' : 's'}` : `${c.name}: available everywhere`); }
      catch (err) { ok.disabled = false; ok.textContent = 'Save'; apiToast(err); }
    }); }
  });
}
/**
 * Add a connector. With `scope` ({ spaceId, spaceName, onAdded }) the connector is sourced for that Space alone:
 * it is created limited to the Space, and the Space page repaints when it lands.
 */
function addConnectorModal(presetKey, scope) {
  const cat = state.catalog || [];
  const preset = presetKey ? cat.find(p => p.key === presetKey) : null;
  if (!preset) {
    openModal(`<h2>Add a connector${scope ? ` to ${esc(scope.spaceName)}` : ''}</h2><p class="sub">${scope ? 'Only threads in this Space will be able to use it. ' : ''}Pick an app, or connect any MCP server by URL.</p>
      <div class="conn-cat modal-cat">${cat.map(p => `<button type="button" class="conn-pick" data-pick="${esc(p.key)}"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span><em>${p.flow === 'vault' ? 'One-time code by email' : p.flow === 'site' ? 'Reads the site for you' : esc(AUTH_LABEL[p.auth])}</em></button>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button></div>`, {
      onMount: ov => $$('[data-pick]', ov).forEach(b => b.addEventListener('click', () => addConnectorModal(b.dataset.pick, scope)))
    });
    return;
  }
  if (preset.flow === 'vault') { vaultConnectModal(preset, null, scope); return; }
  if (preset.flow === 'site') { siteConnectModal(preset, scope); return; }
  const custom = preset.key === 'custom';
  const authOpts = ['none', 'bearer', 'oauth'].map(a => `<option value="${a}"${a === preset.auth ? ' selected' : ''}>${AUTH_LABEL[a]}</option>`).join('');
  openModal(`<h2>${custom ? 'Custom MCP server' : 'Connect ' + esc(preset.name)}</h2><p class="sub">${scope ? `For the ${esc(scope.spaceName)} Space only. ` : ''}${esc(preset.blurb)}${preset.docs ? ` <a href="${esc(preset.docs)}" target="_blank" rel="noopener">Vendor docs</a>` : ''}</p>
    <div class="field"><label for="cName">Name</label><input type="text" id="cName" maxlength="60" value="${esc(custom ? '' : preset.name)}" placeholder="e.g. Company Jira"></div>
    <div class="field"><label for="cUrl">Server URL</label><input type="url" id="cUrl" maxlength="500" value="${esc(preset.url)}" placeholder="https://mcp.example.com/mcp"><span class="hint">${custom ? 'The remote MCP endpoint, over HTTPS.' : 'The vendor’s published endpoint. Edit it if their docs show a different one.'}</span></div>
    <div class="field"><label for="cAuth">Sign-in</label><select id="cAuth">${authOpts}</select><span class="hint" data-auth-hint></span></div>
    <div class="field" data-token-field hidden><label for="cToken">Token</label><input type="password" id="cToken" maxlength="4000" autocomplete="off" placeholder="Paste the token"><span class="hint">${esc(preset.tokenHint || 'A personal access token or API key from the app’s settings. Stored encrypted.')}</span></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="cOk">Connect</button></div>`, {
    onMount: ov => {
      const auth = $('#cAuth'), tok = $('[data-token-field]', ov), hint = $('[data-auth-hint]', ov);
      const sync = () => { tok.hidden = auth.value !== 'bearer'; hint.textContent = auth.value === 'oauth' ? 'You will be sent to the app to approve access, then brought back here.' : auth.value === 'bearer' ? 'Ricorsa sends this token with every request to the server.' : 'The server is open, or the URL itself carries the key.'; };
      auth.addEventListener('change', sync); sync();
      $('#cOk').addEventListener('click', async () => {
        const name = $('#cName').value.trim(), url = $('#cUrl').value.trim(), authType = auth.value, token = $('#cToken').value;
        if (!name) { $('#cName').focus(); return; } if (!url) { $('#cUrl').focus(); return; }
        if (authType === 'bearer' && !token.trim()) { $('#cToken').focus(); return; }
        const btn = $('#cOk'); btn.disabled = true; btn.textContent = authType === 'oauth' ? 'Starting sign-in' : 'Checking the server';
        try {
          const r = await api('/api/connectors', { body: { name, url, authType, token: authType === 'bearer' ? token : null, preset: custom ? null : preset.key, spaceIds: scope ? [scope.spaceId] : undefined } });
          state.connectors = [...(state.connectors || []), r.connector];
          closeModal();
          if (authType === 'oauth') { location.href = '/api/connectors/' + encodeURIComponent(r.connector.id) + '/oauth/start'; return; }
          paintConnectors(); if (scope && scope.onAdded) scope.onAdded();
          const c = r.connector; toast(c.status === 'ok' ? `${c.name} connected: ${c.tools.length} tool${c.tools.length === 1 ? '' : 's'} available` : `${c.name} saved, but ${c.lastError || 'it could not be reached'}`, c.status === 'ok' ? 'ok' : 'bad');
        } catch (err) { btn.disabled = false; btn.textContent = 'Connect'; apiToast(err, 'Could not add the connector'); }
      });
      $('#cName').focus();
    }
  });
}
/**
 * Connecting a website: the address and how many pages to read; Ricorsa reads the site (rendering pages that are
 * applications) with progress shown as it goes, and the connector appears with its pages counted.
 */
function siteConnectModal(preset, scope) {
  openModal(`<h2>${icon('globe', 20)}Connect a website${scope ? ` to ${esc(scope.spaceName)}` : ''}</h2><p class="sub">${scope ? 'Only threads in this Space will search it. ' : ''}Ricorsa reads the site's pages, keeps their text in your account, and searches them when you ask; answers cite the pages. Pages that only show their content in a browser are opened in one.</p>
    <div class="field"><label for="sUrl">Website address</label><input type="url" id="sUrl" maxlength="500" placeholder="https://example.com" autocomplete="off"></div>
    <div class="field"><label for="sPages">Pages to read</label><select id="sPages"><option value="10">Up to 10</option><option value="25">Up to 25</option><option value="40" selected>Up to 40</option><option value="60">Up to 60</option></select></div>
    <div class="site-progress" id="sProg" hidden><span class="spinner tiny"></span><span id="sProgText">Opening the site</span></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="sGo">Read the site</button></div>`, {
    onMount: ov => {
      const go = async () => {
        const url = $('#sUrl', ov).value.trim(); if (!url) { $('#sUrl', ov).focus(); return; }
        const b = $('#sGo', ov); b.disabled = true; $('#sProg', ov).hidden = false;
        try {
          const res = await fetch('/api/connectors/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ url, maxPages: +$('#sPages', ov).value, spaceIds: scope ? [scope.spaceId] : undefined }) });
          if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'The site could not be read'); }
          let done = null, failed = null;
          await readSse(res, (ev, data) => { if (ev === 'status') { const t = $('#sProgText', ov); if (t) t.textContent = data.text || 'Reading'; } else if (ev === 'done') done = data; else if (ev === 'error') failed = data; });
          if (failed) throw new Error(failed.message || 'The site could not be read');
          if (!done) throw new Error('The read was cut off');
          state.connectors = [...(state.connectors || []), done.connector]; closeModal(); paintConnectors(); if (scope && scope.onAdded) scope.onAdded();
          toast(`${done.connector.name}: ${done.pages} page${done.pages === 1 ? '' : 's'} read${done.rendered ? `, ${done.rendered} in a browser` : ''}`);
        } catch (err) { $('#sProg', ov).hidden = true; b.disabled = false; toast(err.message || 'The site could not be read', 'bad'); }
      };
      $('#sGo', ov).addEventListener('click', go); $('#sUrl', ov).addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); $('#sUrl', ov).focus();
    }
  });
}
/** Read a connected site again, with progress, replacing its pages. */
function siteReadModal(c) {
  openModal(`<h2>${icon('globe', 20)}Read ${esc(c.name)} again</h2><p class="sub">${esc(c.site ? c.site.rootUrl : '')}<br>The pages on file are replaced by what the site says now.</p>
    <div class="site-progress" id="sProg" hidden><span class="spinner tiny"></span><span id="sProgText">Opening the site</span></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="sGo">Read again</button></div>`, {
    onMount: ov => $('#sGo', ov).addEventListener('click', async () => {
      const b = $('#sGo', ov); b.disabled = true; $('#sProg', ov).hidden = false;
      try {
        const res = await fetch('/api/connectors/' + encodeURIComponent(c.id) + '/site', { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'The site could not be read'); }
        let done = null, failed = null;
        await readSse(res, (ev, data) => { if (ev === 'status') { const t = $('#sProgText', ov); if (t) t.textContent = data.text || 'Reading'; } else if (ev === 'done') done = data; else if (ev === 'error') failed = data; });
        if (failed) throw new Error(failed.message || 'The site could not be read');
        if (done) { Object.assign(c, done.connector); closeModal(); paintConnectors(); toast(`${c.name}: ${done.pages} page${done.pages === 1 ? '' : 's'} read`); }
      } catch (err) { $('#sProg', ov).hidden = true; b.disabled = false; toast(err.message || 'The site could not be read', 'bad'); }
    })
  });
}
/**
 * Connecting a VDRPros Vault: the person's Vault email, the one-time code it receives, then the workspaces to share.
 * Nothing about the Vault's own sign-in is involved; the Vault issues Ricorsa a token limited to those workspaces.
 */
function vaultConnectModal(preset, existing, scope) {
  if (!preset) { toast('The Vault connector is not available', 'bad'); return; }
  if (preset.available === false) { openModal(`<h2>VDRPros Vault</h2><p class="sub">This Ricorsa server is not linked to the Vault yet. Ask your administrator to finish the setup.</p><div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>`); return; }
  const stepEmail = () => openModal(`<h2>${existing ? 'Reconnect' : 'Connect'} VDRPros Vault</h2><p class="sub">Enter the email address your Vault administrator set up for you (not a Vault or Ricorsa address). A one-time code is issued for it; nothing is shared until you approve.</p>
    <div class="field"><label for="vEmail">Vault email</label><input type="email" id="vEmail" maxlength="200" autocomplete="email" placeholder="you@firm.com"></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="vNext">Send code</button></div>`, {
    onMount: () => {
      const go = async () => { const email = $('#vEmail').value.trim(); if (!email) { $('#vEmail').focus(); return; } const b = $('#vNext'); b.disabled = true; b.textContent = 'Sending';
        try { const r = await api('/api/connectors/vault/start', { body: { email } }); stepCode(r.challengeId, email, r.delivery); } catch (err) { b.disabled = false; b.textContent = 'Send code'; apiToast(err, 'Could not start'); } };
      $('#vNext').addEventListener('click', go); $('#vEmail').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); $('#vEmail').focus();
    }
  });
  // How the code reaches the person comes from the Vault: by email, or read out by a Vault administrator from the
  // staff console while the Vault has no mail provider. The wording must not suggest an email that will never come.
  const stepCode = (challengeId, email, delivery) => openModal(`<h2>Enter the code</h2><p class="sub">${delivery === 'staff'
      ? `This Vault does not send email yet. Your Vault administrator can read you the six-digit code for <b>${esc(email)}</b> from the staff console (Tenants and people, "Sign-in codes waiting"). It works for ten minutes.`
      : `If <b>${esc(email)}</b> has a Vault account, a six-digit code is on its way to that inbox. It works for ten minutes.`}</p>
    <div class="field"><label for="vCode">Code</label><input type="text" id="vCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="letter-spacing:.2em;font-size:20px"></div>
    <div class="modal-actions"><button type="button" class="btn" id="vBack">Back</button><button type="button" class="btn primary" id="vVerify">Continue</button></div>`, {
    onMount: () => {
      $('#vBack').addEventListener('click', stepEmail);
      const go = async () => { const code = $('#vCode').value.trim(); if (code.length < 4) { $('#vCode').focus(); return; } const b = $('#vVerify'); b.disabled = true; b.textContent = 'Checking';
        try { const r = await api('/api/connectors/vault/verify', { body: { challengeId, code } }); stepWorkspaces(challengeId, r); } catch (err) { b.disabled = false; b.textContent = 'Continue'; apiToast(err, 'That code did not work'); } };
      $('#vVerify').addEventListener('click', go); $('#vCode').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); $('#vCode').focus();
    }
  });
  const stepWorkspaces = (challengeId, r) => {
    const ws = r.workspaces || [];
    openModal(`<h2>Choose what Ricorsa may search</h2><p class="sub">${ws.length ? `Workspaces open to <b>${esc(r.email)}</b>. Ricorsa searches and reads only what you tick; the Vault logs every read.` : `<b>${esc(r.email)}</b> has no Vault workspaces to share. Ask your Vault administrator to add you to one.`}</p>
      <div class="tool-list">${ws.map(w => `<label class="tool-row"><input type="checkbox" data-ws="${esc(w.id)}" checked><span><b>${esc(w.name)}</b><small>${esc(w.tenant)} · ${Number(w.documents || 0).toLocaleString('en-US')} documents, ${Number(w.pages || 0).toLocaleString('en-US')} pages${w.paperFolders ? `, ${w.paperFolders} folders still on paper` : ''}</small></span></label>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button>${ws.length ? `<button type="button" class="btn primary" id="vOk">Connect</button>` : ''}</div>`, {
      onMount: ov => { const ok = $('#vOk'); if (!ok) return; ok.addEventListener('click', async () => {
        const picked = $$('[data-ws]', ov).filter(x => x.checked).map(x => x.dataset.ws); if (!picked.length) { toast('Tick at least one workspace', 'bad'); return; }
        ok.disabled = true; ok.textContent = 'Connecting';
        try {
          const res = await api('/api/connectors/vault/approve', { body: { challengeId, workspaceIds: picked, name: existing ? existing.name : undefined, spaceIds: existing ? (existing.spaceIds || []) : scope ? [scope.spaceId] : undefined } });
          if (existing) { try { await api('/api/connectors/' + encodeURIComponent(existing.id), { method: 'DELETE' }); } catch (e) { /* the old connection is revoked with the row */ } state.connectors = (state.connectors || []).filter(x => x.id !== existing.id); }
          state.connectors = [...(state.connectors || []), res.connector]; closeModal(); paintConnectors(); if (scope && scope.onAdded) scope.onAdded();
          toast(res.connector.status === 'ok' ? `Vault connected: ${res.workspaces.length} workspace${res.workspaces.length === 1 ? '' : 's'}, ${res.connector.tools.length} tools` : `Vault connected, but ${res.connector.lastError || 'it could not be reached yet'}`, res.connector.status === 'ok' ? 'ok' : 'bad');
        } catch (err) { ok.disabled = false; ok.textContent = 'Connect'; apiToast(err, 'Could not connect'); }
      }); }
    });
  };
  stepEmail();
}
function editConnectorModal(c) {
  openModal(`<h2>Edit ${esc(c.name)}</h2>
    <div class="field"><label for="eName">Name</label><input type="text" id="eName" maxlength="60" value="${esc(c.name)}"></div>
    <div class="field"><label for="eUrl">Server URL</label><input type="url" id="eUrl" maxlength="500" value="${esc(c.url)}"></div>
    ${c.authType === 'bearer' ? `<div class="field"><label for="eToken">New token</label><input type="password" id="eToken" maxlength="4000" autocomplete="off" placeholder="Leave blank to keep the current token"><span class="hint">${c.hasCredential ? 'A token is stored. Paste a new one to replace it.' : 'No token stored yet.'}</span></div>` : ''}
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="eOk">Save</button></div>`, {
    onMount: () => $('#eOk').addEventListener('click', async () => {
      const body = { name: $('#eName').value.trim(), url: $('#eUrl').value.trim() };
      const t = $('#eToken'); if (t && t.value.trim()) body.token = t.value.trim();
      if (!body.name || !body.url) return;
      try { const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body }); Object.assign(c, r.connector); closeModal(); paintConnectors(); toast('Saved'); } catch (err) { apiToast(err, 'Could not save'); }
    })
  });
}
function toolsModal(c) {
  const allowed = c.allowedTools ? new Set(c.allowedTools) : null;
  openModal(`<h2>${esc(c.name)} tools</h2><p class="sub">Untick a tool to keep Ricorsa from using it. All ticked means everything the server offers.</p>
    <div class="tool-list">${c.tools.map(t => `<label class="tool-row"><input type="checkbox" data-tool="${esc(t.name)}" ${!allowed || allowed.has(t.name) ? 'checked' : ''}><span><b>${esc(t.name)}</b>${t.description ? `<small>${esc(t.description)}</small>` : ''}</span></label>`).join('')}</div>
    <div class="modal-actions"><button type="button" class="btn" id="tAll">Tick all</button><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="tOk">Save</button></div>`, {
    onMount: ov => {
      $('#tAll').addEventListener('click', () => $$('[data-tool]', ov).forEach(x => { x.checked = true; }));
      $('#tOk').addEventListener('click', async () => {
        const boxes = $$('[data-tool]', ov); const picked = boxes.filter(x => x.checked).map(x => x.dataset.tool);
        const allowedTools = picked.length === boxes.length ? null : picked;
        if (!picked.length) { toast('Keep at least one tool, or turn the connector off instead', 'bad'); return; }
        try { const r = await api('/api/connectors/' + encodeURIComponent(c.id), { method: 'PATCH', body: { allowedTools } }); Object.assign(c, r.connector); closeModal(); paintConnectors(); toast('Tools saved'); } catch (err) { apiToast(err, 'Could not save'); }
      });
    }
  });
}

function render() {
  closePop();
  state.route = parseRoute();
  const r = state.route;
  if (r.name === 'home') renderHome();
  else if (r.name === 'vault') { renderHome(); openVaultDoc(r.id, r.doc, r.query.p ? +r.query.p : null); }
  else if (r.name === 'thread') renderThread(r.id);
  else if (r.name === 'discover') renderDiscover();
  else if (r.name === 'build') renderBuild(r.id);
  else if (r.name === 'spaces') renderSpaces();
  else if (r.name === 'space') renderSpace(r.id);
  else if (r.name === 'library') renderLibrary();
  else if (r.name === 'graph') renderGraph();
  else if (r.name === 'connectors') renderConnectors();
  renderSidebar();
  closeDrawer();
}
/** The live line for built apps (bridge.js) is loaded with the shell; make sure of it, and repaint the studio once it lands. */
function ensureBridge() {
  if (window.RicorsaBridge || document.querySelector('script[data-bridge]')) return;
  const sc = document.createElement('script'); sc.src = '/app/assets/bridge.js'; sc.dataset.bridge = '1';
  sc.onload = () => { if (state.route && state.route.name === 'build' && state.studio) paintStudio(true); };
  document.head.appendChild(sc);
}
/** Admins see a banner when a model account is refusing requests; customers never do (their builds simply run on the fallback). */
async function checkProviderHealth() {
  if (!isAdmin()) return;
  try {
    const r = await fetch('/api/health/models', { credentials: 'same-origin' }); const h = await r.json().catch(() => null);
    if (!h || h.ok) return;
    if (sessionStorage.getItem('ricorsa.health.dismissed') === String(h.checkedAt)) return;
    const bar = document.createElement('div'); bar.className = 'admin-bar';
    const PROV = { anthropic: 'Anthropic', moonshot: 'Moonshot (Kimi)', openai: 'OpenAI', google: 'Google', xai: 'xAI', mistral: 'Mistral', deepseek: 'DeepSeek', groq: 'Groq', openrouter: 'OpenRouter', together: 'Together' };
    const refused = Object.entries(h.providers || {}).filter(([, v]) => v === 'refused').map(([k]) => PROV[k] || k);
    bar.innerHTML = `${icon('alert', 15)}<span>${esc(refused.length ? `${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} refusing requests (billing or key); the parts set to ${refused.length === 1 ? 'it' : 'them'} run on the next model that works.` : Object.keys(h.providers || {}).length ? 'A model account is not answering.' : 'No model account has a key yet, so nothing can answer.')} Customers are not told.</span><button type="button" class="btn sm" data-health-check>Model accounts</button><button type="button" class="btn sm ghost" data-health-close aria-label="Dismiss">${icon('x', 13)}</button>`;
    document.body.prepend(bar);
    $('[data-health-check]', bar).addEventListener('click', () => modelsModal());
    $('[data-health-close]', bar).addEventListener('click', () => { try { sessionStorage.setItem('ricorsa.health.dismissed', String(h.checkedAt)); } catch (e) {} bar.remove(); });
  } catch (e) { /* the banner is a convenience */ }
}
/** A question handed over in the address (/app?q=… from the site's sample prompts): it lands in the composer, never sent on its own. */
function takeHandedQuestion() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (!q) return;
    state.composerDraft = q.slice(0, 4000);
    history.replaceState(null, '', location.pathname + (location.hash || '#/home'));
  } catch (e) { /* nothing handed over */ }
}
function init() {
  setupSidebar();
  ensureBridge();
  takeHandedQuestion();
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newThread(); return; }
    if (e.key === 'Escape') { if (viewer) { closeFileViewer(); return; } closePop(); closeModal(); closeDrawer(); return; }
    if (viewer && !inField && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { viewerShow(viewer.index + (e.key === 'ArrowLeft' ? -1 : 1)); return; }
    if (e.key === '/' && !inField) { const ta = $('#main textarea'); if (ta) { e.preventDefault(); ta.focus(); } }
  });
  $('#main').innerHTML = `<div class="view"><div class="scroll"><div class="home"><div class="hero-mark"><span class="logomark" style="width:48px;height:48px">${LOGO_SVG(48)}</span>${WORDMARK(34).replace('class="wordmark"', 'class="wordmark big"')}</div><div class="tagline"><span class="dots">Loading your library</span></div></div></div></div>`;
  bootstrap().then(() => render()).catch(e => {
    if (e && e.status === 401) return;
    $('#main').innerHTML = `<div class="view"><div class="scroll"><div class="home"><div class="notice">${icon('alert', 17)}<div>${esc((e && e.message) || 'Could not load your account.')} <a href="/app">Try again</a></div></div></div></div></div>`;
  });
}
init();
