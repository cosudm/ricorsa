/* Ricorsa app kit v1: the runtime every built app starts from. Plain ES2020, no network, no dependencies. */
(function () {
  'use strict';
  if (window.rk && window.rk.version >= 1) return;
  const rk = { version: 1 };
  const doc = document;

  // ---------- Core ----------
  rk.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  rk.$ = (sel, root) => (root || doc).querySelector(sel);
  rk.$$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));
  let seq = 0;
  rk.id = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + (++seq).toString(36);
  rk.debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments, self = this; t = setTimeout(() => fn.apply(self, a), ms == null ? 200 : ms); }; };
  /** h('button', { class: 'rk-btn primary', onClick: fn, data: { id: 3 }, aria: { label: 'x' } }, 'Save') */
  rk.h = function (tag, attrs) {
    const el = doc.createElement(tag);
    const a = attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs) ? attrs : null;
    const children = Array.prototype.slice.call(arguments, a ? 2 : 1);
    if (a) for (const k of Object.keys(a)) {
      const v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'data' && typeof v === 'object') for (const d of Object.keys(v)) el.dataset[d] = v[d];
      else if (k === 'aria' && typeof v === 'object') for (const d of Object.keys(v)) el.setAttribute('aria-' + d, v[d]);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v === 'boolean') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c instanceof Node ? c : doc.createTextNode(String(c))); };
    children.forEach(add);
    return el;
  };
  rk.clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
  rk.render = (el, content) => { rk.clear(el); if (content == null) return el; if (typeof content === 'string') el.innerHTML = content; else if (Array.isArray(content)) content.forEach(c => c != null && el.appendChild(c instanceof Node ? c : doc.createTextNode(String(c)))); else el.appendChild(content instanceof Node ? content : doc.createTextNode(String(content))); return el; };

  // ---------- Store: versioned state in localStorage, safe without it ----------
  /** store('my-app', { version: 1, initial: {...}, migrate(old, fromVersion) }) -> { get, set, update, on, reset } */
  rk.store = function (key, opts) {
    opts = opts || {};
    const version = opts.version || 1;
    const initial = () => (typeof opts.initial === 'function' ? opts.initial() : JSON.parse(JSON.stringify(opts.initial == null ? {} : opts.initial)));
    let data; const subs = [];
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return initial();
        const parsed = JSON.parse(raw);
        const stored = parsed && typeof parsed === 'object' && 'v' in parsed && 'data' in parsed ? parsed : { v: 0, data: parsed };
        if (stored.v !== version && typeof opts.migrate === 'function') { const m = opts.migrate(stored.data, stored.v); return m == null ? initial() : m; }
        return stored.data == null ? initial() : stored.data;
      } catch (e) { return initial(); }
    };
    const write = () => { try { localStorage.setItem(key, JSON.stringify({ v: version, data })); } catch (e) { /* private mode or full: keep going in memory */ } };
    data = read();
    const emit = () => subs.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
    const api = {
      get: () => data,
      set: (next) => { data = next; write(); emit(); return data; },
      update: (fn) => { const r = fn(data); if (r !== undefined) data = r; write(); emit(); return data; },
      on: (fn) => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
      reset: () => { data = initial(); write(); emit(); return data; },
      key, version,
    };
    return api;
  };

  // ---------- Router: [data-screen] containers and controls ----------
  /** router({ initial: 'home', onChange(name) }) -> { go(name), current(), names() } */
  rk.router = function (opts) {
    opts = opts || {};
    const root = opts.root || doc;
    const isScreen = (el) => !el.matches('button, a, [role="tab"], [role="button"]');
    const screens = () => rk.$$('[data-screen]', root).filter(isScreen);
    const controls = () => rk.$$('button[data-screen], a[data-screen], [role="tab"][data-screen]', root);
    let current = null;
    const names = () => screens().map(s => s.dataset.screen);
    const go = (name) => {
      const list = screens(); if (!list.some(s => s.dataset.screen === name)) return false;
      current = name;
      list.forEach(s => { s.hidden = s.dataset.screen !== name; });
      controls().forEach(c => { const on = c.dataset.screen === name; if (on) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current'); if (c.getAttribute('role') === 'tab') c.setAttribute('aria-selected', String(on)); });
      if (opts.hash !== false) { try { if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name); } catch (e) {} }
      try { window.scrollTo({ top: 0 }); } catch (e) {}
      if (typeof opts.onChange === 'function') { try { opts.onChange(name); } catch (e) { console.error(e); } }
      return true;
    };
    root.addEventListener('click', (e) => {
      const c = e.target && e.target.closest ? e.target.closest('button[data-screen], a[data-screen], [role="tab"][data-screen]') : null;
      if (!c || !root.contains(c)) return;
      if (c.tagName === 'A') e.preventDefault();
      go(c.dataset.screen);
    });
    const fromHash = () => { const h = (location.hash || '').slice(1); return h && names().includes(h) ? h : null; };
    window.addEventListener('hashchange', () => { const h = fromHash(); if (h && h !== current) go(h); });
    const start = fromHash() || opts.initial || names()[0];
    if (start) go(start);
    return { go, current: () => current, names };
  };

  // ---------- Toasts, confirmations, modals ----------
  const host = () => { let h = rk.$('.rk-toast-host'); if (!h) { h = rk.h('div', { class: 'rk-toast-host', role: 'status', 'aria-live': 'polite' }); doc.body.appendChild(h); } return h; };
  /** toast('Saved', { kind: 'ok' | 'bad' | 'info', ms: 3200, action: { label: 'Undo', onClick } }) */
  rk.toast = function (text, opts) {
    opts = opts || {};
    const el = rk.h('div', { class: 'rk-toast' + (opts.kind ? ' ' + opts.kind : '') }, rk.h('span', null, String(text)));
    if (opts.action && opts.action.label) el.appendChild(rk.h('button', { type: 'button', onClick: () => { try { opts.action.onClick && opts.action.onClick(); } finally { el.remove(); } } }, opts.action.label));
    host().appendChild(el);
    const ms = opts.ms == null ? (opts.action ? 6000 : 3200) : opts.ms;
    if (ms > 0) setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, ms);
    return el;
  };
  /** undoable('Deleted "Q3 plan"', () => restore()) : a toast with an Undo button */
  rk.undoable = (text, undo) => rk.toast(text, { action: { label: 'Undo', onClick: undo } });
  let openModals = [];
  /** modal({ title, body: string | Node, actions: [{ label, kind: 'primary'|'danger'|'ghost', onClick(api), close: true }], wide, onClose }) -> { close(), el } */
  rk.modal = function (opts) {
    opts = opts || {};
    const back = rk.h('div', { class: 'rk-modal-back', role: 'presentation' });
    const box = rk.h('div', { class: 'rk-modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
    const body = rk.h('div', { class: 'rk-modal-b' });
    rk.render(body, opts.body);
    const api = { el: box, body, close: () => { if (!back.isConnected) return; back.remove(); openModals = openModals.filter(m => m !== api); if (typeof opts.onClose === 'function') opts.onClose(); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} } } };
    const closeBtn = rk.h('button', { type: 'button', class: 'rk-btn ghost sm icon', 'aria-label': 'Close', onClick: api.close }, '×');
    box.appendChild(rk.h('div', { class: 'rk-modal-h' }, rk.h('h2', null, opts.title || ''), closeBtn));
    box.appendChild(body);
    const actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (actions.length) box.appendChild(rk.h('div', { class: 'rk-modal-f' }, actions.map(a => rk.h('button', { type: 'button', class: 'rk-btn' + (a.kind ? ' ' + a.kind : ''), onClick: () => { let r; try { r = a.onClick ? a.onClick(api) : undefined; } catch (e) { console.error(e); } if (a.close !== false && r !== false) api.close(); } }, a.label))));
    back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back && opts.dismissible !== false) api.close(); });
    const prevFocus = doc.activeElement;
    doc.body.appendChild(back);
    openModals.push(api);
    const first = box.querySelector('input, select, textarea, button:not([aria-label="Close"])'); if (first) { try { first.focus(); } catch (e) {} }
    return api;
  };
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openModals.length) openModals[openModals.length - 1].close(); });
  /** confirm({ title, text, ok: 'Delete', cancel: 'Keep', danger: true }) -> Promise<boolean> */
  rk.confirm = (opts) => new Promise((resolve) => {
    opts = typeof opts === 'string' ? { text: opts } : (opts || {});
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    rk.modal({ title: opts.title || 'Are you sure?', body: rk.h('p', null, opts.text || ''), onClose: () => finish(false), actions: [
      { label: opts.cancel || 'Cancel', onClick: () => finish(false) },
      { label: opts.ok || 'Confirm', kind: (opts.danger ? 'danger ' : '') + 'primary', onClick: () => finish(true) },
    ] });
  });
  /** prompt({ title, label, value, placeholder, ok, multiline }) -> Promise<string|null> */
  rk.prompt = (opts) => new Promise((resolve) => {
    opts = opts || {};
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const input = opts.multiline ? rk.h('textarea', { id: rk.id('p'), placeholder: opts.placeholder || '' }) : rk.h('input', { type: 'text', id: rk.id('p'), placeholder: opts.placeholder || '' });
    input.value = opts.value || '';
    const m = rk.modal({ title: opts.title || 'Enter a value', body: rk.h('div', { class: 'rk-field' }, rk.h('label', { for: input.id }, opts.label || ''), input), onClose: () => finish(null), actions: [
      { label: opts.cancel || 'Cancel', onClick: () => finish(null) },
      { label: opts.ok || 'OK', kind: 'primary', onClick: () => finish(input.value) },
    ] });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); finish(input.value); m.close(); } });
  });
  /** menu(button, [{ label, onClick, danger }]) : a dropdown under a button */
  rk.menu = function (button, items) {
    const wrap = button.closest('.rk-menu') || (() => { const w = rk.h('div', { class: 'rk-menu' }); button.parentNode.insertBefore(w, button); w.appendChild(button); return w; })();
    button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
    let list = null;
    const close = () => { if (list) { list.remove(); list = null; button.setAttribute('aria-expanded', 'false'); } };
    const open = () => { close(); list = rk.h('div', { class: 'rk-menu-list', role: 'menu' }, items.map(it => rk.h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onClick: () => { close(); it.onClick && it.onClick(); } }, it.label))); wrap.appendChild(list); button.setAttribute('aria-expanded', 'true'); };
    button.addEventListener('click', (e) => { e.stopPropagation(); if (list) close(); else open(); });
    doc.addEventListener('click', (e) => { if (list && !wrap.contains(e.target)) close(); });
    return { open, close };
  };

  // ---------- Files and clipboard ----------
  /** download('report.csv', text, 'text/csv') */
  rk.download = function (filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || (/\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : /\.json$/i.test(filename) ? 'application/json' : /\.html?$/i.test(filename) ? 'text/html' : 'text/plain;charset=utf-8') });
    const url = URL.createObjectURL(blob);
    const a = rk.h('a', { href: url, download: filename }); doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  /** toCSV(rows, [{ key, label }] | ['a','b']) -> string with a header row */
  rk.toCSV = function (rows, columns) {
    rows = rows || [];
    const cols = columns ? columns.map(c => typeof c === 'string' ? { key: c, label: c } : c) : Object.keys(rows[0] || {}).map(k => ({ key: k, label: k }));
    const cell = (v) => { if (v == null) return ''; if (v instanceof Date) v = v.toISOString(); if (typeof v === 'object') v = JSON.stringify(v); const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.map(c => cell(c.label)).join(',')].concat(rows.map(r => cols.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))).join('\r\n');
  };
  /** parseCSV(text) -> array of objects keyed by the header row */
  rk.parseCSV = function (text) {
    const rows = []; let row = [], cell = '', q = false; const s = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter(r => r.some(v => v !== '')).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i]; }); return o; });
  };
  rk.copy = async function (text) {
    try { await navigator.clipboard.writeText(String(text)); return true; } catch (e) {
      try { const ta = rk.h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = String(text); doc.body.appendChild(ta); ta.select(); const ok = doc.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
    }
  };

  // ---------- Formatting ----------
  const toDate = (v) => v instanceof Date ? v : (typeof v === 'number' ? new Date(v) : new Date(String(v)));
  rk.fmt = {
    num: (n, d) => { n = Number(n); if (!isFinite(n)) return '—'; return n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: d == null ? 0 : d }); },
    int: (n) => { n = Number(n); return isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—'; },
    money: (n, ccy, d) => { n = Number(n); if (!isFinite(n)) return '—'; try { return n.toLocaleString('en-US', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: d == null ? (Math.abs(n) >= 1000 && n === Math.round(n) ? 0 : 2) : d }); } catch (e) { return (ccy || '$') + ' ' + rk.fmt.num(n, 2); } },
    compact: (n) => { n = Number(n); if (!isFinite(n)) return '—'; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : rk.fmt.num(n, 0); },
    pct: (n, d) => { n = Number(n); return isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: d == null ? 0 : d }) + '%' : '—'; },
    date: (v, style) => { const d = toDate(v); if (isNaN(d)) return ''; return d.toLocaleDateString('en-US', style === 'long' ? { month: 'long', day: 'numeric', year: 'numeric' } : style === 'short' ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }); },
    dateTime: (v) => { const d = toDate(v); if (isNaN(d)) return ''; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
    time: (v) => { const d = toDate(v); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
    iso: (v) => { const d = toDate(v); return isNaN(d) ? '' : d.toISOString().slice(0, 10); },
    rel: (v) => { const d = toDate(v); if (isNaN(d)) return ''; const s = Math.round((Date.now() - d.getTime()) / 1000); const a = Math.abs(s); const f = (n, u) => { const r = Math.round(n); return r + ' ' + u + (r === 1 ? '' : 's') + (s >= 0 ? ' ago' : ' from now'); }; if (a < 45) return s >= 0 ? 'just now' : 'in a moment'; if (a < 3600) return f(a / 60, 'minute'); if (a < 86400) return f(a / 3600, 'hour'); if (a < 86400 * 30) return f(a / 86400, 'day'); if (a < 86400 * 365) return f(a / (86400 * 30), 'month'); return f(a / (86400 * 365), 'year'); },
    bytes: (n) => { n = Number(n); if (!isFinite(n)) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)) + ' ' + u[i]; },
    plural: (n, one, many) => rk.fmt.int(n) + ' ' + (Number(n) === 1 ? one : (many || one + 's')),
    duration: (ms) => { ms = Number(ms); if (!isFinite(ms)) return ''; const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ' + (s % 60) + 's'; const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm'; },
    title: (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };
  rk.today = () => new Date().toISOString().slice(0, 10);
  rk.addDays = (v, n) => { const d = toDate(v); d.setDate(d.getDate() + n); return d; };

  // ---------- Data helpers ----------
  const keyFn = (k) => typeof k === 'function' ? k : (o) => (o == null ? undefined : o[k]);
  rk.sortBy = (arr, key, dir) => { const f = keyFn(key); const m = dir === 'desc' ? -1 : 1; return arr.slice().sort((a, b) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; if (typeof x === 'number' && typeof y === 'number') return (x - y) * m; return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * m; }); };
  rk.groupBy = (arr, key) => { const f = keyFn(key); const out = {}; for (const it of arr) { const k = String(f(it)); (out[k] = out[k] || []).push(it); } return out; };
  rk.sum = (arr, key) => { const f = key == null ? (x) => x : keyFn(key); return arr.reduce((s, it) => s + (Number(f(it)) || 0), 0); };
  rk.avg = (arr, key) => arr.length ? rk.sum(arr, key) / arr.length : 0;
  rk.uniq = (arr, key) => { const f = key == null ? (x) => x : keyFn(key); const seen = new Set(); return arr.filter(it => { const k = f(it); if (seen.has(k)) return false; seen.add(k); return true; }); };
  rk.countBy = (arr, key) => { const f = keyFn(key); const out = {}; for (const it of arr) { const k = String(f(it)); out[k] = (out[k] || 0) + 1; } return out; };
  /** search(items, 'q3 houston', ['title', 'notes']) : every word must appear in one of the fields */
  rk.search = (items, query, fields) => { const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return items; return items.filter(it => { const hay = (fields ? fields.map(f => keyFn(f)(it)) : Object.values(it)).map(v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ').toLowerCase(); return words.every(w => hay.includes(w)); }); };
  rk.range = (n) => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
  rk.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  rk.pick = (arr, seedIndex) => arr[Math.abs(seedIndex | 0) % arr.length];

  // ---------- Data table ----------
  /**
   * table(el, { columns: [{ key, label, num, sortable, render(row), width, class }], rows, sort: { key, dir }, search: 'text',
   *             searchFields, pageSize: 25, empty: { title, text, action: { label, onClick } }, onRow(row), rowKey: 'id', selected })
   * -> { update({ rows, search, sort }), state }
   */
  rk.table = function (el, opts) {
    const state = { rows: opts.rows || [], sort: opts.sort || null, search: opts.search || '', page: 0, pageSize: opts.pageSize || 0 };
    const cols = (opts.columns || []).map(c => typeof c === 'string' ? { key: c, label: rk.fmt.title(c) } : c);
    const wrap = el.classList.contains('rk-table-wrap') ? el : (() => { el.classList.add('rk-table-wrap'); return el; })();
    const table = rk.h('table', { class: 'rk-table' });
    const thead = rk.h('thead'); const tbody = rk.h('tbody'); table.appendChild(thead); table.appendChild(tbody);
    const foot = rk.h('div', { class: 'rk-table-foot' });
    const emptyBox = rk.h('div');
    rk.clear(wrap); wrap.appendChild(table); wrap.appendChild(emptyBox); wrap.appendChild(foot);
    const view = () => {
      let rows = state.rows;
      if (state.search) rows = rk.search(rows, state.search, opts.searchFields || cols.map(c => c.key));
      if (state.sort && state.sort.key) { const col = cols.find(c => c.key === state.sort.key); rows = rk.sortBy(rows, col && col.sortValue ? col.sortValue : state.sort.key, state.sort.dir); }
      return rows;
    };
    const paint = () => {
      rk.clear(thead); rk.clear(tbody);
      thead.appendChild(rk.h('tr', null, cols.map(c => rk.h('th', { class: (c.num ? 'num ' : '') + (c.class || ''), 'data-sort': c.sortable === false ? null : c.key, 'aria-sort': state.sort && state.sort.key === c.key ? (state.sort.dir === 'desc' ? 'descending' : 'ascending') : null, style: c.width ? { width: c.width } : null, scope: 'col', onClick: c.sortable === false ? null : () => { state.sort = state.sort && state.sort.key === c.key ? { key: c.key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' }; state.page = 0; paint(); } }, c.label))));
      const rows = view();
      const total = rows.length;
      const pageRows = state.pageSize ? rows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize) : rows;
      for (const r of pageRows) {
        const tr = rk.h('tr', { class: opts.onRow ? 'rk-click' : '', 'aria-selected': opts.selected && opts.rowKey && String(r[opts.rowKey]) === String(opts.selected) ? 'true' : null, tabindex: opts.onRow ? 0 : null, onClick: opts.onRow ? (e) => { if (e.target.closest('button, a, input, select')) return; opts.onRow(r); } : null, onKeydown: opts.onRow ? (e) => { if (e.key === 'Enter' && e.target === tr) opts.onRow(r); } : null });
        for (const c of cols) { const td = rk.h('td', { class: (c.num ? 'num ' : '') + (c.class || '') }); const v = c.render ? c.render(r) : r[c.key]; rk.render(td, v == null ? '' : (v instanceof Node || Array.isArray(v) ? v : (c.num && typeof v === 'number' ? rk.fmt.num(v, c.digits) : String(v)))); tr.appendChild(td); }
        tbody.appendChild(tr);
      }
      rk.clear(emptyBox);
      table.hidden = total === 0;
      if (total === 0) { const e = opts.empty || {}; emptyBox.appendChild(rk.empty({ title: e.title || (state.search ? 'No matches' : 'Nothing here yet'), text: e.text || (state.search ? 'Try a different search.' : ''), action: state.search ? null : e.action })); }
      rk.clear(foot);
      const pages = state.pageSize ? Math.max(1, Math.ceil(total / state.pageSize)) : 1;
      foot.appendChild(rk.h('span', null, rk.fmt.plural(total, opts.noun || 'row') + (state.search ? ' matching' : '')));
      foot.appendChild(rk.h('span', { class: 'rk-spacer' }));
      if (pages > 1) foot.appendChild(rk.h('span', { class: 'rk-row' }, rk.h('button', { type: 'button', class: 'rk-btn sm', disabled: state.page === 0, onClick: () => { state.page--; paint(); } }, 'Previous'), rk.h('span', null, 'Page ' + (state.page + 1) + ' of ' + pages), rk.h('button', { type: 'button', class: 'rk-btn sm', disabled: state.page >= pages - 1, onClick: () => { state.page++; paint(); } }, 'Next')));
      foot.hidden = total === 0 && !state.search;
    };
    paint();
    return { state, update: (patch) => { Object.assign(state, patch || {}); if (patch && ('rows' in patch || 'search' in patch)) state.page = 0; paint(); }, rows: view };
  };
  /** empty({ title, text, icon, action: { label, onClick } }) -> element */
  rk.empty = (o) => { o = o || {}; return rk.h('div', { class: 'rk-empty' }, rk.h('div', { class: 'rk-empty-i', 'aria-hidden': 'true' }, o.icon || '✦'), rk.h('h3', null, o.title || 'Nothing here yet'), o.text ? rk.h('p', null, o.text) : null, o.action ? rk.h('button', { type: 'button', class: 'rk-btn primary', onClick: o.action.onClick }, o.action.label) : null); };

  // ---------- Charts: small SVG charts with real axes ----------
  const svgNS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, text) => { const e = doc.createElementNS(svgNS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10; return m * p; };
  const fmtTick = (v, format) => format ? format(v) : (Math.abs(v) >= 1000 ? rk.fmt.compact(v) : rk.fmt.num(v, 2));
  rk.chart = {};
  /** chart.bars(el, { labels, values, format, height, color, horizontal }) */
  rk.chart.bars = function (el, o) {
    o = o || {}; const labels = o.labels || [], values = (o.values || []).map(Number);
    const W = 640, H = o.height || 240, padL = 48, padR = 12, padT = 16, padB = 34;
    const svg = s('svg', { class: 'rk-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.title || 'Bar chart' });
    const max = niceMax(Math.max.apply(null, values.concat([0])) * 1.05);
    const iw = W - padL - padR, ih = H - padT - padB;
    for (let i = 0; i <= 4; i++) { const y = padT + ih - (ih * i / 4); svg.appendChild(s('line', { class: 'grid', x1: padL, x2: W - padR, y1: y, y2: y })); svg.appendChild(s('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, fmtTick(max * i / 4, o.format))); }
    const n = Math.max(1, values.length); const slot = iw / n; const bw = Math.min(48, slot * 0.62);
    values.forEach((v, i) => { const h = max ? (v / max) * ih : 0; const x = padL + slot * i + (slot - bw) / 2; const y = padT + ih - h; const r = s('rect', { class: 'bar', x, y, width: bw, height: Math.max(0, h), rx: 4, fill: o.color || null }); r.appendChild(s('title', {}, (labels[i] == null ? '' : labels[i] + ': ') + (o.format ? o.format(v) : rk.fmt.num(v)))); svg.appendChild(r); if (o.values.length <= 14) svg.appendChild(s('text', { class: 'val', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle' }, o.format ? o.format(v) : rk.fmt.compact(v))); const lab = String(labels[i] == null ? '' : labels[i]); if (n <= 16 || i % Math.ceil(n / 16) === 0) svg.appendChild(s('text', { x: x + bw / 2, y: H - 12, 'text-anchor': 'middle' }, lab.length > 12 ? lab.slice(0, 11) + '…' : lab)); });
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: padT + ih, y2: padT + ih }));
    rk.clear(el).appendChild(svg); return svg;
  };
  /** chart.line(el, { labels, series: [{ name, values, color }], format, height, area }) */
  rk.chart.line = function (el, o) {
    o = o || {}; const labels = o.labels || []; const series = (o.series || []).map((sr, i) => ({ name: sr.name || 'Series ' + (i + 1), values: (sr.values || []).map(Number), color: sr.color || ['var(--rk-accent)', '#C0743A', '#3D8B6E', '#7B5EA7', '#B3546A', '#5A7E9C'][i % 6] }));
    const W = 640, H = o.height || 240, padL = 48, padR = 12, padT = 16, padB = 34;
    const svg = s('svg', { class: 'rk-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.title || 'Line chart' });
    const all = series.flatMap(sr => sr.values).filter(v => isFinite(v));
    const max = niceMax(Math.max.apply(null, all.concat([0])) * 1.05); const min = Math.min(0, Math.min.apply(null, all.concat([0])));
    const iw = W - padL - padR, ih = H - padT - padB; const n = Math.max(2, labels.length || (series[0] ? series[0].values.length : 2));
    const X = (i) => padL + (iw * i) / (n - 1), Y = (v) => padT + ih - ((v - min) / (max - min || 1)) * ih;
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; svg.appendChild(s('line', { class: 'grid', x1: padL, x2: W - padR, y1: Y(v), y2: Y(v) })); svg.appendChild(s('text', { x: padL - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmtTick(v, o.format))); }
    series.forEach(sr => { const pts = sr.values.map((v, i) => [X(i), Y(v)]); if (o.area !== false && series.length === 1) svg.appendChild(s('path', { class: 'area', d: 'M' + pts.map(p => p.join(',')).join('L') + 'L' + X(pts.length - 1) + ',' + Y(min) + 'L' + X(0) + ',' + Y(min) + 'Z', fill: sr.color })); svg.appendChild(s('path', { class: 'line', d: 'M' + pts.map(p => p.join(',')).join('L'), stroke: sr.color })); if (pts.length <= 24) pts.forEach((p, i) => { const c = s('circle', { class: 'pt', cx: p[0], cy: p[1], r: 3.5, stroke: sr.color }); c.appendChild(s('title', {}, sr.name + (labels[i] != null ? ' · ' + labels[i] : '') + ': ' + (o.format ? o.format(sr.values[i]) : rk.fmt.num(sr.values[i])))); svg.appendChild(c); }); });
    labels.forEach((lab, i) => { if (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) svg.appendChild(s('text', { x: X(i), y: H - 12, 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, String(lab))); });
    svg.appendChild(s('line', { class: 'axis', x1: padL, x2: W - padR, y1: Y(min), y2: Y(min) }));
    rk.clear(el).appendChild(svg);
    if (series.length > 1) el.appendChild(rk.h('div', { class: 'rk-legend' }, series.map(sr => rk.h('span', null, rk.h('i', { style: { background: sr.color } }), sr.name))));
    return svg;
  };
  /** chart.spark(el, values, { color, height }) : a small inline line */
  rk.chart.spark = function (el, values, o) {
    o = o || {}; values = (values || []).map(Number); const W = 120, H = o.height || 32;
    const svg = s('svg', { class: 'rk-chart', viewBox: '0 0 ' + W + ' ' + H, style: 'width:' + W + 'px;height:' + H + 'px', role: 'img', 'aria-label': 'Trend' });
    const max = Math.max.apply(null, values.concat([1])), min = Math.min.apply(null, values.concat([0]));
    const pts = values.map((v, i) => [(W - 4) * i / Math.max(1, values.length - 1) + 2, H - 3 - ((v - min) / (max - min || 1)) * (H - 6)]);
    if (pts.length) { svg.appendChild(s('path', { class: 'line', d: 'M' + pts.map(p => p.join(',')).join('L'), stroke: o.color || null })); svg.appendChild(s('circle', { class: 'pt', cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.5, stroke: o.color || null })); }
    rk.clear(el).appendChild(svg); return svg;
  };
  /** chart.donut(el, { parts: [{ label, value, color }], format, total }) */
  rk.chart.donut = function (el, o) {
    o = o || {}; const parts = (o.parts || []).map((p, i) => ({ label: p.label, value: Number(p.value) || 0, color: p.color || ['var(--rk-accent)', '#C0743A', '#3D8B6E', '#7B5EA7', '#B3546A', '#5A7E9C', '#8A8F98'][i % 7] }));
    const total = parts.reduce((a, p) => a + p.value, 0) || 1; const R = 60, r = 42, C = 2 * Math.PI * ((R + r) / 2);
    const svg = s('svg', { class: 'rk-chart', viewBox: '0 0 140 140', style: 'max-width:180px', role: 'img', 'aria-label': o.title || 'Breakdown' });
    let off = 0;
    parts.forEach(p => { const len = C * p.value / total; const c = s('circle', { cx: 70, cy: 70, r: (R + r) / 2, fill: 'none', stroke: p.color, 'stroke-width': R - r, 'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }); c.appendChild(s('title', {}, p.label + ': ' + (o.format ? o.format(p.value) : rk.fmt.num(p.value)) + ' (' + rk.fmt.pct(100 * p.value / total, 0) + ')')); svg.appendChild(c); off += len; });
    svg.appendChild(s('text', { x: 70, y: 66, 'text-anchor': 'middle', class: 'val', style: 'font-size:16px' }, o.center != null ? String(o.center) : (o.format ? o.format(total) : rk.fmt.compact(total))));
    svg.appendChild(s('text', { x: 70, y: 84, 'text-anchor': 'middle' }, o.centerLabel || 'total'));
    const box = rk.h('div', { class: 'rk-row', style: { alignItems: 'center', gap: '16px' } }, svg, rk.h('div', { class: 'rk-legend', style: { flexDirection: 'column', gap: '6px' } }, parts.map(p => rk.h('span', null, rk.h('i', { style: { background: p.color } }), p.label + ' · ' + rk.fmt.pct(100 * p.value / total, 0)))));
    rk.clear(el).appendChild(box); return svg;
  };

  // ---------- Forms ----------
  /**
   * validate(form, { name: ['required', 'max:80'], email: ['email'], amount: ['required', 'number', 'min:0'], custom: [{ test: (v, values) => bool, message }] })
   * -> { ok, values, errors }; shows each message in the field's .err and marks .rk-field.invalid
   */
  rk.validate = function (form, rules) {
    const values = {}; const errors = {};
    for (const el of form.elements) { if (!el.name) continue; if (el.type === 'checkbox') values[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) values[el.name] = el.value; } else values[el.name] = el.value; }
    const msg = { required: 'This field is required', email: 'Enter a valid email address', number: 'Enter a number', url: 'Enter a valid address', date: 'Enter a valid date' };
    for (const name of Object.keys(rules || {})) {
      const v = values[name]; const str = v == null ? '' : String(v).trim();
      for (const rule of [].concat(rules[name])) {
        let bad = '';
        if (typeof rule === 'string') {
          const [k, arg] = rule.split(':');
          if (k === 'required' && (str === '' || v === false)) bad = msg.required;
          else if (str !== '' && k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) bad = msg.email;
          else if (str !== '' && k === 'number' && !isFinite(Number(str))) bad = msg.number;
          else if (str !== '' && k === 'min' && Number(str) < Number(arg)) bad = 'Must be at least ' + arg;
          else if (str !== '' && k === 'max' && (isFinite(Number(str)) && !isNaN(Number(str)) && str !== '' && /^-?\d/.test(str) ? Number(str) > Number(arg) : str.length > Number(arg))) bad = /^-?\d/.test(str) && isFinite(Number(str)) ? 'Must be at most ' + arg : 'Keep it under ' + arg + ' characters';
          else if (str !== '' && k === 'url' && !/^https?:\/\/[^\s]+$/i.test(str)) bad = msg.url;
          else if (str !== '' && k === 'date' && isNaN(new Date(str))) bad = msg.date;
        } else if (rule && typeof rule.test === 'function') { let ok = false; try { ok = !!rule.test(v, values); } catch (e) { ok = false; } if (!ok) bad = rule.message || 'Check this value'; }
        if (bad) { errors[name] = bad; break; }
      }
    }
    for (const el of form.elements) { if (!el.name) continue; const field = el.closest('.rk-field'); if (!field) continue; const err = field.querySelector('.err') || field.appendChild(rk.h('div', { class: 'err' })); if (errors[el.name]) { field.classList.add('invalid'); err.textContent = errors[el.name]; el.setAttribute('aria-invalid', 'true'); } else { field.classList.remove('invalid'); el.removeAttribute('aria-invalid'); } }
    const firstBad = Object.keys(errors)[0]; if (firstBad && form.elements[firstBad]) { const f = form.elements[firstBad]; try { (f.focus ? f : f[0]).focus(); } catch (e) {} }
    return { ok: Object.keys(errors).length === 0, values, errors };
  };
  /** field({ label, name, type, value, hint, options: [{value,label}], required, placeholder, rows }) -> .rk-field element */
  rk.field = function (o) {
    o = o || {}; const id = o.id || rk.id('f');
    let input;
    if (o.type === 'select') { input = rk.h('select', { id, name: o.name }); (o.options || []).forEach(op => { const opt = typeof op === 'string' ? { value: op, label: op } : op; input.appendChild(rk.h('option', { value: opt.value, selected: String(opt.value) === String(o.value) }, opt.label)); }); }
    else if (o.type === 'textarea') { input = rk.h('textarea', { id, name: o.name, placeholder: o.placeholder || null, rows: o.rows || 4 }); input.value = o.value == null ? '' : o.value; }
    else if (o.type === 'checkbox') { const c = rk.h('input', { type: 'checkbox', id, name: o.name, checked: !!o.value }); return rk.h('div', { class: 'rk-field' + (o.wide ? ' wide' : '') }, rk.h('label', { class: 'rk-check', for: id }, c, o.label), o.hint ? rk.h('div', { class: 'hint' }, o.hint) : null, rk.h('div', { class: 'err' })); }
    else { input = rk.h('input', { type: o.type || 'text', id, name: o.name, placeholder: o.placeholder || null, min: o.min, max: o.max, step: o.step, autocomplete: 'off' }); input.value = o.value == null ? '' : o.value; }
    if (o.required) input.setAttribute('aria-required', 'true');
    return rk.h('div', { class: 'rk-field' + (o.wide ? ' wide' : '') }, rk.h('label', { for: id }, o.label + (o.required ? ' *' : '')), input, o.hint ? rk.h('div', { class: 'hint' }, o.hint) : null, rk.h('div', { class: 'err' }));
  };

  // ---------- Live answers from Ricorsa's model ----------
  Object.defineProperty(rk, 'live', { get: () => !!(window.ricorsa && window.ricorsa.available) });
  /** ask(prompt, { system, search, history, format, onText }) -> Promise<{ text, sources, model, live }>; offline it returns a labeled sample derived from the prompt */
  rk.ask = async function (prompt, opts) {
    opts = opts || {};
    if (rk.live) { const r = await window.ricorsa.ask(prompt, opts); return Object.assign({ live: true }, r); }
    const text = 'Live answers work when this app is opened from Ricorsa. Sample answer for: ' + String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (typeof opts.onText === 'function') { try { opts.onText(text, text); } catch (e) {} }
    return { text, sources: [], model: '', live: false };
  };
  /** askInto(el, prompt, { button, sourcesEl, system, search, history, format: 'text'|'markdown', byline: true }) -> Promise<result> ; streams into el and disables the button meanwhile */
  rk.askInto = async function (el, prompt, opts) {
    opts = opts || {};
    const btn = opts.button; const md = opts.format === 'markdown';
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    el.classList.add('rk-answer'); if (md) el.classList.add('md');
    el.textContent = ''; el.setAttribute('aria-busy', 'true');
    let byline = el.parentElement ? el.parentElement.querySelector('.rk-byline[data-for="' + (el.id || '') + '"]') : null;
    try {
      const r = await rk.ask(prompt, Object.assign({}, opts, { onText: (d, all) => { if (md) el.innerHTML = rk.md(all); else el.textContent = all; if (typeof opts.onText === 'function') opts.onText(d, all); } }));
      if (md) el.innerHTML = rk.md(r.text); else el.textContent = r.text;
      if (opts.sourcesEl) { rk.clear(opts.sourcesEl); opts.sourcesEl.classList.add('rk-sources'); (r.sources || []).forEach(sc => opts.sourcesEl.appendChild(rk.h('span', { class: 'rk-badge', title: sc.url || '' }, (sc.n != null ? sc.n + ' · ' : '') + (sc.domain || sc.title || '')))); }
      if (opts.byline !== false) { if (!byline) { byline = rk.h('div', { class: 'rk-byline', data: { for: el.id || '' } }); el.insertAdjacentElement('afterend', byline); } byline.textContent = r.live ? 'Answered by Ricorsa' : 'Sample output. Live answers work when this app is opened from Ricorsa.'; }
      return r;
    } catch (e) {
      el.textContent = (e && e.message) || 'The answer could not be produced right now.'; el.classList.add('rk-muted');
      throw e;
    } finally { el.removeAttribute('aria-busy'); if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
  };
  /** md(text) -> safe HTML for headings, paragraphs, bold, italics, inline code, lists, quotes (no raw HTML, no links out) */
  rk.md = function (text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n'); const out = []; let list = null; let para = [];
    const inline = (t) => rk.esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { flushP(); flushL(); continue; }
      const h = /^(#{1,3})\s+(.*)$/.exec(l); const ul = /^[-*•]\s+(.*)$/.exec(l); const ol = /^\d+[.)]\s+(.*)$/.exec(l); const q = /^>\s?(.*)$/.exec(l);
      if (h) { flushP(); flushL(); out.push('<h' + (h[1].length + 1) + '>' + inline(h[2]) + '</h' + (h[1].length + 1) + '>'); }
      else if (ul || ol) { flushP(); const kind = ul ? 'ul' : 'ol'; if (list !== kind) { flushL(); list = kind; out.push('<' + kind + '>'); } out.push('<li>' + inline((ul || ol)[1]) + '</li>'); }
      else if (q) { flushP(); flushL(); out.push('<blockquote>' + inline(q[1]) + '</blockquote>'); }
      else { flushL(); para.push(l); }
    }
    flushP(); flushL();
    return out.join('');
  };

  // ---------- Keyboard shortcuts ----------
  /** shortcut({ 'mod+k': fn, 'n': fn, 'escape': fn }) : ignored while typing in a field (except mod combos) */
  rk.shortcut = function (map) {
    doc.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const combo = (e.metaKey || e.ctrlKey ? 'mod+' : '') + (e.shiftKey && e.key.length > 1 ? 'shift+' : '') + key;
      const fn = map[combo] || map[key === combo ? key : ''];
      if (!fn) return;
      if (typing && !combo.startsWith('mod+') && key !== 'escape') return;
      e.preventDefault(); fn(e);
    });
  };

  // ---------- Footer and boot ----------
  rk.footer = function () {
    if (rk.$('.rk-footer') || /Built by Ricorsa/i.test(doc.body.textContent || '')) return;
    const main = rk.$('.rk-main') || doc.body;
    main.appendChild(rk.h('footer', { class: 'rk-footer' }, 'Built by Ricorsa from your identity graph'));
  };
  const boot = () => { if (doc.body && doc.body.classList.contains('rk')) { try { rk.footer(); } catch (e) {} } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);

  window.rk = rk;
})();
