'use strict';
/* =====================================================================
   SMEPro Ricorsa Manager Console. A single-page app over /api/*: customers, Ricorsa sign-ups, licences,
   trials, communication, invoices and billing, staff and settings. Records live in the console's database;
   the layout of every grid (columns, widths, sort, filters, page size) is remembered per person, and
   saved views can be shared with the team.
   Sections: utils · icons · state and api · ui primitives · grid · router and shell · pages · init
   ===================================================================== */

// ---------- Utils ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const money = (cents, currency = 'USD') => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100); } catch { return `${currency} ${((cents || 0) / 100).toFixed(2)}`; } };
const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const fmtDateTime = ts => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const isoDay = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
const dayMs = s => { if (!s) return null; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? null : d.getTime(); };
function relTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts, m = Math.round(d / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const days = Math.round(h / 24); if (days < 7) return days + 'd ago';
  return fmtDate(ts);
}
function inDays(ts) { if (!ts) return ''; const d = Math.ceil((ts - Date.now()) / 86400e3); return d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `in ${d}d`; }
const initials = s => String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
function colorFor(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const hues = [205, 190, 160, 25, 340, 265, 100, 45]; return `hsl(${hues[h % hues.length]} 38% 46%)`; }
function csvOf(rows, columns) {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(c.csv ? c.csv(r) : (c.text ? c.text(r) : r[c.key]))).join(','))].join('\n');
}
function download(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false, i = 0; const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; } field += ch; i++; continue; }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}
const PLAN_LABEL = { free: 'Free', pro: 'Pro', team: 'Team', custom: 'Custom' };
const STATUS_LABEL = { lead: 'Lead', trial: 'Trial', active: 'Active', past_due: 'Past due', churned: 'Churned' };
const pill = (v, cls) => `<span class="pill ${esc(cls || v)}"><span class="dot"></span>${esc(v)}</span>`;
const statusPill = s => pill(STATUS_LABEL[s] || s, s);
const planPill = p => `<span class="pill ${esc(p)}">${esc(PLAN_LABEL[p] || p)}</span>`;

// ---------- Icons ----------
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M21.5 19a4.5 4.5 0 0 0-5-4.3"/>',
  userPlus: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M13 10l2 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  invoice: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>',
  staff: '<path d="M12 3l9 4-9 4-9-4z"/><path d="M5 11v5c0 1.5 3 3 7 3s7-1.5 7-3v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  sortAsc: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  sortDesc: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16z"/><path d="M13 7l4 4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 19h16"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/><path d="M4 4l16 16"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  dollar: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3.5-5-3.5S7 5.6 7 7.5s2.2 3 5 3.5 5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5"/>',
  loop: '<path d="M12 4 L14.29 4.52 L16.29 5.63 L17.87 7.23 L18.9 9.15 L19.34 11.24 L19.18 13.31 L18.47 15.2 L17.28 16.77 L15.74 17.91 L14 18.55 L12.2 18.67 L10.49 18.29 L9 17.47 L7.85 16.3 L7.1 14.9 L6.79 13.39 L6.91 11.92 L7.43 10.59 L8.27 9.5 L9.34 8.74 L10.53 8.32 L11.74 8.27 L12.86 8.55 L13.81 9.11 L14.52 9.88 L14.95 10.78 L15.1 11.71 L14.98 12.59 L14.62 13.34 L14.1 13.93"/><circle cx="12" cy="12.4" r="1.4" fill="currentColor" stroke="none"/>',
};
function icon(name, size = 18, extra = '') {
  let cls = 'ico';
  extra = String(extra || '').replace(/\bclass="([^"]*)"/, (_, c) => { cls += ' ' + c; return ''; }).trim();
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONS[name] || ''}</svg>`;
}
const SPIRAL = 'M4355 4776 c-49 -22 -77 -60 -83 -112 -11 -103 55 -154 199 -154 224 0 468 -98 636 -254 216 -200 319 -497 269 -776 -29 -160 -104 -306 -220 -427 -160 -169 -339 -248 -561 -247 -202 1 -340 57 -475 193 -129 130 -180 251 -180 427 0 160 54 288 168 396 182 174 459 185 615 24 113 -115 128 -291 36 -407 -58 -73 -176 -103 -233 -58 -34 27 -33 59 4 111 36 49 39 98 10 146 -50 81 -165 76 -247 -10 -84 -87 -102 -225 -44 -342 124 -251 471 -277 696 -51 277 277 186 742 -180 928 -281 142 -628 81 -866 -153 -415 -409 -294 -1098 242 -1375 163 -84 376 -126 541 -105 377 47 679 251 861 580 141 258 167 598 66 886 -151 434 -538 731 -1017 783 -133 14 -200 13 -237 -3z';
const LOGO_SVG = (size = 28) => `<svg width="${size}" height="${size}" viewBox="247 149.5 423 423" aria-hidden="true"><defs><linearGradient id="rg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B6BB0"/><stop offset=".55" stop-color="#075AA0"/><stop offset="1" stop-color="#063C7E"/></linearGradient><linearGradient id="rs${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE3F8"/></linearGradient></defs><rect x="247" y="149.5" width="423" height="423" rx="100" fill="url(#rg${size})"/><g transform="translate(0,724) scale(0.1,-0.1)"><path d="${SPIRAL}" fill="url(#rs${size})"/></g></svg>`;

// ---------- State and API ----------
const state = {
  me: null, staff: [], settings: null, integrations: {}, app: {},
  ui: (() => { try { return Object.assign({ grids: {}, sidebar: true }, JSON.parse(localStorage.getItem('console.ui') || '{}')); } catch { return { grids: {}, sidebar: true }; } })(),
  cache: {}, route: { name: 'dashboard' }, ready: false, gate: null,
};
function persistUi() { try { localStorage.setItem('console.ui', JSON.stringify(state.ui)); } catch {} }
let prefsDirty = false;
const persistPrefs = debounce(() => { prefsDirty = false; api('/api/me', { method: 'PATCH', body: { grids: state.ui.grids } }).catch(() => { prefsDirty = true; }); }, 600);
const markPrefs = () => { prefsDirty = true; persistPrefs(); };
// A layout change right before leaving still reaches the server.
window.addEventListener('pagehide', () => { if (prefsDirty && navigator.sendBeacon) navigator.sendBeacon('/api/me', new Blob([JSON.stringify({ grids: state.ui.grids })], { type: 'application/json' })); });
async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {} };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  let res;
  try { res = await fetch(path, init); } catch { throw { status: 0, code: 'network', message: 'You appear to be offline.' }; }
  if (res.status === 401) { location.href = '/auth/login?returnTo=' + encodeURIComponent('/' + location.hash); throw { status: 401, code: 'unauthenticated', message: 'Sign in to continue' }; }
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw { status: res.status, code: (data && data.code) || 'error', message: (data && data.error) || ('Request failed (' + res.status + ')') };
  return data;
}
const can = (min) => { const rank = { viewer: 1, manager: 2, owner: 3 }; return state.me && rank[state.me.role] >= rank[min]; };
const staffName = id => { const s = state.staff.find(x => x.id === id); return s ? (s.name || s.email) : ''; };

// ---------- UI primitives ----------
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  el.innerHTML = icon(kind === 'bad' ? 'alert' : 'check', 16) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, kind === 'bad' ? 4200 : 2600);
}
const apiToast = (e, fallback) => toast((e && e.message) || fallback || 'Something went wrong', 'bad');
function openModal(html, { onMount, wide } = {}) {
  closeModal();
  const root = $('#modalRoot');
  root.innerHTML = `<div class="overlay" id="overlay"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = $('#overlay');
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
  if (onMount) onMount(ov);
  const first = ov.querySelector('input:not([type=hidden]), textarea, select, button.primary, button');
  if (first) first.focus();
  return ov;
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function confirmModal(title, body, { okLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    openModal(`<h2>${esc(title)}</h2><p class="sub">${esc(body)}</p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" id="okBtn">${esc(okLabel)}</button></div>`, {
      onMount: ov => { let done = false; $('#okBtn').addEventListener('click', () => { done = true; closeModal(); resolve(true); }); const obs = new MutationObserver(() => { if (!$('#overlay')) { obs.disconnect(); if (!done) resolve(false); } }); obs.observe($('#modalRoot'), { childList: true }); },
    });
  });
}
let popCleanup = null;
function closePop() { if (popCleanup) { popCleanup(); popCleanup = null; } }
function openPop(anchor, html, { align = 'left', onMount } = {}) {
  if (popCleanup && anchor.getAttribute('aria-expanded') === 'true') { closePop(); return null; }
  closePop();
  const pop = document.createElement('div'); pop.className = 'pop'; pop.innerHTML = html; document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const place = () => { const w = pop.offsetWidth, h = pop.offsetHeight; let left = align === 'right' ? r.right - w : r.left; left = clamp(left, 8, window.innerWidth - w - 8); let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6); pop.style.left = left + 'px'; pop.style.top = top + 'px'; };
  place(); anchor.setAttribute('aria-expanded', 'true');
  const onDoc = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePop(); };
  const onKey = e => { if (e.key === 'Escape') closePop(); };
  setTimeout(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }, 0);
  popCleanup = () => { pop.remove(); anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  if (onMount) onMount(pop);
  return pop;
}
const menu = (items) => items.map(it => it === '-' ? '<div class="sep"></div>' : `<button type="button" class="pop-item${it.danger ? ' danger' : ''}${it.on ? ' on' : ''}" data-act="${esc(it.key)}"${it.disabled ? ' disabled' : ''}>${it.icon ? icon(it.icon, 15) : ''}<span>${esc(it.label)}</span></button>`).join('');
function actionMenu(anchor, items, onPick, align = 'right') {
  openPop(anchor, menu(items), { align, onMount: pop => $$('[data-act]', pop).forEach(b => b.addEventListener('click', () => { closePop(); onPick(b.dataset.act); })) });
}
/** A small form builder: fields -> html, and a reader that returns typed values. */
function formHtml(fields, values = {}) {
  return `<div class="form-grid">${fields.map(f => {
    const v = values[f.key] ?? f.value ?? '';
    const cls = f.span ? 'field span2' : 'field';
    if (f.type === 'select') return `<div class="${cls}"><label>${esc(f.label)}</label><select name="${esc(f.key)}">${(f.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    if (f.type === 'textarea') return `<div class="${cls}"><label>${esc(f.label)}</label><textarea name="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    if (f.type === 'check') return `<div class="${cls}"><label class="check"><input type="checkbox" name="${esc(f.key)}"${v ? ' checked' : ''}> ${esc(f.label)}</label>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    const t = f.type === 'money' ? 'number' : (f.type || 'text');
    const val = f.type === 'money' ? (v === '' ? '' : (v / 100).toFixed(2)) : f.type === 'date' ? isoDay(v) : v;
    return `<div class="${cls}"><label>${esc(f.label)}</label><input type="${t}" name="${esc(f.key)}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}"${f.type === 'money' ? ' step="0.01" min="0"' : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.required ? ' required' : ''}>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}
function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.key}"]`); if (!el) continue;
    if (f.type === 'check') { out[f.key] = el.checked; continue; }
    const raw = el.value;
    if (f.type === 'money') out[f.key] = raw === '' ? 0 : Math.round(parseFloat(raw) * 100);
    else if (f.type === 'number') out[f.key] = raw === '' ? null : Number(raw);
    else if (f.type === 'date') out[f.key] = raw ? dayMs(raw) : null;
    else out[f.key] = raw.trim();
  }
  return out;
}

// ---------- Grid ----------
/**
 * An interactive table over an array of rows: sort by any column, search, filter chips, hide and resize columns,
 * page through, select rows for bulk actions, edit cells in place (double-click or Enter), export what is shown
 * as CSV, and keep every layout choice per person (and per saved view). The caller supplies the columns and the
 * rows; edits and actions are callbacks that talk to the API.
 */
const PAGE_SIZES = [25, 50, 100, 250, 1000];
function createGrid(cfg) {
  const key = cfg.key;
  const saved = state.ui.grids[key] || {};
  const layout = Object.assign({ cols: {}, order: null, sort: cfg.defaultSort || null, page: cfg.pageSize || 50, filters: {}, q: '' }, saved);
  const el = document.createElement('div'); el.className = 'content flush'; el.dataset.grid = key;
  let rows = cfg.rows || [], filtered = [], pageNo = 0, selected = new Set(), focus = null, views = null;
  const columns = () => { const order = layout.order || cfg.columns.map(c => c.key); const known = cfg.columns.filter(c => order.includes(c.key)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)); return known.concat(cfg.columns.filter(c => !order.includes(c.key))); };
  const visible = () => columns().filter(c => !(layout.cols[c.key] && layout.cols[c.key].hidden) && !(c.hidden && !(layout.cols[c.key] && layout.cols[c.key].hidden === false)));
  const textOf = (c, r) => c.text ? c.text(r) : c.type === 'money' ? money(r[c.key], r.currency) : c.type === 'date' ? fmtDate(r[c.key]) : c.type === 'datetime' ? fmtDateTime(r[c.key]) : c.type === 'tags' ? (r[c.key] || []).join(', ') : c.type === 'select' && c.options ? ((c.options.find(o => o.value === r[c.key]) || {}).label || r[c.key] || '') : String(r[c.key] ?? '');
  const sortValue = (c, r) => c.sortValue ? c.sortValue(r) : (c.type === 'money' || c.type === 'number' || c.type === 'date' || c.type === 'datetime') ? (r[c.key] ?? -Infinity) : textOf(c, r).toLowerCase();
  const cellHtml = (c, r) => {
    if (c.render) return c.render(r);
    const t = textOf(c, r);
    if (c.type === 'tags') return (r[c.key] || []).map(x => `<span class="tag">${esc(x)}</span>`).join(' ');
    if (c.type === 'pill') return t ? pill(t, r[c.key]) : '';
    if (c.type === 'link' && t) return `<a href="${esc(/^https?:/.test(t) ? t : 'https://' + t)}" target="_blank" rel="noopener">${esc(t.replace(/^https?:\/\//, ''))}</a>`;
    if (c.type === 'email' && t) return `<a href="mailto:${esc(t)}">${esc(t)}</a>`;
    return esc(t);
  };
  const save = () => { state.ui.grids[key] = layout; persistUi(); markPrefs(); };
  const applyFilters = () => {
    const q = (layout.q || '').trim().toLowerCase(); const cols = visible();
    filtered = rows.filter(r => {
      for (const f of (cfg.filters || [])) { const v = layout.filters[f.key]; if (v && v !== 'all' && !f.test(r, v)) return false; }
      if (!q) return true;
      return cols.some(c => textOf(c, r).toLowerCase().includes(q)) || (cfg.searchExtra ? cfg.searchExtra(r).toLowerCase().includes(q) : false);
    });
    if (layout.sort) { const c = cfg.columns.find(x => x.key === layout.sort.key); if (c) { const dir = layout.sort.dir === 'desc' ? -1 : 1; filtered.sort((a, b) => { const va = sortValue(c, a), vb = sortValue(c, b); if (va === vb) return 0; if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir; return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir; }); } }
    const pages = Math.max(1, Math.ceil(filtered.length / layout.page)); if (pageNo >= pages) pageNo = pages - 1;
  };
  el.innerHTML = `<div class="toolbar" data-toolbar></div><div class="bulkbar" data-bulk hidden></div><div class="grid-wrap" data-wrap><table class="grid"><thead data-head></thead><tbody data-body></tbody></table></div><div class="grid-foot" data-foot></div>`;
  const toolbar = $('[data-toolbar]', el), bulk = $('[data-bulk]', el), wrap = $('[data-wrap]', el), head = $('[data-head]', el), body = $('[data-body]', el), foot = $('[data-foot]', el);

  const paintToolbar = () => {
    const chips = (cfg.filters || []).map(f => `<div class="chips" data-filter="${esc(f.key)}">${[{ value: 'all', label: f.allLabel || 'All' }].concat(f.options).map(o => { const n = o.value === 'all' ? rows.length : rows.filter(r => f.test(r, o.value)).length; return `<button type="button" data-v="${esc(o.value)}" class="${(layout.filters[f.key] || 'all') === o.value ? 'on' : ''}">${esc(o.label)}<span class="n">${n}</span></button>`; }).join('')}</div>`).join('');
    toolbar.innerHTML = `<div class="search">${icon('search', 15)}<input type="search" placeholder="${esc(cfg.searchPlaceholder || 'Search')}" value="${esc(layout.q || '')}" aria-label="Search"></div>${chips}<span class="spacer"></span>${cfg.toolbarHtml || ''}
      <button type="button" class="btn sm" data-views title="Saved views: filters, sort and columns you can come back to">${icon('eye', 14)}<span>Views</span></button>
      <button type="button" class="btn sm" data-cols title="Show, hide and reset columns">${icon('columns', 14)}<span>Columns</span></button>
      <button type="button" class="btn sm" data-export title="Download what is shown as a CSV">${icon('download', 14)}<span>Export</span></button>${cfg.addLabel ? `<button type="button" class="btn sm primary" data-add>${icon('plus', 14)}<span>${esc(cfg.addLabel)}</span></button>` : ''}`;
    const inp = $('input[type=search]', toolbar);
    inp.addEventListener('input', debounce(() => { layout.q = inp.value; pageNo = 0; save(); paint(false); }, 120));
    $$('[data-filter]', toolbar).forEach(g => $$('button', g).forEach(b => b.addEventListener('click', () => { layout.filters[g.dataset.filter] = b.dataset.v; pageNo = 0; save(); paintToolbar(); paint(false); })));
    if (cfg.onAdd) $('[data-add]', toolbar)?.addEventListener('click', cfg.onAdd);
    $('[data-export]', toolbar).addEventListener('click', () => download(`${cfg.csvName || key}-${isoDay(Date.now())}.csv`, csvOf(filtered, visible().map(c => ({ label: c.label, text: r => textOf(c, r), csv: c.csv })))));
    $('[data-cols]', toolbar).addEventListener('click', e => openPop(e.currentTarget, `<div class="pop-h">Columns</div>${columns().map(c => `<label class="pop-item"><input type="checkbox" data-col="${esc(c.key)}"${visible().includes(c) ? ' checked' : ''}> <span>${esc(c.label)}</span></label>`).join('')}<div class="sep"></div><button type="button" class="pop-item" data-reset>${icon('refresh', 15)}<span>Reset layout</span></button>`, { align: 'right', onMount: pop => {
      $$('[data-col]', pop).forEach(cb => cb.addEventListener('change', () => { layout.cols[cb.dataset.col] = Object.assign({}, layout.cols[cb.dataset.col], { hidden: !cb.checked }); save(); paint(true); }));
      $('[data-reset]', pop).addEventListener('click', () => { layout.cols = {}; layout.order = null; layout.sort = cfg.defaultSort || null; layout.q = ''; layout.filters = {}; save(); closePop(); paintToolbar(); paint(true); });
    } }));
    $('[data-views]', toolbar).addEventListener('click', async e => {
      const anchor = e.currentTarget;
      if (!views) { try { views = (await api('/api/views')).views; } catch { views = []; } }
      const mine = views.filter(v => v.entity === key);
      openPop(anchor, `<div class="pop-h">Saved views</div>${mine.length ? mine.map(v => `<button type="button" class="pop-item" data-view="${esc(v.id)}">${icon(v.shared ? 'users' : 'eye', 15)}<span>${esc(v.name)}</span>${v.staffId === state.me.id || can('owner') ? `<span class="icon-btn sm" data-del="${esc(v.id)}" title="Delete this view" style="margin-left:auto">${icon('x', 13)}</span>` : ''}</button>`).join('') : '<div class="pop-item muted">No saved views yet</div>'}<div class="sep"></div><button type="button" class="pop-item" data-save>${icon('save', 15)}<span>Save current view…</span></button>`, { align: 'right', onMount: pop => {
        $$('[data-view]', pop).forEach(b => b.addEventListener('click', ev => { if (ev.target.closest('[data-del]')) return; const v = mine.find(x => x.id === b.dataset.view); if (!v) return; Object.assign(layout, JSON.parse(JSON.stringify(v.config))); save(); closePop(); paintToolbar(); paint(true); toast(`View "${v.name}" applied`); }));
        $$('[data-del]', pop).forEach(b => b.addEventListener('click', async ev => { ev.stopPropagation(); closePop(); if (!(await confirmModal('Delete this view?', 'The saved filters, sort and columns are removed. Records are not affected.', { okLabel: 'Delete', danger: true }))) return; try { await api('/api/views/' + b.dataset.del, { method: 'DELETE' }); views = views.filter(v => v.id !== b.dataset.del); toast('View deleted'); } catch (err) { apiToast(err); } }));
        $('[data-save]', pop).addEventListener('click', () => { closePop(); openModal(`<h2>Save this view</h2><p class="sub">Keeps the search, filters, sort, columns and page size as they are now.</p>${formHtml([{ key: 'name', label: 'Name', required: true, span: true }, { key: 'shared', label: 'Share with the whole team', type: 'check', span: true }])}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="svOk">Save view</button></div>`, { onMount: ov => $('#svOk').addEventListener('click', async () => { const f = readForm(ov, [{ key: 'name' }, { key: 'shared', type: 'check' }]); if (!f.name) return; try { const r = await api('/api/views', { body: { entity: key, name: f.name, shared: f.shared, config: { cols: layout.cols, order: layout.order, sort: layout.sort, page: layout.page, filters: layout.filters, q: layout.q } } }); views.unshift(r.view); closeModal(); toast('View saved'); } catch (err) { apiToast(err); } }) }); });
      } });
    });
  };
  const paintBulk = () => {
    bulk.hidden = !selected.size;
    if (!selected.size) return;
    bulk.innerHTML = `<b>${selected.size} selected</b>${filtered.length > selected.size ? `<button type="button" class="btn xs" data-all>Select all ${filtered.length} matching</button>` : ''}<span class="spacer"></span>${(cfg.bulk || []).map(b => `<button type="button" class="btn xs${b.danger ? ' danger' : ''}" data-bk="${esc(b.key)}">${b.icon ? icon(b.icon, 13) : ''}${esc(b.label)}</button>`).join('')}<button type="button" class="btn xs ghost" data-clear>${icon('x', 13)}Clear</button>`;
    $('[data-all]', bulk)?.addEventListener('click', () => { filtered.forEach(r => selected.add(cfg.rowId(r))); paint(false); });
    $('[data-clear]', bulk).addEventListener('click', () => { selected.clear(); paint(false); });
    $$('[data-bk]', bulk).forEach(b => b.addEventListener('click', () => cfg.onBulk && cfg.onBulk(b.dataset.bk, Array.from(selected), rows.filter(r => selected.has(cfg.rowId(r))))));
  };
  const paintHead = () => {
    const cols = visible();
    head.innerHTML = `<tr>${cfg.selectable ? '<th class="sel-cell"><input type="checkbox" data-selall aria-label="Select all on this page"></th>' : ''}${cols.map(c => { const w = (layout.cols[c.key] && layout.cols[c.key].width) || c.width; const s = layout.sort && layout.sort.key === c.key ? layout.sort.dir : null; return `<th style="${w ? `width:${w}px;min-width:${w}px;max-width:${w}px` : ''}"><div class="th${c.sortable === false ? '' : ' sortable'}${c.align === 'right' || c.type === 'money' || c.type === 'number' ? ' num' : ''}" data-sort="${esc(c.key)}" title="${esc(c.title || '')}"><span>${esc(c.label)}</span>${s ? icon(s === 'asc' ? 'sortAsc' : 'sortDesc', 12) : ''}<span class="rz" data-rz="${esc(c.key)}"></span></div></th>`; }).join('')}${cfg.actions ? '<th style="width:40px"></th>' : ''}</tr>`;
    $$('[data-sort]', head).forEach(h => h.addEventListener('click', e => { if (e.target.closest('[data-rz]')) return; const c = cfg.columns.find(x => x.key === h.dataset.sort); if (!c || c.sortable === false) return; layout.sort = layout.sort && layout.sort.key === c.key ? (layout.sort.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }; save(); paint(true); }));
    $$('[data-rz]', head).forEach(h => h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const th = h.closest('th'); const startX = e.clientX, startW = th.getBoundingClientRect().width;
      const move = ev => { const w = clamp(startW + ev.clientX - startX, 60, 900); th.style.width = th.style.minWidth = th.style.maxWidth = w + 'px'; layout.cols[h.dataset.rz] = Object.assign({}, layout.cols[h.dataset.rz], { width: Math.round(w) }); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); save(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    }));
    $('[data-selall]', head)?.addEventListener('change', e => { const page = pageRows(); if (e.target.checked) page.forEach(r => selected.add(cfg.rowId(r))); else page.forEach(r => selected.delete(cfg.rowId(r))); paint(false); });
  };
  const pageRows = () => layout.page >= 1000 ? filtered : filtered.slice(pageNo * layout.page, (pageNo + 1) * layout.page);
  const paintBody = () => {
    const cols = visible(); const page = pageRows();
    if (!page.length) { body.innerHTML = `<tr><td colspan="${cols.length + 2}"><div class="empty"><b>${esc(rows.length ? 'Nothing matches' : (cfg.emptyTitle || 'Nothing here yet'))}</b>${esc(rows.length ? 'Try a different search or clear the filters.' : (cfg.emptyText || ''))}</div></td></tr>`; return; }
    body.innerHTML = page.map(r => { const id = cfg.rowId(r); return `<tr class="row${cfg.onRowClick ? ' clickable' : ''}${selected.has(id) ? ' selected' : ''}" data-id="${esc(id)}">${cfg.selectable ? `<td class="sel-cell"><input type="checkbox" data-sel="${esc(id)}"${selected.has(id) ? ' checked' : ''} aria-label="Select row"></td>` : ''}${cols.map(c => `<td class="${c.primary ? 'primary ' : ''}${c.editable && can('manager') ? 'editable ' : ''}${c.align === 'right' || c.type === 'money' || c.type === 'number' ? 'num' : ''}" data-col="${esc(c.key)}" title="${esc(c.noTitle ? '' : textOf(c, r))}">${cellHtml(c, r)}</td>`).join('')}${cfg.actions ? `<td><span class="acts"><button type="button" class="icon-btn sm" data-more aria-label="Actions">${icon('more', 16)}</button></span></td>` : ''}</tr>`; }).join('');
    $$('[data-sel]', body).forEach(cb => cb.addEventListener('change', () => { if (cb.checked) selected.add(cb.dataset.sel); else selected.delete(cb.dataset.sel); cb.closest('tr').classList.toggle('selected', cb.checked); paintBulk(); }));
    $$('[data-more]', body).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const r = rowById(b.closest('tr').dataset.id); const items = cfg.actions(r); if (items && items.length) actionMenu(b, items, k => cfg.onAction(r, k)); }));
  };
  const rowById = id => rows.find(r => cfg.rowId(r) === id);
  const paintFoot = () => {
    const pages = Math.max(1, Math.ceil(filtered.length / layout.page)); const from = filtered.length ? pageNo * layout.page + 1 : 0, to = Math.min(filtered.length, (pageNo + 1) * layout.page);
    const noun = n => { const w = cfg.noun || 'rows'; return n === 1 ? (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') ? w.slice(0, -1) : w) : w; };
    foot.innerHTML = `<span>${filtered.length === rows.length ? `${rows.length.toLocaleString('en-US')} ${noun(rows.length)}` : `${filtered.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} ${noun(rows.length)}`}${cfg.footExtra ? ' · ' + cfg.footExtra(filtered) : ''}</span><span class="spacer"></span><label class="small">Rows <select data-ps>${PAGE_SIZES.map(n => `<option value="${n}"${layout.page === n ? ' selected' : ''}>${n >= 1000 ? 'All' : n}</option>`).join('')}</select></label><span class="pages"><button type="button" class="icon-btn sm" data-pg="-1" ${pageNo === 0 ? 'disabled' : ''} aria-label="Previous page">${icon('chevronLeft', 15)}</button><span>${from}–${to}</span><button type="button" class="icon-btn sm" data-pg="1" ${pageNo >= pages - 1 ? 'disabled' : ''} aria-label="Next page">${icon('chevronRight', 15)}</button></span>`;
    $('[data-ps]', foot).addEventListener('change', e => { layout.page = +e.target.value; pageNo = 0; save(); paint(false); });
    $$('[data-pg]', foot).forEach(b => b.addEventListener('click', () => { pageNo = clamp(pageNo + +b.dataset.pg, 0, pages - 1); paint(false); wrap.scrollTop = 0; }));
  };
  const paint = (full) => { applyFilters(); if (full) paintHead(); paintBody(); paintFoot(); paintBulk(); };

  // Editing in place
  const startEdit = (td) => {
    const tr = td.closest('tr'); const r = rowById(tr.dataset.id); const c = cfg.columns.find(x => x.key === td.dataset.col);
    if (!r || !c || !c.editable || !can('manager') || td.classList.contains('editing')) return;
    const cur = r[c.key];
    td.classList.add('editing'); td.dataset.was = td.innerHTML;
    if (c.type === 'select') td.innerHTML = `<select>${(c.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(cur ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    else td.innerHTML = `<input type="${c.type === 'money' || c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}" value="${esc(c.type === 'money' ? ((cur || 0) / 100).toFixed(2) : c.type === 'date' ? isoDay(cur) : c.type === 'tags' ? (cur || []).join(', ') : (cur ?? ''))}"${c.type === 'money' ? ' step="0.01"' : ''}>`;
    const inp = td.firstElementChild; inp.focus(); if (inp.select) inp.select();
    let done = false;
    const finish = async (commit, nextDir) => {
      if (done) return; done = true;
      let v = inp.value;
      if (c.type === 'money') v = v === '' ? 0 : Math.round(parseFloat(v) * 100); else if (c.type === 'number') v = v === '' ? null : Number(v); else if (c.type === 'date') v = v ? dayMs(v) : null; else if (c.type === 'tags') v = v.split(',').map(s => s.trim()).filter(Boolean); else v = v.trim();
      td.classList.remove('editing'); td.innerHTML = td.dataset.was;
      if (commit && JSON.stringify(v) !== JSON.stringify(cur ?? (c.type === 'tags' ? [] : c.type === 'money' ? 0 : ''))) {
        const prev = r[c.key]; r[c.key] = v; td.innerHTML = cellHtml(c, r);
        try { const updated = await cfg.onEdit(r, c.key, v); if (updated) { Object.assign(r, updated); paint(false); } } catch (e) { r[c.key] = prev; td.innerHTML = cellHtml(c, r); apiToast(e); }
      }
      if (nextDir) { const cells = $$('td.editable', tr); const i = cells.indexOf(td); const nxt = cells[i + nextDir]; if (nxt) startEdit(nxt); }
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } else if (e.key === 'Tab') { e.preventDefault(); finish(true, e.shiftKey ? -1 : 1); } });
    inp.addEventListener('blur', () => setTimeout(() => finish(true), 0));
    if (c.type === 'select') inp.addEventListener('change', () => finish(true));
  };
  body.addEventListener('dblclick', e => { const td = e.target.closest('td.editable'); if (td) { e.preventDefault(); startEdit(td); } });
  body.addEventListener('click', e => {
    if (e.target.closest('input, a, button, select')) return;
    const td = e.target.closest('td'); if (!td) return;
    $$('td.focused', body).forEach(x => x.classList.remove('focused')); td.classList.add('focused'); focus = td;
    if (td.classList.contains('primary') && cfg.onRowClick) { const r = rowById(td.closest('tr').dataset.id); if (r) cfg.onRowClick(r); }
  });
  wrap.addEventListener('keydown', e => {
    if (!focus || !focus.isConnected || e.target.closest('input, select, textarea')) return;
    const tr = focus.closest('tr'); const tds = $$('td', tr).filter(t => !t.classList.contains('sel-cell')); const i = tds.indexOf(focus);
    let next = null;
    if (e.key === 'ArrowRight') next = tds[i + 1]; else if (e.key === 'ArrowLeft') next = tds[i - 1];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const trs = $$('tr.row', body); const j = trs.indexOf(tr) + (e.key === 'ArrowDown' ? 1 : -1); const t2 = trs[j]; if (t2) next = $$('td', t2).filter(t => !t.classList.contains('sel-cell'))[i]; }
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); if (focus.classList.contains('editable')) startEdit(focus); else if (cfg.onRowClick) { const r = rowById(tr.dataset.id); if (r) cfg.onRowClick(r); } return; }
    else if (e.key === ' ' && cfg.selectable) { e.preventDefault(); const id = tr.dataset.id; if (selected.has(id)) selected.delete(id); else selected.add(id); paint(false); return; }
    if (next) { e.preventDefault(); focus.classList.remove('focused'); next.classList.add('focused'); focus = next; next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });
  wrap.tabIndex = 0;
  paintToolbar(); paint(true);
  return {
    el, layout,
    setRows(next) { rows = next; selected = new Set(Array.from(selected).filter(id => rows.some(r => cfg.rowId(r) === id))); paintToolbar(); paint(true); },
    update(id, patch) { const r = rowById(id); if (r) { Object.assign(r, patch); paint(false); } },
    remove(ids) { const set = new Set(ids); rows = rows.filter(r => !set.has(cfg.rowId(r))); ids.forEach(i => selected.delete(i)); paintToolbar(); paint(false); },
    add(r) { rows.unshift(r); paintToolbar(); paint(false); },
    selected: () => Array.from(selected), clearSelection() { selected.clear(); paint(false); },
    rows: () => rows, filtered: () => filtered,
  };
}

// ---------- Router and shell ----------
const ROUTES = ['dashboard', 'customers', 'signups', 'licenses', 'trials', 'communications', 'invoices', 'staff', 'settings', 'activity'];
function parseRoute() {
  const full = location.hash.replace(/^#\/?/, ''); const [h, qs] = full.split('?'); const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const [name, id, sub] = h.split('/');
  if (!name) return { name: 'dashboard', query };
  if (ROUTES.includes(name)) return { name, id: id ? decodeURIComponent(id) : undefined, sub, query };
  return { name: 'dashboard', query };
}
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
const NAV = [
  { h: 'dashboard', label: 'Dashboard', icon: 'home' },
  { h: 'customers', label: 'Customers', icon: 'users' },
  { h: 'signups', label: 'Ricorsa sign-ups', icon: 'userPlus' },
  { h: 'licenses', label: 'Licences', icon: 'key' },
  { h: 'trials', label: 'Trials', icon: 'clock' },
  { h: 'communications', label: 'Communication', icon: 'mail' },
  { h: 'invoices', label: 'Invoices and billing', icon: 'invoice' },
  { h: 'staff', label: 'Staff', icon: 'staff' },
  { h: 'settings', label: 'Settings', icon: 'settings' },
  { h: 'activity', label: 'Activity log', icon: 'activity' },
];
function shell() {
  const me = state.me;
  $('#app').innerHTML = `
    <nav class="side" id="side" aria-label="Main">
      <div class="brand"><span>${LOGO_SVG(34)}</span><div><b>Ricorsa</b><small>Manager Console · SMEPro</small></div></div>
      <div class="nav-h">Manage</div>
      ${NAV.map(n => `<a class="nav-item" href="#/${n.h}" data-nav="${n.h}">${icon(n.icon, 17)}<span>${n.label}</span></a>`).join('')}
      <div class="side-bottom">
        <a class="nav-item" href="${esc(state.app.productUrl || 'https://ricorsa.com')}" target="_blank" rel="noopener">${icon('external', 17)}<span>Open ricorsa.com</span></a>
        <div class="me"><span class="avatar">${me.picture ? `<img src="${esc(me.picture)}" alt="">` : esc(initials(me.name || me.email))}</span><div class="who"><b>${esc(me.name || me.email)}</b><span>${esc(me.role)} · <a href="/auth/logout">Sign out</a></span></div></div>
      </div>
    </nav>
    <main id="main"></main>`;
  $('#side').addEventListener('click', e => { if (e.target.closest('a')) $('#side').classList.remove('open'); });
}
function setNav(name) { $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name)); }
function page(title, sub, bodyEl, { actions = '', crumbs = null } = {}) {
  const main = $('#main');
  main.innerHTML = `<div class="topbar"><button type="button" class="menu-btn" id="menuBtn" aria-label="Menu">${icon('menu', 20)}</button>${crumbs ? `<div class="crumbs">${crumbs}</div>` : `<h1>${esc(title)}</h1>`}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}<span class="spacer"></span><span data-actions>${actions}</span></div>`;
  main.appendChild(bodyEl);
  $('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
  return main;
}
function contentEl(html, cls = 'content') { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; return el; }
async function render() {
  closePop(); closeModal();
  const r = parseRoute(); state.route = r; setNav(r.name);
  try {
    if (r.name === 'dashboard') await renderDashboard();
    else if (r.name === 'customers') { if (r.id) await renderCustomer(r.id, r.query); else await renderCustomers(); }
    else if (r.name === 'signups') await renderSignups();
    else if (r.name === 'licenses') await renderLicenses();
    else if (r.name === 'trials') await renderTrials();
    else if (r.name === 'communications') await renderCommunications();
    else if (r.name === 'invoices') { if (r.id === 'new') await renderInvoiceEditor(null, r.query); else if (r.id && r.sub === 'edit') { const d = await api('/api/invoices/' + encodeURIComponent(r.id)); await renderInvoiceEditor(d.invoice); } else if (r.id) await renderInvoice(r.id); else await renderInvoices(); }
    else if (r.name === 'staff') await renderStaff();
    else if (r.name === 'settings') await renderSettings();
    else if (r.name === 'activity') await renderActivity();
  } catch (e) {
    if (e && e.status === 401) return;
    page('Something went wrong', '', contentEl(`<div class="notice bad">${icon('alert', 17)}<div>${esc((e && e.message) || 'Could not load this page.')} <a href="#" onclick="render();return false">Try again</a></div></div>`));
  }
  state.ui.lastRoute = location.hash; persistUi();
}
async function load(key, path, force) {
  if (!force && state.cache[key] && Date.now() - state.cache[key].at < 15000) return state.cache[key].data;
  const data = await api(path); state.cache[key] = { data, at: Date.now() }; return data;
}
const invalidate = (...keys) => keys.forEach(k => delete state.cache[k]);

// ---------- Charts (single series columns, hover tooltip, recessive grid) ----------
function columnChart(series, { height = 160, format = v => String(v), labelEvery = 7, labelOf = s => s.label } = {}) {
  const w = 600, padL = 36, padB = 22, padT = 8; const inner = w - padL - 8; const max = Math.max(1, ...series.map(s => s.v));
  const step = inner / series.length; const bw = Math.min(24, Math.max(3, step - 2));
  const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
  const y = v => padT + (height - padT - padB) * (1 - v / max);
  const bars = series.map((s, i) => { const x = padL + i * step + (step - bw) / 2; const top = y(s.v), h = Math.max(0, height - padB - top); const r = Math.min(4, bw / 2, h); return `<path class="bar" data-i="${i}" d="M${x} ${height - padB} v${-(h - r)} a${r} ${r} 0 0 1 ${r} ${-r} h${bw - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - r} z"/><rect data-i="${i}" x="${padL + i * step}" y="${padT}" width="${step}" height="${height - padT - padB}" fill="transparent"/>`; }).join('');
  const grid = ticks.map(t => `<line class="grid-line" x1="${padL}" x2="${w - 8}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-text" x="${padL - 6}" y="${y(t) + 3.5}" text-anchor="end">${esc(format(t))}</text>`).join('');
  const labels = series.map((s, i) => i % labelEvery === 0 || i === series.length - 1 ? `<text class="axis-text" x="${padL + i * step + step / 2}" y="${height - 6}" text-anchor="middle">${esc(labelOf(s))}</text>` : '').join('');
  const el = document.createElement('div'); el.className = 'chart';
  el.innerHTML = `<svg viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img" aria-label="Column chart">${grid}${bars}${labels}</svg><div class="chart-tip" data-tip></div>`;
  const tip = $('[data-tip]', el);
  el.addEventListener('mousemove', e => { const t = e.target.closest('[data-i]'); if (!t) { tip.style.opacity = 0; return; } const s = series[+t.dataset.i]; const r = el.getBoundingClientRect(); tip.innerHTML = `<b>${esc(format(s.v))}</b>${esc(s.full || s.label)}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top - 8) + 'px'; tip.style.opacity = 1; });
  el.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
  return el;
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const d = await load('dashboard', '/api/dashboard', true);
  const c = d.customers, inv = d.invoices, r = d.ricorsa;
  const kpi = (label, value, delta, cls = '') => `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${delta ? `<div class="delta ${cls}">${delta}</div>` : ''}</div>`;
  const body = contentEl(`
    <div class="quick">${can('manager') ? `<button type="button" class="btn sm primary" data-q="customer">${icon('plus', 14)}Add customer</button><button type="button" class="btn sm" data-q="invoice">${icon('invoice', 14)}New invoice</button><button type="button" class="btn sm" data-q="trial">${icon('clock', 14)}Start a trial</button>` : ''}${can('owner') ? `<button type="button" class="btn sm" data-q="staff">${icon('userPlus', 14)}Invite staff</button>` : ''}<a class="btn sm" href="#/signups">${icon('userPlus', 14)}Ricorsa sign-ups</a></div>
    <div class="kpis">
      ${kpi('Customers', c.total.toLocaleString('en-US'), `${c.byStatus.active || 0} active · ${c.byStatus.trial || 0} on trial · ${c.byStatus.lead || 0} leads`)}
      ${kpi('Monthly recurring', money(c.mrrCents), 'From active and past-due customers')}
      ${kpi('Active trials', d.trials.active, d.trials.endingThisWeek ? `${d.trials.endingThisWeek} end this week` : 'None ending this week', d.trials.endingThisWeek ? 'bad' : '')}
      ${kpi('Outstanding invoices', money(inv.outstandingCents), inv.overdueCount ? `${inv.overdueCount} overdue · ${money(inv.overdueCents)}` : `${inv.draftCount} draft${inv.draftCount === 1 ? '' : 's'}`, inv.overdueCount ? 'bad' : '')}
      ${kpi('Received this month', money(inv.paidThisMonthCents), 'Payments recorded since the 1st')}
      ${r ? kpi('Ricorsa accounts', r.total.toLocaleString('en-US'), `${r.week} new this week · ${r.paying} paying`, r.week ? 'good' : '') : kpi('Ricorsa accounts', '–', 'Product database not reachable')}
    </div>
    <div class="cards">
      <div class="card"><h3>Ricorsa sign-ups</h3><div class="sub">New accounts per day, last six weeks</div><div data-chart="signups"></div></div>
      <div class="card"><h3>Revenue received</h3><div class="sub">Payments recorded per month, last twelve months</div><div data-chart="revenue"></div></div>
      <div class="card"><h3>Recent activity</h3><div class="sub">What the team has done lately</div><div class="feed">${d.recent.length ? d.recent.map(a => `<div class="item"><span class="when" title="${esc(fmtDateTime(a.at))}">${esc(relTime(a.at))}</span><span>${esc(a.summary)}<span class="who"> · ${esc((a.actorEmail || 'system').split('@')[0])}</span></span></div>`).join('') : '<div class="empty">Nothing yet. Add a customer to get going.</div>'}</div></div>
      <div class="card"><h3>Licences</h3><div class="sub">${d.licenses.active} active${d.licenses.endingThisMonth ? `, ${d.licenses.endingThisMonth} ending within 30 days` : ''}</div><div class="kv"><dt>Emails and calls</dt><dd>${d.communications.thisWeek} this week</dd><dt>Past due</dt><dd>${c.byStatus.past_due || 0} customer${(c.byStatus.past_due || 0) === 1 ? '' : 's'}</dd><dt>Churned</dt><dd>${c.byStatus.churned || 0}</dd>${r ? `<dt>Plans on Ricorsa</dt><dd>${Object.entries(r.byPlan).map(([k, v]) => `${PLAN_LABEL[k] || k} ${v}`).join(' · ')}</dd>` : ''}</div></div>
    </div>`);
  page('Dashboard', new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), body);
  if (d.signups && d.signups.length) $('[data-chart="signups"]', body).appendChild(columnChart(d.signups.map(s => ({ label: new Date(s.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), full: new Date(s.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), v: s.n })), { format: v => `${v} sign-up${v === 1 ? '' : 's'}` }));
  else $('[data-chart="signups"]', body).innerHTML = '<div class="empty small">Sign-ups appear here once the product database is reachable.</div>';
  $('[data-chart="revenue"]', body).appendChild(columnChart(d.revenue.map(m => ({ label: new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'short' }), full: new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), v: m.cents / 100 })), { format: v => money(Math.round(v * 100)), labelEvery: 1 }));
  $$('[data-q]', body).forEach(b => b.addEventListener('click', () => { const k = b.dataset.q; if (k === 'customer') customerModal(); else if (k === 'invoice') go('#/invoices/new'); else if (k === 'trial') trialModal(); else if (k === 'staff') inviteModal(); }));
}

// ---------- Customers ----------
const STATUS_OPTS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const PLAN_OPTS = Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }));
const ownerOpts = () => [{ value: '', label: 'Unassigned' }].concat(state.staff.map(s => ({ value: s.id, label: s.name || s.email })));
const CUSTOMER_FIELDS = [
  { key: 'name', label: 'Name', required: true, placeholder: 'Person or account name' }, { key: 'company', label: 'Company' },
  { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website', type: 'url', placeholder: 'https://' }, { key: 'source', label: 'Source', placeholder: 'Referral, website, event…' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTS }, { key: 'plan', label: 'Plan', type: 'select', options: PLAN_OPTS },
  { key: 'mrrCents', label: 'Monthly value (USD)', type: 'money' }, { key: 'ownerId', label: 'Owner', type: 'select', options: [] },
  { key: 'notes', label: 'Notes', type: 'textarea', span: true },
];
function customerModal(existing, onDone) {
  const fields = CUSTOMER_FIELDS.map(f => f.key === 'ownerId' ? { ...f, options: ownerOpts() } : f);
  const values = existing ? { ...existing } : { status: 'lead', plan: 'free', ownerId: state.me.id };
  openModal(`<h2>${existing ? 'Edit customer' : 'Add a customer'}</h2><p class="sub">${existing ? 'Changes are saved to the record right away.' : 'An email that matches a Ricorsa account links the two automatically.'}</p>${formHtml(fields, values)}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="cOk">${existing ? 'Save' : 'Add customer'}</button></div>`, { wide: true, onMount: ov => {
    const submit = async () => {
      const f = readForm(ov, fields); if (!f.name) { toast('A name is needed', 'bad'); return; }
      for (const k of ['company', 'email', 'phone', 'website', 'source', 'ownerId']) if (f[k] === '') f[k] = null;
      const btn = $('#cOk'); btn.disabled = true;
      try { const r = existing ? await api('/api/customers/' + existing.id, { method: 'PATCH', body: f }) : await api('/api/customers', { body: f }); invalidate('customers', 'dashboard'); closeModal(); toast(existing ? 'Saved' : 'Customer added'); if (onDone) onDone(r.customer); else go('#/customers/' + r.customer.id); }
      catch (e) { btn.disabled = false; apiToast(e); }
    };
    $('#cOk').addEventListener('click', submit);
    ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); } });
  } });
}
function importModal(onDone) {
  openModal(`<h2>Import customers from a CSV</h2><p class="sub">Columns are matched by their header: name, company, email, phone, website, status, plan, source, tags (separated by ;), notes. Rows with an email that already exists update that customer.</p>
    <div class="field"><label>CSV file</label><input type="file" id="csvFile" accept=".csv,text/csv"></div><div id="csvPreview" class="small muted" style="margin-top:10px"></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="impOk" disabled>Import</button></div>`, { onMount: ov => {
    let rows = [];
    $('#csvFile').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const parsed = parseCsv(await file.text()); if (parsed.length < 2) { $('#csvPreview').textContent = 'The file needs a header row and at least one row of data.'; return; }
      const head = parsed[0].map(h => h.trim().toLowerCase()); const idx = k => head.indexOf(k);
      if (idx('name') < 0) { $('#csvPreview').textContent = 'The file needs a "name" column.'; return; }
      rows = parsed.slice(1).map(r => { const g = k => { const i = idx(k); return i >= 0 ? (r[i] || '').trim() : ''; }; const row = { name: g('name'), company: g('company') || null, email: g('email') || null, phone: g('phone') || null, website: g('website') || null, source: g('source') || null, notes: g('notes') || '' }; const st = g('status').toLowerCase().replace(/\s+/g, '_'), pl = g('plan').toLowerCase(); if (STATUS_LABEL[st]) row.status = st; if (PLAN_LABEL[pl]) row.plan = pl; const tags = g('tags'); if (tags) row.tags = tags.split(/[;|]/).map(s => s.trim()).filter(Boolean).slice(0, 30); return row; }).filter(r => r.name);
      $('#csvPreview').innerHTML = `${rows.length} row${rows.length === 1 ? '' : 's'} ready. First: <b>${esc(rows[0]?.name || '')}</b>${rows[0]?.email ? ` · ${esc(rows[0].email)}` : ''}`;
      $('#impOk').disabled = !rows.length;
    });
    $('#impOk').addEventListener('click', async () => { $('#impOk').disabled = true; try { const r = await api('/api/customers/import', { body: { rows: rows.slice(0, 2000) } }); invalidate('customers', 'dashboard'); closeModal(); toast(`Imported ${r.created} new, updated ${r.updated}`); if (onDone) onDone(); } catch (e) { $('#impOk').disabled = false; apiToast(e); } });
  } });
}
async function renderCustomers() {
  const data = await load('customers', '/api/customers', true);
  const columns = [
    { key: 'name', label: 'Name', primary: true, width: 220, editable: true, render: r => `<span class="lnk">${esc(r.name)}</span>${r.company && r.company !== r.name ? `<span class="cell-sub">${esc(r.company)}</span>` : ''}`, text: r => r.name + (r.company ? ' ' + r.company : '') },
    { key: 'email', label: 'Email', type: 'email', width: 220, editable: true },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTS, editable: true, width: 110, render: r => statusPill(r.status) },
    { key: 'plan', label: 'Plan', type: 'select', options: PLAN_OPTS, editable: true, width: 90, render: r => planPill(r.plan) },
    { key: 'mrrCents', label: 'Monthly', type: 'money', editable: true, width: 100, title: 'Monthly recurring value' },
    { key: 'ownerId', label: 'Owner', type: 'select', options: ownerOpts(), editable: true, width: 140, text: r => staffName(r.ownerId) },
    { key: 'account', label: 'Ricorsa account', width: 170, sortable: true, text: r => r.account ? `${PLAN_LABEL[r.account.plan] || r.account.plan}${r.account.subscriptionStatus ? ' · ' + r.account.subscriptionStatus.toLowerCase() : ''}` : (r.ricorsaUserId ? 'linked' : 'not linked'), sortValue: r => r.account ? r.account.lastSeenAt : -1, render: r => r.account ? `${planPill(r.account.plan)} <span class="muted small">${esc(r.account.subscriptionStatus ? r.account.subscriptionStatus.toLowerCase() : 'no subscription')} · seen ${esc(relTime(r.account.lastSeenAt))}</span>` : `<span class="muted small">${r.ricorsaUserId ? 'linked' : 'not linked'}</span>` },
    { key: 'trial', label: 'Trial', width: 130, text: r => r.trial ? `${PLAN_LABEL[r.trial.plan]} ends ${fmtDate(r.trial.endsAt)}` : '', sortValue: r => r.trial ? r.trial.endsAt : -1, render: r => r.trial ? `${planPill(r.trial.plan)} <span class="small muted">ends ${esc(inDays(r.trial.endsAt))}</span>` : '' },
    { key: 'license', label: 'Licence', width: 130, text: r => r.license ? `${PLAN_LABEL[r.license.plan]}${r.license.endsAt ? ' until ' + fmtDate(r.license.endsAt) : ' (open)'}` : '', sortValue: r => r.license ? (r.license.endsAt || 9e15) : -1, render: r => r.license ? `${planPill(r.license.plan)} <span class="small muted">${r.license.endsAt ? 'until ' + esc(fmtDate(r.license.endsAt)) : 'open-ended'}</span>` : '' },
    { key: 'openCents', label: 'Balance due', type: 'money', width: 110, render: r => r.openCents ? `<span class="money ${r.openCents ? 'bad' : ''}">${money(r.openCents, r.currency)}</span>` : '<span class="muted">–</span>' },
    { key: 'tags', label: 'Tags', type: 'tags', editable: true, width: 180 },
    { key: 'source', label: 'Source', editable: true, width: 110, hidden: true },
    { key: 'phone', label: 'Phone', type: 'tel', editable: true, width: 130, hidden: true },
    { key: 'website', label: 'Website', type: 'link', editable: true, width: 150, hidden: true },
    { key: 'contacts', label: 'Contacts', type: 'number', width: 90, hidden: true },
    { key: 'lastContactAt', label: 'Last contact', type: 'date', width: 120, text: r => r.lastContactAt ? relTime(r.lastContactAt) : '' },
    { key: 'createdAt', label: 'Added', type: 'date', width: 110 },
    { key: 'updatedAt', label: 'Updated', type: 'datetime', width: 140, hidden: true },
  ];
  let grid;
  grid = createGrid({
    key: 'customers', columns, rows: data.customers, rowId: r => r.id, selectable: can('manager'), noun: 'customers', csvName: 'customers', defaultSort: { key: 'updatedAt', dir: 'desc' },
    searchPlaceholder: 'Search customers', searchExtra: r => (r.notes || '') + ' ' + (r.tags || []).join(' '),
    filters: [{ key: 'status', options: STATUS_OPTS, test: (r, v) => r.status === v }],
    addLabel: can('manager') ? 'Add customer' : null, onAdd: () => customerModal(null, c => { grid.add(c); go('#/customers/' + c.id); }),
    toolbarHtml: can('manager') ? `<button type="button" class="btn sm" data-import>${icon('upload', 14)}<span>Import</span></button>` : '',
    emptyTitle: 'No customers yet', emptyText: 'Add one, import a CSV, or add people from the Ricorsa sign-ups.',
    onRowClick: r => go('#/customers/' + r.id),
    onEdit: async (r, k, v) => { const body = {}; body[k] = k === 'ownerId' && v === '' ? null : v; const res = await api('/api/customers/' + r.id, { method: 'PATCH', body }); invalidate('customers', 'dashboard'); return res.customer; },
    actions: r => [{ key: 'open', label: 'Open', icon: 'external' }, { key: 'edit', label: 'Edit details', icon: 'edit' }, { key: 'invoice', label: 'New invoice', icon: 'invoice' }, { key: 'trial', label: 'Start a trial', icon: 'clock' }, { key: 'email', label: 'Send an email', icon: 'mail' }, '-', { key: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !can('owner') }],
    onAction: async (r, k) => {
      if (k === 'open') go('#/customers/' + r.id); else if (k === 'edit') customerModal(r, c => grid.update(c.id, c));
      else if (k === 'invoice') go('#/invoices/new?customer=' + r.id); else if (k === 'trial') trialModal(r, () => { invalidate('customers'); renderCustomers(); });
      else if (k === 'email') commModal(r, { kind: 'email' }, () => { invalidate('customers'); });
      else if (k === 'delete') { if (await confirmModal(`Delete ${r.name}?`, 'Contacts, licences, trials, invoices and the communication history of this customer are deleted with it. This cannot be undone.', { okLabel: 'Delete', danger: true })) { try { await api('/api/customers/' + r.id, { method: 'DELETE' }); grid.remove([r.id]); invalidate('customers', 'dashboard'); toast('Deleted'); } catch (e) { apiToast(e); } } }
    },
    bulk: [{ key: 'status', label: 'Set status', icon: 'tag' }, { key: 'owner', label: 'Assign owner', icon: 'users' }, { key: 'plan', label: 'Set plan', icon: 'sparkles' }, { key: 'tags', label: 'Add tags', icon: 'tag' }, { key: 'export', label: 'Export selected', icon: 'download' }, { key: 'delete', label: 'Delete', icon: 'trash', danger: true }],
    onBulk: async (k, ids, rows) => {
      const apply = async (set) => { try { const r = await api('/api/customers/bulk', { method: 'PATCH', body: { ids, set } }); r.customers.forEach(c => grid.update(c.id, c)); invalidate('customers', 'dashboard'); grid.clearSelection(); toast(`Updated ${ids.length}`); } catch (e) { apiToast(e); } };
      if (k === 'status') pickModal('Set status', STATUS_OPTS, v => apply({ status: v }));
      else if (k === 'owner') pickModal('Assign owner', ownerOpts(), v => apply({ ownerId: v || null }));
      else if (k === 'plan') pickModal('Set plan', PLAN_OPTS, v => apply({ plan: v }));
      else if (k === 'tags') textModal('Add tags', 'Comma separated', v => apply({ addTags: v.split(',').map(s => s.trim()).filter(Boolean) }));
      else if (k === 'export') download(`customers-selected-${isoDay(Date.now())}.csv`, csvOf(rows, columns.map(c => ({ label: c.label, text: r => c.text ? c.text(r) : (c.type === 'money' ? money(r[c.key]) : c.type === 'date' ? fmtDate(r[c.key]) : c.type === 'tags' ? (r[c.key] || []).join('; ') : String(r[c.key] ?? '')) }))));
      else if (k === 'delete') { if (!can('owner')) { toast('Only an owner can delete customers', 'bad'); return; } if (await confirmModal(`Delete ${ids.length} customer${ids.length === 1 ? '' : 's'}?`, 'Everything attached to them is deleted too. This cannot be undone.', { okLabel: 'Delete', danger: true })) { try { await api('/api/customers/bulk', { method: 'DELETE', body: { ids } }); grid.remove(ids); invalidate('customers', 'dashboard'); toast('Deleted'); } catch (e) { apiToast(e); } } }
    },
    footExtra: rows => `${money(rows.reduce((a, r) => a + (r.mrrCents || 0), 0))} monthly`,
  });
  page('Customers', `${data.customers.length} record${data.customers.length === 1 ? '' : 's'}`, grid.el);
  $('[data-import]', grid.el)?.addEventListener('click', () => importModal(() => renderCustomers()));
}
function pickModal(title, options, onPick) {
  openModal(`<h2>${esc(title)}</h2><div class="field"><select id="pk">${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="pkOk">Apply</button></div>`, { onMount: () => $('#pkOk').addEventListener('click', () => { const v = $('#pk').value; closeModal(); onPick(v); }) });
}
function textModal(title, placeholder, onOk, initial = '') {
  openModal(`<h2>${esc(title)}</h2><div class="field"><input type="text" id="tx" placeholder="${esc(placeholder)}" value="${esc(initial)}"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="txOk">Apply</button></div>`, { onMount: ov => { const ok = () => { const v = $('#tx').value.trim(); if (!v) return; closeModal(); onOk(v); }; $('#txOk').addEventListener('click', ok); $('#tx').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); }); } });
}

// ---------- Shared modals: contacts, trials, licences, communication, plan grants ----------
async function customerPicker(preset) {
  if (preset) return { value: preset.id, label: preset.name };
  const data = await load('customers', '/api/customers');
  return { options: data.customers.map(c => ({ value: c.id, label: c.company && c.company !== c.name ? `${c.name} (${c.company})` : c.name })) };
}
function contactModal(customerId, existing, onDone) {
  const fields = [{ key: 'name', label: 'Name', required: true }, { key: 'title', label: 'Title' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'primary', label: 'Primary contact', type: 'check' }, { key: 'notes', label: 'Notes', type: 'textarea', span: true }];
  openModal(`<h2>${existing ? 'Edit contact' : 'Add a contact'}</h2>${formHtml(fields, existing || {})}<div class="modal-actions">${existing ? `<button type="button" class="btn danger left" id="ctDel">Remove</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="ctOk">${existing ? 'Save' : 'Add contact'}</button></div>`, { onMount: ov => {
    $('#ctOk').addEventListener('click', async () => { const f = readForm(ov, fields); if (!f.name) { toast('A name is needed', 'bad'); return; } for (const k of ['email', 'phone', 'title']) if (f[k] === '') f[k] = null; try { if (existing) await api('/api/contacts/' + existing.id, { method: 'PATCH', body: f }); else await api('/api/contacts', { body: { customerId, ...f } }); closeModal(); toast(existing ? 'Saved' : 'Contact added'); onDone(); } catch (e) { apiToast(e); } });
    $('#ctDel')?.addEventListener('click', async () => { closeModal(); if (await confirmModal(`Remove ${existing.name}?`, 'The contact is removed from this customer.', { okLabel: 'Remove', danger: true })) { try { await api('/api/contacts/' + existing.id, { method: 'DELETE' }); toast('Removed'); onDone(); } catch (e) { apiToast(e); } } });
  } });
}
async function trialModal(customer, onDone) {
  const pick = await customerPicker(customer); const t = state.settings.trial;
  const fields = [customer ? null : { key: 'customerId', label: 'Customer', type: 'select', options: pick.options, span: true }, { key: 'plan', label: 'Plan', type: 'select', options: [{ value: 'pro', label: 'Pro' }, { value: 'team', label: 'Team' }] }, { key: 'days', label: 'Length (days)', type: 'number', min: 1, max: 365 }, { key: 'apply', label: 'Apply to the linked Ricorsa account now', type: 'check', span: true, hint: 'The account gets the plan until the trial ends, then returns to Free unless converted.' }, { key: 'notes', label: 'Notes', type: 'textarea', span: true }].filter(Boolean);
  openModal(`<h2>${icon('clock', 20)}Start a trial</h2><p class="sub">${customer ? esc(customer.name) : 'Pick the customer'}: a ${PLAN_LABEL[t.plan]} trial of ${t.days} days by default.</p>${formHtml(fields, { plan: t.plan, days: t.days, apply: true })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="trOk">Start trial</button></div>`, { onMount: ov => $('#trOk').addEventListener('click', async () => {
    const f = readForm(ov, fields); const body = { customerId: customer ? customer.id : f.customerId, plan: f.plan, days: f.days || t.days, notes: f.notes, apply: f.apply };
    try { const r = await api('/api/trials', { body }); closeModal(); invalidate('customers', 'trials', 'dashboard'); toast(r.sync && r.sync.applied ? `Trial started and applied: ${r.sync.applied}` : r.sync && r.sync.note ? `Trial started. ${r.sync.note}` : 'Trial started'); if (onDone) onDone(r.trial); } catch (e) { apiToast(e); }
  }) });
}
async function licenseModal(customer, onDone) {
  const pick = await customerPicker(customer);
  const fields = [customer ? null : { key: 'customerId', label: 'Customer', type: 'select', options: pick.options, span: true }, { key: 'plan', label: 'Plan', type: 'select', options: [{ value: 'pro', label: 'Pro' }, { value: 'team', label: 'Team' }] }, { key: 'seats', label: 'Seats', type: 'number', min: 1 }, { key: 'startsAt', label: 'Starts', type: 'date' }, { key: 'endsAt', label: 'Ends (blank for open-ended)', type: 'date' }, { key: 'autoRenew', label: 'Auto-renew', type: 'check' }, { key: 'apply', label: 'Apply to the linked Ricorsa account now', type: 'check' }, { key: 'notes', label: 'Notes', type: 'textarea', span: true }].filter(Boolean);
  openModal(`<h2>${icon('key', 20)}Issue a licence</h2><p class="sub">${customer ? esc(customer.name) + ': ' : ''}a licence key is generated and the plan is granted for the period.</p>${formHtml(fields, { plan: 'pro', seats: 1, startsAt: Date.now(), apply: true, autoRenew: false })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="liOk">Issue licence</button></div>`, { onMount: ov => $('#liOk').addEventListener('click', async () => {
    const f = readForm(ov, fields); const body = { customerId: customer ? customer.id : f.customerId, plan: f.plan, seats: f.seats || 1, startsAt: f.startsAt, endsAt: f.endsAt, autoRenew: f.autoRenew, notes: f.notes, apply: f.apply };
    try { const r = await api('/api/licenses', { body }); closeModal(); invalidate('customers', 'licenses', 'dashboard'); toast(r.sync && r.sync.applied ? `Licence issued and applied: ${r.sync.applied}` : 'Licence issued'); if (onDone) onDone(r.license); } catch (e) { apiToast(e); }
  }) });
}
async function commModal(customer, preset = {}, onDone, contacts = []) {
  const pick = await customerPicker(customer);
  const canSend = state.integrations.email;
  const fields = [customer ? null : { key: 'customerId', label: 'Customer', type: 'select', options: pick.options, span: true },
    { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'email', label: 'Email' }, { value: 'call', label: 'Call' }, { value: 'meeting', label: 'Meeting' }, { value: 'note', label: 'Note' }, { value: 'sms', label: 'Text message' }] },
    { key: 'direction', label: 'Direction', type: 'select', options: [{ value: 'out', label: 'Outbound (we reached out)' }, { value: 'in', label: 'Inbound (they reached us)' }] },
    { key: 'toEmail', label: 'To (email)', type: 'email', placeholder: customer && customer.email ? customer.email : '' }, { key: 'at', label: 'When', type: 'date' },
    { key: 'subject', label: 'Subject', span: true }, { key: 'body', label: 'Message or notes', type: 'textarea', span: true },
    { key: 'send', label: canSend ? 'Send this email now through the email service' : 'Send now (email sending is not set up yet; the message is logged only)', type: 'check', span: true }].filter(Boolean);
  const values = { kind: preset.kind || 'note', direction: 'out', at: Date.now(), send: !!(preset.kind === 'email' && canSend), toEmail: (contacts.find(c => c.primary) || {}).email || (customer && customer.email) || '', ...preset };
  openModal(`<h2>${icon('mail', 20)}${preset.kind === 'email' ? 'Email the customer' : 'Log a communication'}</h2><p class="sub">${customer ? esc(customer.name) + '. ' : ''}Everything here becomes part of the customer's history.</p>${formHtml(fields, values)}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="cmOk">Save</button></div>`, { wide: true, onMount: ov => {
    const kindSel = ov.querySelector('[name=kind]'), sendCb = ov.querySelector('[name=send]'), okBtn = $('#cmOk');
    const sync = () => { const isEmail = kindSel.value === 'email'; sendCb.disabled = !isEmail || !canSend; if (!isEmail) sendCb.checked = false; okBtn.textContent = isEmail && sendCb.checked ? 'Send email' : 'Save'; };
    kindSel.addEventListener('change', sync); sendCb.addEventListener('change', sync); sync();
    okBtn.addEventListener('click', async () => {
      const f = readForm(ov, fields); const body = { customerId: customer ? customer.id : f.customerId, kind: f.kind, direction: f.direction, subject: f.subject, body: f.body, toEmail: f.toEmail || null, at: f.at || Date.now(), send: f.kind === 'email' && f.send };
      if (body.send && !body.subject) { toast('Give the email a subject', 'bad'); return; }
      okBtn.disabled = true;
      try { await api('/api/communications', { body }); closeModal(); invalidate('customers', 'communications', 'dashboard'); toast(body.send ? 'Email sent' : 'Logged'); if (onDone) onDone(); } catch (e) { okBtn.disabled = false; apiToast(e); }
    });
  } });
}
function grantModal(account, onDone) {
  const fields = [{ key: 'plan', label: 'Plan', type: 'select', options: [{ value: 'free', label: 'Free (remove any grant)' }, { value: 'pro', label: 'Pro' }, { value: 'team', label: 'Team' }] }, { key: 'kind', label: 'As', type: 'select', options: [{ value: 'license', label: 'Licence' }, { value: 'trial', label: 'Trial' }] }, { key: 'until', label: 'Until (blank for open-ended)', type: 'date', span: true }];
  openModal(`<h2>${icon('sparkles', 20)}Set the plan on this Ricorsa account</h2><p class="sub">${esc(account.email || account.id)} is on ${PLAN_LABEL[account.plan] || account.plan}${account.subscriptionStatus ? ' (' + esc(account.subscriptionStatus.toLowerCase()) + ')' : ''}. A plan set here applies immediately in the product. Accounts paying through PayPal keep their subscription.</p>${formHtml(fields, { plan: account.plan === 'free' ? 'pro' : account.plan, kind: account.subscriptionStatus === 'TRIAL' ? 'trial' : 'license', until: account.planRenewsAt || '' })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="grOk">Apply</button></div>`, { onMount: ov => $('#grOk').addEventListener('click', async () => {
    const f = readForm(ov, fields);
    try { const r = await api('/api/accounts/' + encodeURIComponent(account.id) + '/plan', { body: { plan: f.plan, kind: f.kind, until: f.until } }); closeModal(); invalidate('accounts', 'customers', 'dashboard'); toast('Plan applied'); if (onDone) onDone(r.account); } catch (e) { apiToast(e); }
  }) });
}

// ---------- Customer record ----------
async function renderCustomer(id, query = {}) {
  const d = await api('/api/customers/' + encodeURIComponent(id));
  const c = d.customer; const tab = query.tab || 'overview';
  const counts = { contacts: d.contacts.length, licenses: d.licenses.length, trials: d.trials.length, invoices: d.invoices.length, communications: d.communications.length, activity: d.activity.length };
  const tabs = [['overview', 'Overview'], ['account', 'Ricorsa account'], ['contacts', 'Contacts'], ['licenses', 'Licences'], ['trials', 'Trials'], ['invoices', 'Invoices'], ['communications', 'Communication'], ['activity', 'Activity']];
  const body = document.createElement('div'); body.className = 'content flush';
  body.innerHTML = `<div class="content" style="padding:0;overflow:auto">
    <div class="rec-head"><div class="title"><h1>${esc(c.name)} ${statusPill(c.status)} ${planPill(c.plan)}</h1><div class="meta">${c.company && c.company !== c.name ? `<span>${esc(c.company)}</span>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.phone ? `<span>${esc(c.phone)}</span>` : ''}<span>Owner: ${esc(staffName(c.ownerId) || 'unassigned')}</span><span>Added ${esc(fmtDate(c.createdAt))}</span>${c.mrrCents ? `<span>${money(c.mrrCents, c.currency)} a month</span>` : ''}</div></div>
      <div class="actions">${can('manager') ? `<button type="button" class="btn sm" data-a="email">${icon('mail', 14)}Email</button><button type="button" class="btn sm" data-a="log">${icon('note', 14)}Log</button><button type="button" class="btn sm" data-a="invoice">${icon('invoice', 14)}Invoice</button><button type="button" class="btn sm" data-a="trial">${icon('clock', 14)}Trial</button><button type="button" class="btn sm" data-a="license">${icon('key', 14)}Licence</button><button type="button" class="btn sm" data-a="edit">${icon('edit', 14)}Edit</button>` : ''}<button type="button" class="icon-btn" data-a="more" aria-label="More">${icon('more', 18)}</button></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}${counts[k] ? `<span class="n">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="panel" data-panel></div></div>`;
  page(c.name, '', body, { crumbs: `<a href="#/customers">Customers</a>${icon('chevronRight', 14)}<span>${esc(c.name)}</span>` });
  const reload = (t) => go(`#/customers/${encodeURIComponent(id)}?tab=${t || tab}`);
  $$('[data-tab]', body).forEach(b => b.addEventListener('click', () => go(`#/customers/${encodeURIComponent(id)}?tab=${b.dataset.tab}`)));
  $$('[data-a]', body).forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.a;
    if (k === 'email') commModal(c, { kind: 'email' }, () => reload('communications'), d.contacts);
    else if (k === 'log') commModal(c, { kind: 'note' }, () => reload('communications'), d.contacts);
    else if (k === 'invoice') go('#/invoices/new?customer=' + c.id);
    else if (k === 'trial') trialModal(c, () => reload('trials'));
    else if (k === 'license') licenseModal(c, () => reload('licenses'));
    else if (k === 'edit') customerModal(c, () => reload());
    else if (k === 'more') actionMenu(b, [{ key: 'contact', label: 'Add contact', icon: 'userPlus', disabled: !can('manager') }, { key: 'copy', label: 'Copy record id', icon: 'copy' }, '-', { key: 'delete', label: 'Delete customer', icon: 'trash', danger: true, disabled: !can('owner') }], async a => {
      if (a === 'contact') contactModal(c.id, null, () => reload('contacts'));
      else if (a === 'copy') { try { await navigator.clipboard.writeText(c.id); toast('Copied'); } catch { toast(c.id); } }
      else if (a === 'delete' && await confirmModal(`Delete ${c.name}?`, 'Everything attached to this customer is deleted with it. This cannot be undone.', { okLabel: 'Delete', danger: true })) { try { await api('/api/customers/' + c.id, { method: 'DELETE' }); invalidate('customers', 'dashboard'); toast('Deleted'); go('#/customers'); } catch (e) { apiToast(e); } }
    });
  }));
  const panel = $('[data-panel]', body);
  const edit = can('manager');
  const inlineSave = async (patch) => { try { await api('/api/customers/' + c.id, { method: 'PATCH', body: patch }); invalidate('customers', 'dashboard'); toast('Saved'); } catch (e) { apiToast(e); } };

  if (tab === 'overview') {
    const addr = c.address || {};
    panel.innerHTML = `<div class="two-col"><div class="card"><h3>Details</h3><div class="sub">Double-click a value to change it; Enter saves.</div><dl class="kv">
      ${[['Name', 'name', c.name], ['Company', 'company', c.company], ['Email', 'email', c.email], ['Phone', 'phone', c.phone], ['Website', 'website', c.website], ['Source', 'source', c.source], ['Kind', 'kind', c.kind]].map(([l, k, v]) => `<dt>${l}</dt><dd ${edit ? `class="editable" data-k="${k}"` : ''}>${v ? esc(v) : '<span class="muted">–</span>'}</dd>`).join('')}
      <dt>Status</dt><dd>${edit ? `<select data-sel="status" class="input" style="height:30px;width:auto">${STATUS_OPTS.map(o => `<option value="${o.value}"${o.value === c.status ? ' selected' : ''}>${o.label}</option>`).join('')}</select>` : statusPill(c.status)}</dd>
      <dt>Plan</dt><dd>${edit ? `<select data-sel="plan" class="input" style="height:30px;width:auto">${PLAN_OPTS.map(o => `<option value="${o.value}"${o.value === c.plan ? ' selected' : ''}>${o.label}</option>`).join('')}</select>` : planPill(c.plan)}</dd>
      <dt>Owner</dt><dd>${edit ? `<select data-sel="ownerId" class="input" style="height:30px;width:auto">${ownerOpts().map(o => `<option value="${o.value}"${o.value === (c.ownerId || '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>` : esc(staffName(c.ownerId) || '–')}</dd>
      <dt>Monthly value</dt><dd ${edit ? 'class="editable" data-k="mrrCents" data-money="1"' : ''}>${money(c.mrrCents, c.currency)}</dd>
      <dt>Address</dt><dd ${edit ? 'class="editable" data-k="address"' : ''}>${[addr.line1, addr.line2, [addr.city, addr.region, addr.postal].filter(Boolean).join(', '), addr.country].filter(Boolean).map(esc).join('<br>') || '<span class="muted">–</span>'}</dd>
      <dt>Tags</dt><dd><div class="tags-edit" data-tags>${(c.tags || []).map(t => `<span class="tag">${esc(t)}${edit ? `<button type="button" data-rmtag="${esc(t)}" aria-label="Remove tag">${icon('x', 10)}</button>` : ''}</span>`).join('')}${edit ? '<input type="text" placeholder="Add tag" data-newtag>' : ''}</div></dd>
      <dt>Ricorsa account</dt><dd>${c.ricorsaUserId ? `<a href="#/customers/${esc(c.id)}?tab=account">${esc(d.account ? d.account.email || c.ricorsaUserId : c.ricorsaUserId)}</a>` : '<span class="muted">not linked</span>'}</dd>
      <dt>Last contact</dt><dd>${c.lastContactAt ? esc(fmtDateTime(c.lastContactAt)) : '<span class="muted">never</span>'}</dd></dl></div>
      <div><div class="card"><h3>Notes</h3><div class="sub">Saved as you leave the box.</div><textarea class="input" style="height:180px;padding:9px 11px;resize:vertical" data-notes ${edit ? '' : 'readonly'}>${esc(c.notes || '')}</textarea></div>
      <div class="card" style="margin-top:16px"><h3>At a glance</h3><dl class="kv" style="margin-top:8px"><dt>Contacts</dt><dd>${d.contacts.length}</dd><dt>Active licence</dt><dd>${c.license ? `${PLAN_LABEL[c.license.plan]}${c.license.endsAt ? ' until ' + esc(fmtDate(c.license.endsAt)) : ' (open-ended)'}` : '<span class="muted">none</span>'}</dd><dt>Trial</dt><dd>${c.trial ? `${PLAN_LABEL[c.trial.plan]}, ends ${esc(fmtDate(c.trial.endsAt))} (${esc(inDays(c.trial.endsAt))})` : '<span class="muted">none</span>'}</dd><dt>Balance due</dt><dd>${c.openCents ? `<b>${money(c.openCents, c.currency)}</b>` : '<span class="muted">nothing outstanding</span>'}</dd><dt>Invoices</dt><dd>${d.invoices.length}</dd></dl></div></div></div>`;
    if (edit) {
      $$('dd.editable', panel).forEach(dd => dd.addEventListener('dblclick', () => {
        const k = dd.dataset.k;
        if (k === 'address') { const a = c.address || {}; const fields = [{ key: 'line1', label: 'Line 1', span: true }, { key: 'line2', label: 'Line 2', span: true }, { key: 'city', label: 'City' }, { key: 'region', label: 'State or region' }, { key: 'postal', label: 'Postal code' }, { key: 'country', label: 'Country' }]; openModal(`<h2>Address</h2>${formHtml(fields, a)}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="adOk">Save</button></div>`, { onMount: ov => $('#adOk').addEventListener('click', async () => { const f = readForm(ov, fields); closeModal(); await inlineSave({ address: f }); reload(); }) }); return; }
        if (k === 'kind') { pickModal('Kind', [{ value: 'company', label: 'Company' }, { value: 'person', label: 'Person' }], async v => { await inlineSave({ kind: v }); reload(); }); return; }
        const cur = dd.dataset.money ? ((c.mrrCents || 0) / 100).toFixed(2) : (c[k] || '');
        dd.innerHTML = `<input type="${dd.dataset.money ? 'number' : 'text'}" class="input" style="height:30px" value="${esc(cur)}"${dd.dataset.money ? ' step="0.01"' : ''}>`;
        const inp = dd.firstElementChild; inp.focus(); inp.select();
        let done = false;
        const finish = async (commit) => { if (done) return; done = true; const v = inp.value.trim(); if (!commit || v === String(cur)) { reload(); return; } const patch = {}; patch[k] = dd.dataset.money ? Math.round(parseFloat(v || '0') * 100) : (v || null); if (k === 'name' && !v) { toast('A name is needed', 'bad'); reload(); return; } await inlineSave(patch); reload(); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }); inp.addEventListener('blur', () => finish(true));
      }));
      $$('[data-sel]', panel).forEach(s => s.addEventListener('change', async () => { const patch = {}; patch[s.dataset.sel] = s.value || null; await inlineSave(patch); invalidate('customers'); }));
      const notes = $('[data-notes]', panel); let notesWas = c.notes || '';
      notes.addEventListener('blur', async () => { if (notes.value !== notesWas) { notesWas = notes.value; await inlineSave({ notes: notes.value }); } });
      $$('[data-rmtag]', panel).forEach(b => b.addEventListener('click', async () => { await inlineSave({ tags: (c.tags || []).filter(t => t !== b.dataset.rmtag) }); reload(); }));
      $('[data-newtag]', panel)?.addEventListener('keydown', async e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (!v) return; e.preventDefault(); await inlineSave({ tags: Array.from(new Set([...(c.tags || []), v])) }); reload(); } });
    }
  }
  if (tab === 'account') {
    const a = d.account;
    if (!c.ricorsaUserId) panel.innerHTML = `<div class="card"><h3>No Ricorsa account linked</h3><div class="sub">Link the account this customer uses on ricorsa.com to see their plan, usage and subscription here, and to grant plans, trials and licences.</div>${can('manager') ? `<div class="field" style="max-width:420px"><label>Account email on ricorsa.com</label><div style="display:flex;gap:8px"><input type="email" id="lkEmail" value="${esc(c.email || '')}" placeholder="name@company.com"><button type="button" class="btn primary" id="lkOk">${icon('link', 14)}Link</button></div><span class="hint">Or find them under Ricorsa sign-ups and choose "Add as customer".</span></div>` : ''}</div>`;
    else if (!a) panel.innerHTML = `<div class="notice">${icon('alert', 16)}<div>The account ${esc(c.ricorsaUserId)} could not be read from the product right now.</div></div>`;
    else {
      const paying = ['ACTIVE', 'APPROVAL_PENDING'].includes(a.subscriptionStatus || '');
      panel.innerHTML = `<div class="two-col"><div class="card"><h3>${esc(a.email || a.id)}</h3><div class="sub">Live from ricorsa.com</div><dl class="kv">
        <dt>Plan</dt><dd>${planPill(a.plan)} ${a.subscriptionStatus ? `<span class="pill ${paying ? 'good' : a.subscriptionStatus === 'TRIAL' ? 'trial' : a.subscriptionStatus === 'LICENSED' ? 'accent' : 'warn'}">${esc(a.subscriptionStatus.toLowerCase())}</span>` : '<span class="muted small">no subscription</span>'}</dd>
        <dt>${a.subscriptionStatus === 'TRIAL' ? 'Trial ends' : a.subscriptionStatus === 'LICENSED' ? 'Licensed until' : 'Renews'}</dt><dd>${a.planRenewsAt ? esc(fmtDate(a.planRenewsAt)) + ` <span class="muted small">(${esc(inDays(a.planRenewsAt))})</span>` : '<span class="muted">–</span>'}</dd>
        <dt>PayPal</dt><dd>${a.paypalSubscriptionId ? `<span class="mono">${esc(a.paypalSubscriptionId)}</span>` : '<span class="muted">none</span>'}</dd>
        <dt>Signed up</dt><dd>${esc(fmtDate(a.createdAt))}</dd><dt>Last seen</dt><dd>${esc(fmtDateTime(a.lastSeenAt))} <span class="muted small">(${esc(relTime(a.lastSeenAt))})</span></dd>
        <dt>Today</dt><dd>${a.usage.today.questions} questions · ${a.usage.today.research} research</dd>
        <dt>This month</dt><dd>${a.usage.month.questions} questions · ${a.usage.month.research} research · ${a.usage.month.searches} searches · about ${money(Math.round(a.usage.month.costMicros / 10000))} in model cost</dd>
        <dt>Library</dt><dd>${a.counts.threads} threads · ${a.counts.builds} builds · ${a.counts.spaces} spaces</dd></dl>
        ${can('manager') ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn sm primary" id="acGrant">${icon('sparkles', 14)}Set plan, trial or licence</button><button type="button" class="btn sm" id="acUnlink">${icon('unlink', 14)}Unlink</button></div>` : ''}</div>
        <div class="card"><h3>Subscriptions</h3><div class="sub">From PayPal, as the product recorded them</div>${a.subscriptions.length ? `<div class="list">${a.subscriptions.map(s => `<div class="li"><div class="grow"><b>${esc(PLAN_LABEL[s.plan] || s.plan)}</b> <span class="pill ${['ACTIVE', 'APPROVAL_PENDING'].includes(s.status) ? 'good' : 'warn'}">${esc(s.status.toLowerCase())}</span><div class="sub">${esc(s.id)} · started ${esc(fmtDate(s.startedAt))}${s.nextBillingAt ? ' · next ' + esc(fmtDate(s.nextBillingAt)) : ''}${s.cancelledAt ? ' · cancelled ' + esc(fmtDate(s.cancelledAt)) : ''}</div></div></div>`).join('')}</div>` : '<div class="empty small">No PayPal subscriptions.</div>'}</div></div>`;
      $('#acGrant')?.addEventListener('click', () => grantModal(a, () => reload('account')));
      $('#acUnlink')?.addEventListener('click', async () => { if (await confirmModal('Unlink this account?', 'The customer record stays; it just stops showing this Ricorsa account.', { okLabel: 'Unlink' })) { try { await api('/api/customers/' + c.id + '/link', { method: 'DELETE' }); invalidate('customers'); reload('account'); } catch (e) { apiToast(e); } } });
    }
    $('#lkOk')?.addEventListener('click', async () => { const email = $('#lkEmail').value.trim(); if (!email) return; try { await api('/api/customers/' + c.id + '/link', { body: { email } }); invalidate('customers', 'accounts'); toast('Linked'); reload('account'); } catch (e) { apiToast(e); } });
  }
  if (tab === 'contacts') {
    panel.innerHTML = `${can('manager') ? `<div style="margin-bottom:12px"><button type="button" class="btn sm primary" id="ctAdd">${icon('userPlus', 14)}Add contact</button></div>` : ''}${d.contacts.length ? `<div class="list">${d.contacts.map(ct => `<div class="li"><span class="avatar-sm" style="background:${colorFor(ct.name)};color:#fff">${esc(initials(ct.name))}</span><div class="grow"><b>${esc(ct.name)}</b>${ct.primary ? ' <span class="pill accent">primary</span>' : ''}${ct.title ? ` <span class="muted">· ${esc(ct.title)}</span>` : ''}<div class="sub">${ct.email ? `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>` : ''}${ct.phone ? ` · ${esc(ct.phone)}` : ''}${ct.notes ? ` · ${esc(ct.notes)}` : ''}</div></div>${can('manager') ? `<button type="button" class="btn xs" data-ct="${esc(ct.id)}">Edit</button><button type="button" class="btn xs" data-ctmail="${esc(ct.id)}">Email</button>` : ''}</div>`).join('')}</div>` : '<div class="empty"><b>No contacts</b>People at this customer you talk to.</div>'}`;
    $('#ctAdd')?.addEventListener('click', () => contactModal(c.id, null, () => reload('contacts')));
    $$('[data-ct]', panel).forEach(b => b.addEventListener('click', () => contactModal(c.id, d.contacts.find(x => x.id === b.dataset.ct), () => reload('contacts'))));
    $$('[data-ctmail]', panel).forEach(b => b.addEventListener('click', () => { const ct = d.contacts.find(x => x.id === b.dataset.ctmail); commModal(c, { kind: 'email', toEmail: ct.email || '', contactId: ct.id }, () => reload('communications'), d.contacts); }));
  }
  if (tab === 'licenses') {
    panel.innerHTML = `${can('manager') ? `<div style="margin-bottom:12px"><button type="button" class="btn sm primary" id="liAdd">${icon('key', 14)}Issue a licence</button></div>` : ''}${d.licenses.length ? `<div class="list">${d.licenses.map(l => `<div class="li"><div class="grow"><b class="mono">${esc(l.key)}</b> ${planPill(l.plan)} ${pill(l.status, l.status)}<div class="sub">${l.seats} seat${l.seats === 1 ? '' : 's'} · from ${esc(fmtDate(l.startsAt))}${l.endsAt ? ` until ${esc(fmtDate(l.endsAt))} (${esc(inDays(l.endsAt))})` : ' · open-ended'}${l.autoRenew ? ' · auto-renews' : ''}${l.notes ? ' · ' + esc(l.notes) : ''}</div></div>${can('manager') ? `<button type="button" class="icon-btn sm" data-li="${esc(l.id)}" aria-label="Actions">${icon('more', 16)}</button>` : ''}</div>`).join('')}</div>` : '<div class="empty"><b>No licences</b>A licence grants a plan on the linked Ricorsa account for a period.</div>'}`;
    $('#liAdd')?.addEventListener('click', () => licenseModal(c, () => reload('licenses')));
    $$('[data-li]', panel).forEach(b => b.addEventListener('click', () => licenseActions(b, d.licenses.find(x => x.id === b.dataset.li), () => reload('licenses'))));
  }
  if (tab === 'trials') {
    panel.innerHTML = `${can('manager') ? `<div style="margin-bottom:12px"><button type="button" class="btn sm primary" id="trAdd">${icon('clock', 14)}Start a trial</button></div>` : ''}${d.trials.length ? `<div class="list">${d.trials.map(t => `<div class="li"><div class="grow"><b>${esc(PLAN_LABEL[t.plan])} trial</b> ${pill(t.status, t.status)}<div class="sub">${esc(fmtDate(t.startedAt))} to ${esc(fmtDate(t.endsAt))} (${esc(inDays(t.endsAt))})${t.convertedAt ? ' · converted ' + esc(fmtDate(t.convertedAt)) : ''}${t.notes ? ' · ' + esc(t.notes) : ''}</div></div>${can('manager') ? `<button type="button" class="icon-btn sm" data-tr="${esc(t.id)}" aria-label="Actions">${icon('more', 16)}</button>` : ''}</div>`).join('')}</div>` : '<div class="empty"><b>No trials</b>Start one to give the linked account a paid plan for a while.</div>'}`;
    $('#trAdd')?.addEventListener('click', () => trialModal(c, () => reload('trials')));
    $$('[data-tr]', panel).forEach(b => b.addEventListener('click', () => trialActions(b, d.trials.find(x => x.id === b.dataset.tr), () => reload('trials'))));
  }
  if (tab === 'invoices') {
    panel.innerHTML = `${can('manager') ? `<div style="margin-bottom:12px"><a class="btn sm primary" href="#/invoices/new?customer=${esc(c.id)}">${icon('invoice', 14)}New invoice</a></div>` : ''}${d.invoices.length ? `<div class="list">${d.invoices.map(i => `<div class="li"><div class="grow"><a href="#/invoices/${esc(i.id)}"><b>${esc(i.number)}</b></a> ${pill(i.status, i.status)}<div class="sub">${money(i.totalCents, i.currency)}${i.paidCents ? ` · paid ${money(i.paidCents, i.currency)}` : ''} · issued ${esc(fmtDate(i.issuedAt))}${i.dueAt ? ' · due ' + esc(fmtDate(i.dueAt)) : ''}${i.paypalInvoiceId ? ' · PayPal' : ''}</div></div><a class="btn xs" href="#/invoices/${esc(i.id)}">Open</a></div>`).join('')}</div>` : '<div class="empty"><b>No invoices</b>Invoices you send appear here with their payment status.</div>'}`;
  }
  if (tab === 'communications') {
    panel.innerHTML = `${can('manager') ? `<div style="margin-bottom:12px;display:flex;gap:8px"><button type="button" class="btn sm primary" id="cmEmail">${icon('mail', 14)}Email</button><button type="button" class="btn sm" id="cmLog">${icon('note', 14)}Log a call, meeting or note</button></div>` : ''}${d.communications.length ? `<div class="timeline">${d.communications.map(m => timelineItem(m)).join('')}</div>` : '<div class="empty"><b>Nothing logged yet</b>Emails sent from here, calls, meetings and notes build the history.</div>'}`;
    $('#cmEmail')?.addEventListener('click', () => commModal(c, { kind: 'email' }, () => reload('communications'), d.contacts));
    $('#cmLog')?.addEventListener('click', () => commModal(c, { kind: 'note' }, () => reload('communications'), d.contacts));
  }
  if (tab === 'activity') {
    panel.innerHTML = d.activity.length ? `<div class="feed">${d.activity.map(a => `<div class="item"><span class="when" title="${esc(fmtDateTime(a.at))}">${esc(relTime(a.at))}</span><span>${esc(a.summary)}<span class="who"> · ${esc((a.actorEmail || 'system').split('@')[0])}</span></span></div>`).join('')}</div>` : '<div class="empty">No activity recorded for this customer yet.</div>';
  }
}
function timelineItem(m) {
  const ic = { email: 'mail', call: 'phone', meeting: 'calendar', note: 'note', sms: 'phone' }[m.kind] || 'note';
  return `<div class="tl-item"><span class="ic ${esc(m.kind)}">${icon(ic, 15)}</span><div class="body"><div class="h"><b>${esc(m.subject || (m.kind === 'note' ? 'Note' : m.kind[0].toUpperCase() + m.kind.slice(1)))}</b>${m.kind === 'email' ? `<span class="pill ${m.status === 'sent' || m.status === 'delivered' ? 'sent-ok' : m.status === 'failed' ? 'failed' : 'logged'}">${esc(m.status)}</span>` : ''}${m.direction === 'in' ? '<span class="pill">inbound</span>' : ''}${m.toEmail ? `<span class="muted small">to ${esc(m.toEmail)}</span>` : ''}${m.customer ? `<a class="small" href="#/customers/${esc(m.customerId)}">${esc(m.customer.name)}</a>` : ''}<span class="when">${esc(fmtDateTime(m.at))} · ${esc(staffName(m.byStaffId) || 'system')}</span></div>${m.body ? `<div class="txt">${esc(m.body)}</div>` : ''}${m.error ? `<div class="txt" style="color:var(--bad)">${esc(m.error)}</div>` : ''}</div></div>`;
}
function licenseActions(anchor, l, onDone) {
  actionMenu(anchor, [{ key: 'renew', label: 'Renew 12 months', icon: 'refresh' }, { key: 'edit', label: 'Change end date or notes', icon: 'edit' }, l.status === 'active' ? { key: 'suspend', label: 'Suspend', icon: 'pause' } : { key: 'reactivate', label: 'Reactivate', icon: 'play' }, { key: 'copy', label: 'Copy key', icon: 'copy' }, '-', { key: 'revoke', label: 'Revoke', icon: 'x', danger: true }, { key: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !can('owner') }], async k => {
    try {
      if (k === 'copy') { await navigator.clipboard.writeText(l.key); toast('Key copied'); return; }
      if (k === 'edit') { const fields = [{ key: 'endsAt', label: 'Ends (blank for open-ended)', type: 'date' }, { key: 'seats', label: 'Seats', type: 'number', min: 1 }, { key: 'autoRenew', label: 'Auto-renew', type: 'check' }, { key: 'notes', label: 'Notes', type: 'textarea', span: true }]; openModal(`<h2>Edit licence</h2><p class="sub mono">${esc(l.key)}</p>${formHtml(fields, l)}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="leOk">Save</button></div>`, { onMount: ov => $('#leOk').addEventListener('click', async () => { const f = readForm(ov, fields); try { await api('/api/licenses/' + l.id, { method: 'PATCH', body: { endsAt: f.endsAt, seats: f.seats || 1, autoRenew: f.autoRenew, notes: f.notes } }); closeModal(); invalidate('licenses', 'customers'); toast('Saved'); onDone(); } catch (e) { apiToast(e); } }) }); return; }
      if (k === 'delete') { if (!(await confirmModal('Delete this licence?', 'The record is removed and the linked account loses the plan unless another grant covers it.', { okLabel: 'Delete', danger: true }))) return; await api('/api/licenses/' + l.id, { method: 'DELETE' }); }
      else if (k === 'revoke') { if (!(await confirmModal('Revoke this licence?', 'The linked Ricorsa account returns to Free unless a trial or another licence covers it.', { okLabel: 'Revoke', danger: true }))) return; await api('/api/licenses/' + l.id, { method: 'PATCH', body: { action: 'revoke' } }); }
      else { const r = await api('/api/licenses/' + l.id, { method: 'PATCH', body: { action: k, months: 12 } }); if (r.sync && r.sync.applied) toast('Applied: ' + r.sync.applied); }
      invalidate('licenses', 'customers', 'dashboard'); toast('Done'); onDone();
    } catch (e) { apiToast(e); }
  });
}
function trialActions(anchor, t, onDone) {
  actionMenu(anchor, [{ key: 'extend', label: 'Extend by 7 days', icon: 'clock' }, { key: 'extend14', label: 'Extend by 14 days', icon: 'clock' }, { key: 'convert', label: 'Convert to a paid licence', icon: 'key' }, '-', { key: 'cancel', label: 'Cancel trial', icon: 'x', danger: true }, { key: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !can('owner') }], async k => {
    try {
      if (k === 'delete') { if (!(await confirmModal('Delete this trial?', 'The record is removed.', { okLabel: 'Delete', danger: true }))) return; await api('/api/trials/' + t.id, { method: 'DELETE' }); }
      else if (k === 'cancel') { if (!(await confirmModal('Cancel this trial?', 'The linked account returns to Free unless a licence covers it.', { okLabel: 'Cancel trial', danger: true }))) return; await api('/api/trials/' + t.id, { method: 'PATCH', body: { action: 'cancel' } }); }
      else if (k === 'convert') { const r = await api('/api/trials/' + t.id, { method: 'PATCH', body: { action: 'convert' } }); toast(r.license ? `Converted: licence ${r.license.key}` : 'Converted'); }
      else { const r = await api('/api/trials/' + t.id, { method: 'PATCH', body: { action: 'extend', days: k === 'extend14' ? 14 : 7 } }); toast('Extended to ' + fmtDate(r.trial.endsAt)); }
      invalidate('trials', 'customers', 'dashboard'); onDone();
    } catch (e) { apiToast(e); }
  });
}

// ---------- Ricorsa sign-ups ----------
async function renderSignups() {
  const data = await load('accounts', '/api/accounts?limit=500', true);
  const week = Date.now() - 7 * 86400e3, month = Date.now() - 30 * 86400e3;
  const columns = [
    { key: 'email', label: 'Email', primary: true, width: 240, render: r => `<span class="lnk">${esc(r.email || r.id)}</span>${r.name ? `<span class="cell-sub">${esc(r.name)}</span>` : ''}`, text: r => `${r.email || ''} ${r.name || ''}` },
    { key: 'plan', label: 'Plan', width: 90, render: r => planPill(r.plan), text: r => PLAN_LABEL[r.plan] || r.plan },
    { key: 'subscriptionStatus', label: 'Status', width: 120, text: r => r.subscriptionStatus ? r.subscriptionStatus.toLowerCase() : 'none', render: r => r.subscriptionStatus ? `<span class="pill ${['ACTIVE', 'APPROVAL_PENDING'].includes(r.subscriptionStatus) ? 'good' : r.subscriptionStatus === 'TRIAL' ? 'trial' : r.subscriptionStatus === 'LICENSED' ? 'accent' : 'warn'}">${esc(r.subscriptionStatus.toLowerCase())}</span>` : '<span class="muted small">none</span>' },
    { key: 'createdAt', label: 'Signed up', type: 'datetime', width: 150, text: r => `${fmtDate(r.createdAt)} (${relTime(r.createdAt)})` },
    { key: 'lastSeenAt', label: 'Last seen', type: 'datetime', width: 120, text: r => relTime(r.lastSeenAt) },
    { key: 'questionsMonth', label: 'Questions (month)', type: 'number', width: 130 },
    { key: 'researchMonth', label: 'Research (month)', type: 'number', width: 130, hidden: true },
    { key: 'costMonthMicros', label: 'Model cost (month)', type: 'number', width: 140, text: r => money(Math.round(r.costMonthMicros / 10000)), sortValue: r => r.costMonthMicros },
    { key: 'planRenewsAt', label: 'Renews or ends', type: 'date', width: 130 },
    { key: 'customerId', label: 'Customer record', width: 150, text: r => r.customerId ? 'yes' : 'no', render: r => r.customerId ? `<a href="#/customers/${esc(r.customerId)}">Open record</a>` : (can('manager') ? `<button type="button" class="btn xs" data-addc="${esc(r.id)}">${icon('plus', 12)}Add as customer</button>` : '<span class="muted">none</span>') },
    { key: 'id', label: 'Account id', width: 200, hidden: true, text: r => r.id },
  ];
  let grid;
  grid = createGrid({
    key: 'signups', columns, rows: data.accounts, rowId: r => r.id, noun: 'accounts', csvName: 'ricorsa-accounts', defaultSort: { key: 'createdAt', dir: 'desc' }, searchPlaceholder: 'Search by email or name',
    filters: [{ key: 'when', allLabel: 'All time', options: [{ value: 'week', label: 'This week' }, { value: 'month', label: '30 days' }], test: (r, v) => r.createdAt >= (v === 'week' ? week : month) }, { key: 'paying', options: [{ value: 'paying', label: 'Paying' }, { value: 'granted', label: 'Trial or licence' }, { value: 'free', label: 'Free' }], test: (r, v) => v === 'paying' ? ['ACTIVE', 'APPROVAL_PENDING'].includes(r.subscriptionStatus || '') : v === 'granted' ? ['TRIAL', 'LICENSED'].includes(r.subscriptionStatus || '') : r.plan === 'free' }],
    emptyTitle: 'No accounts yet', emptyText: 'People who sign up at ricorsa.com appear here.',
    onRowClick: r => accountSheet(r, grid),
    actions: r => [{ key: 'view', label: 'View account', icon: 'eye' }, r.customerId ? { key: 'open', label: 'Open customer record', icon: 'users' } : { key: 'add', label: 'Add as customer', icon: 'userPlus', disabled: !can('manager') }, { key: 'grant', label: 'Set plan, trial or licence', icon: 'sparkles', disabled: !can('manager') }],
    onAction: (r, k) => { if (k === 'view') accountSheet(r, grid); else if (k === 'open') go('#/customers/' + r.customerId); else if (k === 'add') addAsCustomer(r, grid); else if (k === 'grant') grantModal(r, a => { grid.update(r.id, { plan: a.plan, subscriptionStatus: a.subscriptionStatus, planRenewsAt: a.planRenewsAt }); }); },
    footExtra: rows => `${rows.filter(r => ['ACTIVE', 'APPROVAL_PENDING'].includes(r.subscriptionStatus || '')).length} paying`,
  });
  page('Ricorsa sign-ups', `${data.total.toLocaleString('en-US')} account${data.total === 1 ? '' : 's'} on ricorsa.com`, grid.el);
  grid.el.addEventListener('click', e => { const b = e.target.closest('[data-addc]'); if (b) { e.stopPropagation(); addAsCustomer(data.accounts.find(a => a.id === b.dataset.addc), grid); } });
}
async function addAsCustomer(r, grid) {
  try { const res = await api('/api/accounts/' + encodeURIComponent(r.id) + '/customer', { method: 'POST' }); invalidate('customers', 'dashboard'); grid.update(r.id, { customerId: res.customer.id }); toast(res.created ? 'Customer record created' : 'Already a customer'); go('#/customers/' + res.customer.id); } catch (e) { apiToast(e); }
}
async function accountSheet(r, grid) {
  let a; try { a = (await api('/api/accounts/' + encodeURIComponent(r.id))).account; } catch (e) { apiToast(e); return; }
  const paying = ['ACTIVE', 'APPROVAL_PENDING'].includes(a.subscriptionStatus || '');
  openModal(`<h2>${esc(a.email || a.id)}</h2><p class="sub">${esc(a.name || '')} · signed up ${esc(fmtDate(a.createdAt))} · last seen ${esc(relTime(a.lastSeenAt))}</p>
    <dl class="kv"><dt>Plan</dt><dd>${planPill(a.plan)} ${a.subscriptionStatus ? `<span class="pill ${paying ? 'good' : 'warn'}">${esc(a.subscriptionStatus.toLowerCase())}</span>` : ''}${a.planRenewsAt ? ` <span class="muted small">until ${esc(fmtDate(a.planRenewsAt))}</span>` : ''}</dd><dt>This month</dt><dd>${a.usage.month.questions} questions · ${a.usage.month.research} research · about ${money(Math.round(a.usage.month.costMicros / 10000))} in model cost</dd><dt>Library</dt><dd>${a.counts.threads} threads · ${a.counts.builds} builds · ${a.counts.spaces} spaces</dd><dt>PayPal</dt><dd>${a.paypalSubscriptionId ? `<span class="mono">${esc(a.paypalSubscriptionId)}</span>` : '<span class="muted">none</span>'}</dd></dl>
    <div class="modal-actions">${can('manager') ? `<button type="button" class="btn left" id="shGrant">${icon('sparkles', 14)}Set plan</button>` : ''}${r.customerId ? `<a class="btn" href="#/customers/${esc(r.customerId)}">Open customer record</a>` : (can('manager') ? `<button type="button" class="btn primary" id="shAdd">${icon('userPlus', 14)}Add as customer</button>` : '')}<button type="button" class="btn" data-close>Close</button></div>`, { onMount: () => {
    $('#shGrant')?.addEventListener('click', () => grantModal(a, x => grid.update(r.id, { plan: x.plan, subscriptionStatus: x.subscriptionStatus, planRenewsAt: x.planRenewsAt })));
    $('#shAdd')?.addEventListener('click', () => { closeModal(); addAsCustomer(r, grid); });
  } });
}

// ---------- Licences and trials ----------
const custCell = r => r.customer ? `<a href="#/customers/${esc(r.customerId)}">${esc(r.customer.name)}</a>${r.customer.company && r.customer.company !== r.customer.name ? `<span class="cell-sub">${esc(r.customer.company)}</span>` : ''}` : '<span class="muted">–</span>';
const custText = r => r.customer ? `${r.customer.name} ${r.customer.company || ''} ${r.customer.email || ''}` : '';
async function renderLicenses() {
  const data = await load('licenses', '/api/licenses', true);
  const columns = [
    { key: 'key', label: 'Key', primary: true, width: 230, render: r => `<span class="lnk mono">${esc(r.key)}</span>` },
    { key: 'customer', label: 'Customer', width: 220, render: custCell, text: custText },
    { key: 'plan', label: 'Plan', width: 80, render: r => planPill(r.plan), text: r => PLAN_LABEL[r.plan] },
    { key: 'status', label: 'Status', width: 110, render: r => pill(r.endsAt && r.endsAt < Date.now() && r.status === 'active' ? 'lapsed' : r.status, r.endsAt && r.endsAt < Date.now() && r.status === 'active' ? 'expired' : r.status), text: r => r.status },
    { key: 'seats', label: 'Seats', type: 'number', width: 70 },
    { key: 'startsAt', label: 'Starts', type: 'date', width: 110 }, { key: 'endsAt', label: 'Ends', type: 'date', width: 130, text: r => r.endsAt ? `${fmtDate(r.endsAt)} (${inDays(r.endsAt)})` : 'open-ended' },
    { key: 'autoRenew', label: 'Auto-renew', width: 100, text: r => r.autoRenew ? 'yes' : 'no' },
    { key: 'notes', label: 'Notes', width: 220, hidden: true }, { key: 'createdAt', label: 'Issued', type: 'datetime', width: 140, hidden: true },
  ];
  let grid;
  grid = createGrid({
    key: 'licenses', columns, rows: data.licenses, rowId: r => r.id, noun: 'licences', csvName: 'licences', defaultSort: { key: 'createdAt', dir: 'desc' }, searchPlaceholder: 'Search keys and customers',
    filters: [{ key: 'status', options: [{ value: 'active', label: 'Active' }, { value: 'ending', label: 'Ending in 30 days' }, { value: 'suspended', label: 'Suspended' }, { value: 'revoked', label: 'Revoked or expired' }], test: (r, v) => v === 'ending' ? r.status === 'active' && r.endsAt && r.endsAt - Date.now() < 30 * 86400e3 : v === 'revoked' ? r.status === 'revoked' || r.status === 'expired' || (r.endsAt && r.endsAt < Date.now()) : r.status === v }],
    addLabel: can('manager') ? 'Issue licence' : null, onAdd: () => licenseModal(null, () => renderLicenses()),
    emptyTitle: 'No licences yet', emptyText: 'Issue one from a customer record or here.',
    onRowClick: r => { if (r.customerId) go('#/customers/' + r.customerId + '?tab=licenses'); },
    actions: r => can('manager') ? [{ key: 'acts', label: 'Renew, suspend, revoke…', icon: 'more' }] : [],
    onAction: (r, k) => { if (k === 'acts') licenseActions($(`tr[data-id="${CSS.escape(r.id)}"] [data-more]`, grid.el) || document.body, r, () => renderLicenses()); },
  });
  page('Licences', `${data.licenses.filter(l => l.status === 'active').length} active`, grid.el);
}
async function renderTrials() {
  const data = await load('trials', '/api/trials', true);
  const columns = [
    { key: 'customer', label: 'Customer', primary: true, width: 240, render: r => r.customer ? `<span class="lnk">${esc(r.customer.name)}</span>${r.customer.email ? `<span class="cell-sub">${esc(r.customer.email)}</span>` : ''}` : '–', text: custText },
    { key: 'plan', label: 'Plan', width: 80, render: r => planPill(r.plan), text: r => PLAN_LABEL[r.plan] },
    { key: 'status', label: 'Status', width: 110, render: r => pill(r.status === 'active' && r.endsAt < Date.now() ? 'lapsed' : r.status, r.status === 'active' && r.endsAt < Date.now() ? 'expired' : r.status), text: r => r.status },
    { key: 'startedAt', label: 'Started', type: 'date', width: 110 }, { key: 'endsAt', label: 'Ends', type: 'date', width: 140, text: r => `${fmtDate(r.endsAt)} (${inDays(r.endsAt)})` },
    { key: 'convertedAt', label: 'Converted', type: 'date', width: 110 }, { key: 'notes', label: 'Notes', width: 220, hidden: true },
  ];
  let grid;
  grid = createGrid({
    key: 'trials', columns, rows: data.trials, rowId: r => r.id, noun: 'trials', csvName: 'trials', defaultSort: { key: 'endsAt', dir: 'asc' }, searchPlaceholder: 'Search customers',
    filters: [{ key: 'status', options: [{ value: 'active', label: 'Active' }, { value: 'ending', label: 'Ending this week' }, { value: 'converted', label: 'Converted' }, { value: 'done', label: 'Expired or cancelled' }], test: (r, v) => v === 'ending' ? r.status === 'active' && r.endsAt - Date.now() < 7 * 86400e3 && r.endsAt > Date.now() : v === 'done' ? ['expired', 'cancelled'].includes(r.status) || (r.status === 'active' && r.endsAt < Date.now()) : r.status === v }],
    addLabel: can('manager') ? 'Start trial' : null, onAdd: () => trialModal(null, () => renderTrials()),
    emptyTitle: 'No trials yet', emptyText: 'Start one from a customer record or here.',
    onRowClick: r => { if (r.customerId) go('#/customers/' + r.customerId + '?tab=trials'); },
    actions: r => can('manager') ? [{ key: 'acts', label: 'Extend, convert, cancel…', icon: 'more' }] : [],
    onAction: (r, k) => { if (k === 'acts') trialActions($(`tr[data-id="${CSS.escape(r.id)}"] [data-more]`, grid.el) || document.body, r, () => renderTrials()); },
    footExtra: rows => `${rows.filter(r => r.status === 'converted').length} converted`,
  });
  page('Trials', `${data.trials.filter(t => t.status === 'active' && t.endsAt > Date.now()).length} running`, grid.el);
}

// ---------- Communication ----------
async function renderCommunications() {
  const data = await load('communications', '/api/communications', true);
  const columns = [
    { key: 'at', label: 'When', type: 'datetime', width: 150, primary: true, render: r => `<span class="lnk">${esc(fmtDateTime(r.at))}</span>` },
    { key: 'kind', label: 'Type', width: 90, render: r => `<span class="pill ${esc(r.kind)}">${esc(r.kind)}</span>` },
    { key: 'customer', label: 'Customer', width: 200, render: custCell, text: custText },
    { key: 'subject', label: 'Subject', width: 260 },
    { key: 'status', label: 'Status', width: 100, render: r => pill(r.status, r.status === 'sent' || r.status === 'delivered' ? 'sent-ok' : r.status) },
    { key: 'direction', label: 'Direction', width: 90, text: r => r.direction === 'in' ? 'inbound' : 'outbound' },
    { key: 'toEmail', label: 'To', width: 200, hidden: true },
    { key: 'byStaffId', label: 'By', width: 140, text: r => staffName(r.byStaffId) || 'system' },
    { key: 'body', label: 'Message', width: 320, hidden: true },
  ];
  let grid;
  grid = createGrid({
    key: 'communications', columns, rows: data.communications, rowId: r => r.id, noun: 'items', csvName: 'communications', defaultSort: { key: 'at', dir: 'desc' }, searchPlaceholder: 'Search subjects, messages, customers', searchExtra: r => r.body || '',
    filters: [{ key: 'kind', options: [{ value: 'email', label: 'Emails' }, { value: 'call', label: 'Calls' }, { value: 'meeting', label: 'Meetings' }, { value: 'note', label: 'Notes' }], test: (r, v) => r.kind === v }],
    addLabel: can('manager') ? 'Log or send' : null, onAdd: () => commModal(null, {}, () => renderCommunications()),
    emptyTitle: 'Nothing logged yet', emptyText: 'Emails sent from the console and the calls, meetings and notes you log build the history here.',
    onRowClick: r => openModal(`<h2>${esc(r.subject || r.kind)}</h2><p class="sub">${esc(fmtDateTime(r.at))} · ${esc(r.kind)} · ${r.direction === 'in' ? 'inbound' : 'outbound'}${r.toEmail ? ' · to ' + esc(r.toEmail) : ''}${r.customer ? ' · ' + esc(r.customer.name) : ''} · ${esc(r.status)}</p><div class="txt" style="white-space:pre-wrap;max-height:50vh;overflow:auto;font-size:13.5px">${esc(r.body || '(no text)')}</div>${r.error ? `<div class="notice bad" style="margin-top:12px">${icon('alert', 16)}<div>${esc(r.error)}</div></div>` : ''}<div class="modal-actions">${r.customerId ? `<a class="btn left" href="#/customers/${esc(r.customerId)}?tab=communications">Open customer</a>` : ''}<button type="button" class="btn" data-close>Close</button></div>`),
    actions: r => [{ key: 'customer', label: 'Open customer', icon: 'users', disabled: !r.customerId }, { key: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !can('owner') }],
    onAction: async (r, k) => { if (k === 'customer') go('#/customers/' + r.customerId + '?tab=communications'); else if (k === 'delete' && await confirmModal('Delete this item?', 'It is removed from the history.', { okLabel: 'Delete', danger: true })) { try { await api('/api/communications/' + r.id, { method: 'DELETE' }); grid.remove([r.id]); invalidate('communications'); } catch (e) { apiToast(e); } } },
  });
  page('Communication', `${data.communications.length} item${data.communications.length === 1 ? '' : 's'}`, grid.el);
}

// ---------- Invoices ----------
async function renderInvoices() {
  const data = await load('invoices', '/api/invoices', true);
  const columns = [
    { key: 'number', label: 'Number', primary: true, width: 120, render: r => `<span class="lnk">${esc(r.number)}</span>` },
    { key: 'customer', label: 'Customer', width: 220, render: custCell, text: custText },
    { key: 'status', label: 'Status', width: 100, render: r => pill(r.status, r.status) },
    { key: 'totalCents', label: 'Total', type: 'money', width: 110 }, { key: 'paidCents', label: 'Paid', type: 'money', width: 100 },
    { key: 'balance', label: 'Balance', type: 'money', width: 110, text: r => money(Math.max(0, r.totalCents - r.paidCents), r.currency), sortValue: r => r.totalCents - r.paidCents, render: r => r.status === 'paid' || r.status === 'void' ? '<span class="muted">–</span>' : `<span class="money">${money(Math.max(0, r.totalCents - r.paidCents), r.currency)}</span>` },
    { key: 'issuedAt', label: 'Issued', type: 'date', width: 110 }, { key: 'dueAt', label: 'Due', type: 'date', width: 130, text: r => r.dueAt ? `${fmtDate(r.dueAt)}${r.status === 'sent' || r.status === 'overdue' ? ` (${inDays(r.dueAt)})` : ''}` : '' },
    { key: 'paypalStatus', label: 'PayPal', width: 110, text: r => r.paypalInvoiceId ? (r.paypalStatus || 'created').toLowerCase() : '' },
    { key: 'sentTo', label: 'Sent to', width: 200, hidden: true }, { key: 'paidAt', label: 'Paid on', type: 'date', width: 110, hidden: true },
  ];
  let grid;
  grid = createGrid({
    key: 'invoices', columns, rows: data.invoices, rowId: r => r.id, noun: 'invoices', csvName: 'invoices', defaultSort: { key: 'issuedAt', dir: 'desc' }, searchPlaceholder: 'Search numbers and customers',
    filters: [{ key: 'status', options: [{ value: 'draft', label: 'Drafts' }, { value: 'sent', label: 'Sent' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }], test: (r, v) => r.status === v }],
    addLabel: can('manager') ? 'New invoice' : null, onAdd: () => go('#/invoices/new'),
    emptyTitle: 'No invoices yet', emptyText: 'Draft one for a customer; send it through PayPal so they can pay online, or by email with the PDF.',
    onRowClick: r => go('#/invoices/' + r.id),
    actions: r => [{ key: 'open', label: 'Open', icon: 'external' }, { key: 'pdf', label: 'View PDF', icon: 'download' }, { key: 'customer', label: 'Open customer', icon: 'users' }],
    onAction: (r, k) => { if (k === 'open') go('#/invoices/' + r.id); else if (k === 'pdf') window.open('/api/invoices/' + r.id + '/pdf', '_blank'); else if (k === 'customer') go('#/customers/' + r.customerId + '?tab=invoices'); },
    footExtra: rows => `${money(rows.filter(r => r.status === 'sent' || r.status === 'overdue').reduce((a, r) => a + Math.max(0, r.totalCents - r.paidCents), 0))} outstanding`,
  });
  page('Invoices and billing', `${data.invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length} open`, grid.el);
}
const itemsHtml = (items) => items.map((it, i) => `<tr data-i="${i}"><td><input type="text" data-f="description" value="${esc(it.description)}" placeholder="What is being billed"></td><td style="width:80px"><input type="number" class="num" data-f="qty" value="${it.qty}" min="0" step="1"></td><td style="width:120px"><input type="number" class="num" data-f="unit" value="${(it.unitCents / 100).toFixed(2)}" step="0.01"></td><td style="width:80px"><input type="number" class="num" data-f="tax" value="${it.taxRate || 0}" min="0" max="100" step="0.1"></td><td class="num" data-line>${money(Math.round(it.qty * it.unitCents))}</td><td style="width:34px"><button type="button" class="icon-btn sm" data-rm="${i}" aria-label="Remove line">${icon('x', 14)}</button></td></tr>`).join('');
const readItem = tr => ({ description: $('[data-f=description]', tr).value.trim(), qty: Number($('[data-f=qty]', tr).value || 0), unitCents: Math.round(parseFloat($('[data-f=unit]', tr).value || '0') * 100), taxRate: Number($('[data-f=tax]', tr).value || 0) || undefined });
function readItems(root) { return $$('tr[data-i]', root).map(readItem); }
function totalsOf(items) { let sub = 0, tax = 0; for (const it of items) { const line = Math.round((it.qty || 0) * (it.unitCents || 0)); sub += line; if (it.taxRate) tax += Math.round(line * it.taxRate / 100); } return { sub, tax, total: sub + tax }; }
async function renderInvoiceEditor(existing, query = {}) {
  const customers = (await load('customers', '/api/customers')).customers;
  const inv = state.settings.invoice;
  const custId = existing ? existing.customerId : (query.customer || (customers[0] && customers[0].id) || '');
  const cust = customers.find(c => c.id === custId);
  const draft = existing || { items: [{ description: `Ricorsa ${PLAN_LABEL[cust && cust.plan !== 'free' ? cust.plan : 'pro']} plan, one month`, qty: 1, unitCents: cust && cust.mrrCents ? cust.mrrCents : (cust && cust.plan === 'team' ? 4900 : 2000), taxRate: inv.taxRate || undefined }], currency: inv.currency, issuedAt: Date.now(), dueAt: Date.now() + inv.dueDays * 86400e3, notes: '', terms: inv.terms, billTo: cust ? { name: cust.name, company: cust.company || '', email: cust.email || '' } : {} };
  const body = contentEl(`<div class="card" style="max-width:980px"><h3>${existing ? `Edit draft ${esc(existing.number)}` : 'New invoice'}</h3><div class="sub">${existing ? 'Drafts can be changed until they are sent.' : 'A number is assigned when you save the draft.'}</div>
    <div class="form-grid" style="margin-bottom:14px">
      <div class="field"><label>Customer</label><select id="ivCust" ${existing ? 'disabled' : ''}>${customers.map(c => `<option value="${esc(c.id)}"${c.id === custId ? ' selected' : ''}>${esc(c.company && c.company !== c.name ? `${c.name} (${c.company})` : c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Bill to email</label><input type="email" id="ivEmail" value="${esc(draft.billTo.email || '')}"></div>
      <div class="field"><label>Issued</label><input type="date" id="ivIssued" value="${esc(isoDay(draft.issuedAt))}"></div>
      <div class="field"><label>Due</label><input type="date" id="ivDue" value="${esc(isoDay(draft.dueAt))}"></div>
      <div class="field"><label>Bill to name</label><input type="text" id="ivName" value="${esc(draft.billTo.name || '')}"></div>
      <div class="field"><label>Bill to company</label><input type="text" id="ivCompany" value="${esc(draft.billTo.company || '')}"></div>
      <div class="field"><label>Currency</label><input type="text" id="ivCur" value="${esc(draft.currency)}" maxlength="3" style="text-transform:uppercase"></div>
    </div>
    <table class="inv-items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Tax %</th><th class="num">Amount</th><th></th></tr></thead><tbody id="ivItems">${itemsHtml(draft.items)}</tbody></table>
    <div style="margin-top:8px"><button type="button" class="btn sm" id="ivAdd">${icon('plus', 14)}Add line</button></div>
    <div class="totals" id="ivTotals"></div>
    <div class="form-grid" style="margin-top:14px"><div class="field"><label>Notes (shown on the invoice)</label><textarea id="ivNotes">${esc(draft.notes || '')}</textarea></div><div class="field"><label>Terms</label><textarea id="ivTerms">${esc(draft.terms || '')}</textarea></div></div>
    <div class="modal-actions"><a class="btn left" href="${existing ? '#/invoices/' + esc(existing.id) : '#/invoices'}">Cancel</a><button type="button" class="btn primary" id="ivSave">${icon('save', 14)}${existing ? 'Save draft' : 'Save draft'}</button></div></div>`);
  page(existing ? existing.number : 'New invoice', '', body, { crumbs: `<a href="#/invoices">Invoices</a>${icon('chevronRight', 14)}<span>${existing ? esc(existing.number) : 'New'}</span>` });
  const paintTotals = () => { const t = totalsOf(readItems(body)); $$('tr[data-i]', body).forEach(tr => { const it = readItem(tr); $('[data-line]', tr).textContent = money(Math.round(it.qty * it.unitCents), $('#ivCur').value || 'USD'); }); $('#ivTotals').innerHTML = `<span class="k">Subtotal</span><span class="v">${money(t.sub, $('#ivCur').value)}</span>${t.tax ? `<span class="k">Tax</span><span class="v">${money(t.tax, $('#ivCur').value)}</span>` : ''}<span class="k big">Total</span><span class="v big">${money(t.total, $('#ivCur').value)}</span>`; };
  body.addEventListener('input', paintTotals);
  body.addEventListener('click', e => { const rm = e.target.closest('[data-rm]'); if (rm) { rm.closest('tr').remove(); paintTotals(); } });
  $('#ivAdd').addEventListener('click', () => { $('#ivItems').insertAdjacentHTML('beforeend', itemsHtml([{ description: '', qty: 1, unitCents: 0 }]).replace('data-i="0"', `data-i="${$$('tr[data-i]', body).length}"`)); $('#ivItems tr:last-child input').focus(); });
  $('#ivCust').addEventListener('change', () => { const c = customers.find(x => x.id === $('#ivCust').value); if (c) { $('#ivEmail').value = c.email || ''; $('#ivName').value = c.name; $('#ivCompany').value = c.company || ''; } });
  paintTotals();
  $('#ivSave').addEventListener('click', async () => {
    const items = readItems(body).filter(it => it.description); if (!items.length) { toast('Add at least one line with a description', 'bad'); return; }
    const payload = { currency: ($('#ivCur').value || 'USD').toUpperCase(), items, issuedAt: dayMs($('#ivIssued').value) || Date.now(), dueAt: dayMs($('#ivDue').value), notes: $('#ivNotes').value.trim(), terms: $('#ivTerms').value.trim(), billTo: { name: $('#ivName').value.trim() || null, company: $('#ivCompany').value.trim() || null, email: $('#ivEmail').value.trim() || null } };
    $('#ivSave').disabled = true;
    try { const r = existing ? await api('/api/invoices/' + existing.id, { method: 'PATCH', body: payload }) : await api('/api/invoices', { body: { customerId: $('#ivCust').value, ...payload } }); invalidate('invoices', 'customers', 'dashboard'); toast(existing ? 'Draft saved' : `Draft ${r.invoice.number} saved`); go('#/invoices/' + r.invoice.id); } catch (e) { $('#ivSave').disabled = false; apiToast(e); }
  });
}
async function renderInvoice(id) {
  const d = await api('/api/invoices/' + encodeURIComponent(id));
  const i = d.invoice; const bal = Math.max(0, i.totalCents - i.paidCents); const bt = i.billTo || {};
  const body = contentEl(`<div class="two-col"><div>
    <div class="card"><div class="inv-status-row"><h3 style="margin:0">${esc(i.number)}</h3>${pill(i.status, i.status)}${i.paypalInvoiceId ? `<span class="pill accent">PayPal ${esc((i.paypalStatus || '').toLowerCase())}</span>` : ''}<span class="spacer" style="flex:1"></span>${can('manager') ? `${i.status === 'draft' ? `<a class="btn sm" href="#/invoices/${esc(i.id)}/edit" data-edit>${icon('edit', 14)}Edit</a><button type="button" class="btn sm primary" data-send>${icon('send', 14)}Send</button>` : ''}${(i.status === 'sent' || i.status === 'overdue') ? `<button type="button" class="btn sm primary" data-pay>${icon('dollar', 14)}Record payment</button><button type="button" class="btn sm" data-send>${icon('send', 14)}Send again</button>` : ''}${i.paypalInvoiceId && i.status !== 'void' ? `<button type="button" class="btn sm" data-sync title="Refresh the status from PayPal">${icon('refresh', 14)}PayPal</button>` : ''}` : ''}<button type="button" class="icon-btn" data-more aria-label="More">${icon('more', 18)}</button></div>
      <dl class="kv" style="margin-top:14px"><dt>Customer</dt><dd><a href="#/customers/${esc(i.customerId)}?tab=invoices">${esc(i.customer ? i.customer.name : i.customerId)}</a></dd><dt>Bill to</dt><dd>${esc(bt.company || bt.name || '')}${bt.name && bt.company && bt.name !== bt.company ? `, ${esc(bt.name)}` : ''}${bt.email ? ` · ${esc(bt.email)}` : ''}</dd><dt>Issued</dt><dd>${esc(fmtDate(i.issuedAt))}</dd><dt>Due</dt><dd>${i.dueAt ? `${esc(fmtDate(i.dueAt))} <span class="muted small">(${esc(inDays(i.dueAt))})</span>` : 'On receipt'}</dd><dt>Total</dt><dd><b>${money(i.totalCents, i.currency)}</b>${i.taxCents ? ` <span class="muted small">incl. ${money(i.taxCents, i.currency)} tax</span>` : ''}</dd><dt>Paid</dt><dd>${money(i.paidCents, i.currency)}${i.paidAt ? ` <span class="muted small">on ${esc(fmtDate(i.paidAt))}</span>` : ''}</dd><dt>Balance</dt><dd><b>${money(bal, i.currency)}</b></dd>${i.sentTo ? `<dt>Sent</dt><dd>${esc(fmtDateTime(i.sentAt))} to ${esc(i.sentTo)}</dd>` : ''}${i.paypalLink ? `<dt>Pay link</dt><dd><a href="${esc(i.paypalLink)}" target="_blank" rel="noopener">${esc(i.paypalLink)}</a></dd>` : ''}</dl>
      <table class="inv-items" style="margin-top:14px"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead><tbody>${i.items.map(it => `<tr><td>${esc(it.description)}${it.taxRate ? `<span class="cell-sub">tax ${it.taxRate}%</span>` : ''}</td><td class="num">${it.qty}</td><td class="num">${money(it.unitCents, i.currency)}</td><td class="num">${money(Math.round(it.qty * it.unitCents), i.currency)}</td></tr>`).join('')}</tbody></table>
      ${i.notes ? `<p class="small" style="margin:12px 0 0"><b>Notes</b><br>${esc(i.notes)}</p>` : ''}${i.terms ? `<p class="small muted" style="margin:8px 0 0">${esc(i.terms)}</p>` : ''}</div>
    <div class="card" style="margin-top:16px"><h3>Payments</h3><div class="sub">${d.payments.length ? `${d.payments.length} recorded` : 'None yet'}</div>${d.payments.length ? `<div class="list">${d.payments.map(p => `<div class="li"><div class="grow"><b>${money(p.amountCents, p.currency)}</b> <span class="muted">${esc(p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</span><div class="sub">${esc(fmtDateTime(p.receivedAt))}${p.notes ? ' · ' + esc(p.notes) : ''}</div></div></div>`).join('')}</div>` : ''}</div></div>
    <div class="card"><h3>Preview</h3><div class="sub">The PDF your customer receives. <a href="/api/invoices/${esc(i.id)}/pdf?download=1">Download</a></div>${navigator.pdfViewerEnabled === false ? `<div class="empty small">This browser cannot show PDFs inline. <a href="/api/invoices/${esc(i.id)}/pdf" target="_blank" rel="noopener">Open the PDF</a></div>` : `<iframe class="pdf-frame" src="/api/invoices/${esc(i.id)}/pdf#toolbar=0" title="Invoice PDF"></iframe>`}</div></div>`);
  page(i.number, '', body, { crumbs: `<a href="#/invoices">Invoices</a>${icon('chevronRight', 14)}<span>${esc(i.number)}</span>` });
  const reload = () => go('#/invoices/' + i.id);
  $$('[data-send]', body).forEach(b => b.addEventListener('click', () => sendInvoiceModal(i, reload)));
  $('[data-pay]', body)?.addEventListener('click', () => paymentModal(i, reload));
  $('[data-sync]', body)?.addEventListener('click', async () => { try { const r = await api('/api/invoices/' + i.id + '/sync', { method: 'POST' }); toast(r.changed ? 'Updated from PayPal' : 'No change at PayPal'); invalidate('invoices', 'dashboard'); reload(); } catch (e) { apiToast(e); } });
  $('[data-more]', body).addEventListener('click', e => actionMenu(e.currentTarget, [{ key: 'pdf', label: 'Open PDF in a tab', icon: 'external' }, { key: 'copy', label: i.paypalLink ? 'Copy pay link' : 'Copy number', icon: 'copy' }, '-', i.status === 'draft' ? { key: 'delete', label: 'Delete draft', icon: 'trash', danger: true, disabled: !can('manager') } : { key: 'void', label: 'Void invoice', icon: 'x', danger: true, disabled: !can('manager') || i.status === 'paid' || i.status === 'void' }], async k => {
    if (k === 'pdf') window.open('/api/invoices/' + i.id + '/pdf', '_blank');
    else if (k === 'copy') { try { await navigator.clipboard.writeText(i.paypalLink || i.number); toast('Copied'); } catch { toast(i.paypalLink || i.number); } }
    else if (k === 'delete' && await confirmModal('Delete this draft?', 'The number is not reused.', { okLabel: 'Delete', danger: true })) { try { await api('/api/invoices/' + i.id, { method: 'DELETE' }); invalidate('invoices', 'customers', 'dashboard'); toast('Deleted'); go('#/invoices'); } catch (err) { apiToast(err); } }
    else if (k === 'void') textModal('Void this invoice', 'Reason (sent to the customer if it went through PayPal)', async reason => { try { await api('/api/invoices/' + i.id, { method: 'PATCH', body: { status: 'void', voidReason: reason } }); invalidate('invoices', 'customers', 'dashboard'); toast('Voided'); reload(); } catch (err) { apiToast(err); } });
  }));
}
function sendInvoiceModal(i, onDone) {
  const pp = state.integrations.paypal, em = state.integrations.email;
  const fields = [{ key: 'via', label: 'Send through', type: 'select', options: [pp && em ? { value: 'both', label: 'PayPal and email (recommended)' } : null, pp ? { value: 'paypal', label: 'PayPal only: PayPal emails it with a Pay button' } : null, em ? { value: 'email', label: 'Email only: our message with the PDF attached' } : null].filter(Boolean), span: true }, { key: 'to', label: 'To', type: 'email', span: true }, { key: 'message', label: 'Message (email only)', type: 'textarea', span: true, placeholder: 'A short note above the invoice details' }];
  if (!pp && !em) { openModal(`<h2>Nothing to send with yet</h2><p class="sub">Connect PayPal (PAYPAL_CLIENT_SECRET) or the email service (RESEND_API_KEY) on the console, then invoices can go out from here. You can still download the PDF and send it yourself.</p><div class="modal-actions"><a class="btn" href="/api/invoices/${esc(i.id)}/pdf?download=1">Download PDF</a><button type="button" class="btn primary" data-close>Close</button></div>`); return; }
  openModal(`<h2>${icon('send', 20)}Send ${esc(i.number)}</h2><p class="sub">${money(i.totalCents, i.currency)} to ${esc(i.customer ? i.customer.name : 'the customer')}.${pp ? ` PayPal ${state.integrations.paypalEnv === 'live' ? 'live' : 'sandbox'} account.` : ''}</p>${formHtml(fields, { via: pp && em ? 'both' : pp ? 'paypal' : 'email', to: (i.billTo && i.billTo.email) || i.sentTo || '' })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="sdOk">Send</button></div>`, { onMount: ov => $('#sdOk').addEventListener('click', async () => {
    const f = readForm(ov, fields); if (!f.to) { toast('An email address is needed', 'bad'); return; }
    $('#sdOk').disabled = true;
    try { const r = await api('/api/invoices/' + i.id + '/send', { body: { via: f.via, to: f.to, message: f.message } }); closeModal(); invalidate('invoices', 'customers', 'communications', 'dashboard'); toast(r.notes.join('. ')); onDone(); } catch (e) { $('#sdOk').disabled = false; apiToast(e); }
  }) });
}
function paymentModal(i, onDone) {
  const bal = Math.max(0, i.totalCents - i.paidCents);
  const fields = [{ key: 'amountCents', label: 'Amount', type: 'money' }, { key: 'method', label: 'Method', type: 'select', options: [{ value: 'bank', label: 'Bank transfer' }, { value: 'card', label: 'Card' }, { value: 'paypal', label: 'PayPal' }, { value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }, { value: 'other', label: 'Other' }] }, { key: 'receivedAt', label: 'Received', type: 'date' }, { key: 'reference', label: 'Reference' }, i.paypalInvoiceId ? { key: 'syncPaypal', label: 'Also record it on the PayPal invoice', type: 'check', span: true } : null, { key: 'notes', label: 'Notes', type: 'textarea', span: true }].filter(Boolean);
  openModal(`<h2>${icon('dollar', 20)}Record a payment</h2><p class="sub">${esc(i.number)}: ${money(bal, i.currency)} outstanding.</p>${formHtml(fields, { amountCents: bal, method: 'bank', receivedAt: Date.now(), syncPaypal: true })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="pmOk">Record</button></div>`, { onMount: ov => $('#pmOk').addEventListener('click', async () => {
    const f = readForm(ov, fields); if (!f.amountCents) { toast('Enter the amount received', 'bad'); return; }
    try { const r = await api('/api/invoices/' + i.id + '/payments', { body: f }); closeModal(); invalidate('invoices', 'customers', 'dashboard'); toast(r.invoice.status === 'paid' ? 'Paid in full' : 'Payment recorded'); if (r.paypalNote) toast(r.paypalNote); onDone(); } catch (e) { apiToast(e); }
  }) });
}

// ---------- Staff ----------
function inviteModal(onDone) {
  const fields = [{ key: 'email', label: 'Email', type: 'email', required: true }, { key: 'name', label: 'Name' }, { key: 'role', label: 'Role', type: 'select', options: [{ value: 'manager', label: 'Manager: edits records, sends emails and invoices' }, { value: 'viewer', label: 'Viewer: reads everything, changes nothing' }, { value: 'owner', label: 'Owner: everything, plus staff and settings' }], span: true }, { key: 'sendEmail', label: state.integrations.email ? 'Email them the invitation' : 'Email them the invitation (email sending is not set up yet)', type: 'check', span: true }];
  openModal(`<h2>${icon('userPlus', 20)}Invite someone</h2><p class="sub">They sign in with this email address at ${esc(location.host)} and are in. Nothing to set up on their side.</p>${formHtml(fields, { role: 'manager', sendEmail: !!state.integrations.email })}<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="inOk">Invite</button></div>`, { onMount: ov => $('#inOk').addEventListener('click', async () => {
    const f = readForm(ov, fields); if (!f.email) { toast('An email address is needed', 'bad'); return; }
    try { const r = await api('/api/staff', { body: { email: f.email, name: f.name || null, role: f.role, sendEmail: f.sendEmail } }); closeModal(); toast(r.emailed ? 'Invited and emailed' : 'Invited; tell them to sign in with that email'); if (onDone) onDone(); } catch (e) { apiToast(e); }
  }) });
}
async function renderStaff() {
  const data = await api('/api/staff');
  const rows = data.staff;
  const pending = rows.filter(s => s.status === 'requested');
  const body = contentEl(`${pending.length ? `<div class="notice" style="margin-bottom:14px">${icon('alert', 16)}<div><b>${pending.length} access request${pending.length === 1 ? '' : 's'}</b> waiting for an owner.</div></div>` : ''}
    <div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0">People</h3><span class="muted small">${rows.filter(s => s.status === 'active').length} active</span><span style="flex:1"></span>${can('owner') ? `<button type="button" class="btn sm primary" id="stInvite">${icon('userPlus', 14)}Invite</button>` : ''}</div>
    <div class="list">${rows.map(s => `<div class="li"><span class="avatar-sm" style="background:${colorFor(s.email)};color:#fff">${s.picture ? `<img src="${esc(s.picture)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : esc(initials(s.name || s.email))}</span><div class="grow"><b>${esc(s.name || s.email)}</b> ${pill(s.role, s.role)} ${s.status !== 'active' ? pill(s.status, s.status) : ''}${s.id === state.me.id ? ' <span class="muted small">(you)</span>' : ''}<div class="sub">${esc(s.email)}${s.lastSeenAt ? ' · last seen ' + esc(relTime(s.lastSeenAt)) : s.invitedAt ? ' · invited ' + esc(relTime(s.invitedAt)) : ''}</div></div>${can('owner') && s.id !== state.me.id ? `${s.status === 'requested' ? `<button type="button" class="btn xs primary" data-approve="${esc(s.id)}">Approve</button>` : ''}<button type="button" class="icon-btn sm" data-st="${esc(s.id)}" aria-label="Actions">${icon('more', 16)}</button>` : ''}</div>`).join('')}</div></div>
    <div class="card" style="margin-top:16px"><h3>Roles</h3><dl class="kv" style="margin-top:8px"><dt>Owner</dt><dd>Everything: staff, settings, deleting records, voiding invoices. Owners named in the console configuration cannot be demoted.</dd><dt>Manager</dt><dd>Customers, contacts, licences, trials, communication, invoices and payments, and plan grants on Ricorsa accounts.</dd><dt>Viewer</dt><dd>Sees everything, changes nothing.</dd></dl></div>`);
  page('Staff', 'Who can use the console', body);
  $('#stInvite')?.addEventListener('click', () => inviteModal(() => renderStaff()));
  $$('[data-approve]', body).forEach(b => b.addEventListener('click', async () => { try { await api('/api/staff/' + b.dataset.approve, { method: 'PATCH', body: { status: 'active' } }); toast('Approved'); renderStaff(); } catch (e) { apiToast(e); } }));
  $$('[data-st]', body).forEach(b => b.addEventListener('click', () => { const s = rows.find(x => x.id === b.dataset.st); actionMenu(b, [{ key: 'owner', label: 'Make owner', icon: 'staff', on: s.role === 'owner' }, { key: 'manager', label: 'Make manager', icon: 'edit', on: s.role === 'manager' }, { key: 'viewer', label: 'Make viewer', icon: 'eye', on: s.role === 'viewer' }, '-', s.status === 'disabled' ? { key: 'enable', label: 'Re-enable', icon: 'play' } : { key: 'disable', label: 'Disable access', icon: 'pause', danger: true }, { key: 'remove', label: 'Remove', icon: 'trash', danger: true }], async k => {
    try {
      if (k === 'remove') { if (!(await confirmModal(`Remove ${s.email}?`, 'They lose access to the console. Records they created are kept.', { okLabel: 'Remove', danger: true }))) return; await api('/api/staff/' + s.id, { method: 'DELETE' }); }
      else if (k === 'disable' || k === 'enable') await api('/api/staff/' + s.id, { method: 'PATCH', body: { status: k === 'disable' ? 'disabled' : 'active' } });
      else await api('/api/staff/' + s.id, { method: 'PATCH', body: { role: k } });
      toast('Done'); renderStaff();
    } catch (e) { apiToast(e); }
  }); }));
}

// ---------- Settings ----------
async function renderSettings() {
  const s = (await api('/api/settings')).settings; state.settings = s;
  const ro = !can('owner');
  const company = [{ key: 'name', label: 'Company name' }, { key: 'legalName', label: 'Legal name' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'website', label: 'Website', type: 'url' }, { key: 'taxId', label: 'Tax ID' }, { key: 'line1', label: 'Address line 1', span: true }, { key: 'city', label: 'City' }, { key: 'region', label: 'State or region' }, { key: 'postal', label: 'Postal code' }, { key: 'country', label: 'Country' }];
  const invoice = [{ key: 'prefix', label: 'Number prefix' }, { key: 'nextNumber', label: 'Next number', type: 'number', min: 1 }, { key: 'dueDays', label: 'Due after (days)', type: 'number', min: 0 }, { key: 'taxRate', label: 'Default tax rate (%)', type: 'number', min: 0, max: 100 }, { key: 'currency', label: 'Currency' }, { key: 'terms', label: 'Default terms', type: 'textarea', span: true }, { key: 'footer', label: 'PDF footer', span: true }];
  const email = [{ key: 'from', label: 'From (name <address>)', span: true, hint: 'The address must be on a domain verified with the email service.' }, { key: 'replyTo', label: 'Reply-to', span: true }, { key: 'signature', label: 'Signature', type: 'textarea', span: true }];
  const trial = [{ key: 'days', label: 'Default length (days)', type: 'number', min: 1, max: 365 }, { key: 'plan', label: 'Default plan', type: 'select', options: [{ value: 'pro', label: 'Pro' }, { value: 'team', label: 'Team' }] }];
  const a = s.company.address || {};
  const body = contentEl(`<div class="settings-grid">
    <div class="card"><h3>Integrations</h3><div class="sub">Secrets are set on the Cloudflare Worker, not here.</div><div class="list">
      <div class="integration">${icon('card', 20)}<div class="grow"><b>PayPal invoicing ${state.integrations.paypal ? pill('connected', 'good') : pill('not connected', 'warn')}</b><span class="sub">${state.integrations.paypal ? `Invoices can be sent through PayPal (${esc(state.integrations.paypalEnv)}); customers pay online and the status flows back.` : 'Add PAYPAL_CLIENT_SECRET to the console Worker to send invoices through PayPal.'}</span></div></div>
      <div class="integration">${icon('mail', 20)}<div class="grow"><b>Email (Resend) ${state.integrations.email ? pill('connected', 'good') : pill('not connected', 'warn')}</b><span class="sub">${state.integrations.email ? 'Emails to customers, invoice PDFs and staff invitations go out from the address below.' : 'Add RESEND_API_KEY to the console Worker and verify the sending domain at resend.com; until then emails are logged only.'}</span></div></div>
      <div class="integration">${icon('loop', 20)}<div class="grow"><b>Ricorsa product database ${pill('bound', 'good')}</b><span class="sub">Accounts, subscriptions and usage are read live; plan grants are written to it.</span></div></div></div></div>
    <div class="card"><h3>Company (on invoices)</h3><div class="sub">Appears at the top of every invoice.</div>${formHtml(company, { ...s.company, line1: a.line1, city: a.city, region: a.region, postal: a.postal, country: a.country })}${ro ? '' : `<div class="modal-actions"><button type="button" class="btn primary" data-save="company">Save</button></div>`}</div>
    <div class="card"><h3>Invoices</h3><div class="sub">Numbering and defaults for new invoices.</div>${formHtml(invoice, s.invoice)}${ro ? '' : `<div class="modal-actions"><button type="button" class="btn primary" data-save="invoice">Save</button></div>`}</div>
    <div class="card"><h3>Email</h3><div class="sub">How messages from the console are signed.</div>${formHtml(email, s.email)}${ro ? '' : `<div class="modal-actions"><button type="button" class="btn primary" data-save="email">Save</button></div>`}</div>
    <div class="card"><h3>Trials</h3><div class="sub">Defaults when starting a trial.</div>${formHtml(trial, s.trial)}${ro ? '' : `<div class="modal-actions"><button type="button" class="btn primary" data-save="trial">Save</button></div>`}</div>
    <div class="card"><h3>This console</h3><dl class="kv" style="margin-top:8px"><dt>You</dt><dd>${esc(state.me.email)} · ${esc(state.me.role)}</dd><dt>Address</dt><dd>${esc(location.origin)}</dd><dt>Product</dt><dd><a href="${esc(state.app.productUrl)}" target="_blank" rel="noopener">${esc(state.app.productUrl)}</a></dd><dt>Layouts</dt><dd>Grid columns, widths, sorts and filters are remembered for you on every device. <button type="button" class="btn xs" id="resetLayouts">Reset all grid layouts</button></dd></dl></div>
  </div>`);
  page('Settings', ro ? 'Read only: owners can change these' : '', body);
  if (ro) $$('input, select, textarea', body).forEach(el => { el.disabled = true; });
  $$('[data-save]', body).forEach(b => b.addEventListener('click', async () => {
    const key = b.dataset.save; const card = b.closest('.card'); let patch;
    if (key === 'company') { const f = readForm(card, company); patch = { name: f.name, legalName: f.legalName, email: f.email, phone: f.phone, website: f.website, taxId: f.taxId, address: { line1: f.line1, city: f.city, region: f.region, postal: f.postal, country: f.country } }; }
    else if (key === 'invoice') { const f = readForm(card, invoice); patch = { prefix: f.prefix, nextNumber: f.nextNumber || 1, dueDays: f.dueDays ?? 14, taxRate: f.taxRate ?? 0, currency: (f.currency || 'USD').toUpperCase(), terms: f.terms, footer: f.footer }; }
    else if (key === 'email') { const f = readForm(card, email); patch = { from: f.from, replyTo: f.replyTo, signature: f.signature }; }
    else if (key === 'trial') { const f = readForm(card, trial); patch = { days: f.days || 14, plan: f.plan }; }
    b.disabled = true;
    try { const r = await api('/api/settings', { method: 'PATCH', body: { [key]: patch } }); state.settings = r.settings; toast('Saved'); } catch (e) { apiToast(e); }
    b.disabled = false;
  }));
  $('#resetLayouts').addEventListener('click', () => { state.ui.grids = {}; persistUi(); markPrefs(); toast('Grid layouts reset'); });
}

// ---------- Activity ----------
async function renderActivity() {
  const data = await api('/api/activity?limit=500');
  const columns = [
    { key: 'at', label: 'When', type: 'datetime', width: 150 },
    { key: 'actorEmail', label: 'Who', width: 200, text: r => r.actorEmail || 'system' },
    { key: 'action', label: 'Action', width: 160, render: r => `<span class="mono">${esc(r.action)}</span>` },
    { key: 'summary', label: 'What happened', width: 520, primary: true, render: r => `<span class="lnk">${esc(r.summary)}</span>` },
    { key: 'entityType', label: 'Record type', width: 110, hidden: true },
  ];
  const grid = createGrid({
    key: 'activity', columns, rows: data.activity, rowId: r => r.id, noun: 'entries', csvName: 'activity', defaultSort: { key: 'at', dir: 'desc' }, searchPlaceholder: 'Search the log',
    filters: [{ key: 'type', options: [{ value: 'customer', label: 'Customers' }, { value: 'invoice', label: 'Invoices' }, { value: 'license', label: 'Licences' }, { value: 'trial', label: 'Trials' }, { value: 'communication', label: 'Communication' }, { value: 'staff', label: 'Staff' }, { value: 'ricorsa', label: 'Ricorsa' }], test: (r, v) => r.entityType === v }],
    emptyTitle: 'Nothing recorded yet',
    onRowClick: r => { if (r.customerId) go('#/customers/' + r.customerId); else if (r.entityType === 'invoice' && r.entityId) go('#/invoices/' + r.entityId); },
  });
  page('Activity log', 'Everything the team changed, newest first', grid.el);
}

// ---------- Gate and init ----------
function gate(kind, info) {
  const copy = {
    no_access: ['This account is not on the staff list', `You are signed in as ${info.email}. Ask an owner to invite you, or request access and an owner can approve it.`],
    pending: ['Your request is waiting', 'An owner has to approve it before you can see anything. You will be able to sign in as soon as they do.'],
    disabled: ['This account has been disabled', 'Ask an owner if you think that is a mistake.'],
    requested: ['Request sent', 'An owner will see it under Staff. Try again after they approve.'],
  }[kind] || ['No access', info.message || ''];
  $('#app').innerHTML = `<div class="gate"><div class="card">${LOGO_SVG(40)}<h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${kind === 'no_access' ? `<button type="button" class="btn primary" id="reqBtn">${icon('userPlus', 14)}Request access</button>` : ''}<a class="btn" href="/auth/logout">Sign out</a></div></div></div>`;
  $('#reqBtn')?.addEventListener('click', async () => { try { await api('/api/access', { method: 'POST' }); gate('requested', info); } catch (e) { apiToast(e); } });
}
async function init() {
  let me;
  try { me = await api('/api/me'); }
  catch (e) {
    if (e && e.status === 401) return;
    if (e && e.status === 403) { let info = { email: '' }; try { info = await api('/api/access'); } catch {} gate(e.code, { ...info, message: e.message }); return; }
    $('#app').innerHTML = `<div class="gate"><div class="card">${LOGO_SVG(40)}<h1>Could not open the console</h1><p>${esc((e && e.message) || 'Something went wrong.')}</p><a class="btn" href="/">Try again</a></div></div>`; return;
  }
  state.me = me.me; state.staff = me.staff; state.settings = me.settings; state.integrations = me.integrations; state.app = me.app; state.ready = true;
  if (me.me.prefs && me.me.prefs.grids) state.ui.grids = Object.assign({}, state.ui.grids, me.me.prefs.grids);
  document.title = me.app.name || 'Ricorsa Manager Console';
  shell();
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if (e.key === 'Escape') { closePop(); closeModal(); return; }
    if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const map = { g: null, '1': '#/dashboard', '2': '#/customers', '3': '#/signups', '4': '#/licenses', '5': '#/trials', '6': '#/communications', '7': '#/invoices' };
      if (map[e.key]) go(map[e.key]);
      if (e.key === '/') { const s = $('#main input[type=search]'); if (s) { e.preventDefault(); s.focus(); } }
    }
  });
  if (!location.hash && state.ui.lastRoute) location.hash = state.ui.lastRoute; else render();
}
init();
