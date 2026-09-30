/**
 * The page as the model reads it. Runs inside the browsed page (page.evaluate) and walks the visible document in
 * reading order: headings, text, and every control the model may act on, each control tagged with a number the
 * model refers back to (`data-rk-ref`). Fields that take a password, a card number or a government id are listed
 * as protected: Ricorsa never fills them, whatever the model asks.
 *
 * Output: { url, title, text, refs, protected, scroll: { y, height, viewport }, more }
 *   text   the page in reading order with controls inline as [n|kind: label]; starts at the current scroll position
 *   refs   count of numbered controls on the page
 *   more   characters of text that did not fit
 */
export const SNAPSHOT_SRC = `((opts) => {
  const MAX = Math.max(1000, (opts && opts.maxChars) || 7000);
  const withRefs = !(opts && opts.noRefs);
  const startAt = (opts && opts.fromTop) ? 0 : (window.scrollY || 0) - 40;
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','HEAD','META','LINK','IFRAME','CANVAS','VIDEO','AUDIO','OBJECT','EMBED','SVG','PATH','SOURCE','TRACK','MAP']);
  const BLOCK = new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','NAV','ASIDE','UL','OL','LI','TR','TABLE','THEAD','TBODY','FORM','FIELDSET','BLOCKQUOTE','PRE','H1','H2','H3','H4','H5','H6','DL','DT','DD','FIGURE','FIGCAPTION','DETAILS','SUMMARY','ADDRESS','HR','BR','LABEL','OPTION']);
  const PROTECTED = /(pass(word|code|phrase)|pwd|\\bpin\\b|\\botp\\b|one.?time|2fa|verification.?code|security.?code|\\bcvv|\\bcvc|\\bcvn|card.?(number|no|num)|cc.?(num|number)|credit|debit|\\biban|routing|account.?(number|no)|\\bssn|social.?security|passport|national.?id|tax.?id|\\btin\\b|\\bein\\b|driver'?s?.?licen[cs]e|licen[cs]e.?(number|no)|\\bsin\\b|\\bnin\\b)/i;
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const cut = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const visible = (el) => {
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      if (el.getAttribute('aria-hidden') === 'true' || el.hidden) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    } catch (e) { return true; }
  };
  const docTop = (el) => { try { return el.getBoundingClientRect().top + (window.scrollY || 0); } catch (e) { return 0; } };
  const labelledBy = (el) => { const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean); return ids.map(id => { const n = document.getElementById(id); return n ? clean(n.textContent) : ''; }).filter(Boolean).join(' '); };
  const labelFor = (el) => {
    let s = clean(el.getAttribute('aria-label')) || labelledBy(el);
    if (!s && el.labels && el.labels.length) s = clean(Array.from(el.labels).map(l => clean(l.textContent).replace(clean(el.textContent), '')).join(' '));
    if (!s && el.id) { const l = document.querySelector('label[for="' + el.id.replace(/"/g, '\\\\"') + '"]'); if (l) s = clean(l.textContent); }
    if (!s) { const p = el.closest('label'); if (p) s = clean(clean(p.textContent).replace(clean(el.textContent), '')); }
    if (!s) s = clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title')) || clean(el.getAttribute('alt'));
    if (!s && (el.tagName === 'INPUT') && /^(submit|button|reset)$/i.test(el.type || '')) s = clean(el.value);
    if (!s) s = clean(el.innerText || el.textContent);
    if (!s) { const img = el.querySelector && el.querySelector('img[alt]'); if (img) s = clean(img.getAttribute('alt')); }
    if (!s) s = clean(el.getAttribute('name')) || clean(el.id);
    return cut(s, 80);
  };
  const isProtected = (el) => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    if (t === 'password') return true;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (/^(cc-|one-time-code|new-password|current-password)/.test(ac)) return true;
    const hay = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), labelledBy(el), (el.labels && el.labels.length ? Array.from(el.labels).map(l => l.textContent).join(' ') : ''), el.getAttribute('inputmode') === 'numeric' && el.getAttribute('maxlength') && +el.getAttribute('maxlength') >= 13 && +el.getAttribute('maxlength') <= 19 ? 'card number' : ''].map(clean).join(' | ');
    return PROTECTED.test(hay);
  };
  const role = (el) => (el.getAttribute('role') || '').toLowerCase();
  const kindOf = (el) => {
    const tag = el.tagName;
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'SELECT') return 'select';
    if (tag === 'TEXTAREA') return 'textarea';
    if (tag === 'SUMMARY') return 'button';
    if (tag === 'INPUT') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'hidden') return null;
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'file') return 'file';
      return 'input';
    }
    const r = role(el);
    if (r === 'button' || r === 'menuitem' || r === 'tab' || r === 'switch' || r === 'option') return 'button';
    if (r === 'link') return 'link';
    if (r === 'checkbox' || r === 'menuitemcheckbox') return 'checkbox';
    if (r === 'radio' || r === 'menuitemradio') return 'radio';
    if (r === 'textbox' || r === 'searchbox' || r === 'combobox' || el.isContentEditable) return 'input';
    if (el.hasAttribute('onclick') || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1' && /pointer/.test(getComputedStyle(el).cursor))) return 'button';
    return null;
  };
  const hrefOf = (el) => { try { const h = el.getAttribute('href') || ''; if (!h || /^(javascript:|#$)/i.test(h)) return ''; const u = new URL(h, location.href); return u.origin === location.origin ? (u.pathname + u.search) : u.href; } catch (e) { return ''; } };
  const items = []; let refs = 0; let protectedCount = 0;
  if (withRefs) document.querySelectorAll('[data-rk-ref]').forEach(n => n.removeAttribute('data-rk-ref'));
  const push = (top, text, block) => { if (!text) return; items.push({ top, text, block: !!block }); };
  const describe = (el, kind) => {
    const label = labelFor(el);
    if (kind === 'input' || kind === 'textarea') {
      if (isProtected(el)) { protectedCount++; return { text: 'protected field "' + (label || 'unnamed') + '" (Ricorsa will not fill this; the person types it)', kind: 'protected' }; }
      const t = (el.getAttribute('type') || (el.isContentEditable ? 'text' : kind === 'textarea' ? 'textarea' : 'text')).toLowerCase();
      const v = el.isContentEditable ? clean(el.textContent) : clean(el.value);
      return { text: (kind === 'textarea' ? 'textarea' : 'input ' + t) + ' "' + (label || 'unnamed') + '"' + (v ? ' = "' + cut(v, 60) + '"' : '') + (el.required ? ' (required)' : ''), kind };
    }
    if (kind === 'select') {
      const opts = Array.from(el.options || []).map(o => clean(o.textContent)).filter(Boolean);
      const sel = el.selectedIndex >= 0 && el.options[el.selectedIndex] ? clean(el.options[el.selectedIndex].textContent) : '';
      return { text: 'select "' + (label || 'unnamed') + '"' + (sel ? ' = "' + cut(sel, 40) + '"' : '') + ' options: ' + opts.slice(0, 12).map(o => cut(o, 30)).join(' | ') + (opts.length > 12 ? ' … (' + opts.length + ' total)' : ''), kind };
    }
    if (kind === 'checkbox' || kind === 'radio') { const on = el.checked || el.getAttribute('aria-checked') === 'true'; return { text: kind + ' "' + (label || 'unnamed') + '"' + (on ? ' (checked)' : ''), kind }; }
    if (kind === 'link') { const h = hrefOf(el); return { text: 'link "' + (label || h || 'unnamed') + '"' + (h && h !== label ? ' → ' + cut(h, 90) : ''), kind }; }
    if (kind === 'file') return { text: 'file upload "' + (label || 'unnamed') + '" (not available)', kind };
    const pressed = el.getAttribute('aria-expanded') === 'true' ? ' (open)' : el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' ? ' (selected)' : '';
    return { text: 'button "' + (label || 'unnamed') + '"' + pressed + (el.disabled ? ' (disabled)' : ''), kind };
  };
  const walk = (node) => {
    if (node.nodeType === 3) { const t = clean(node.nodeValue); if (t) push(docTop(node.parentElement || document.body), t, false); return; }
    if (node.nodeType !== 1) return;
    const el = node; const tag = el.tagName;
    if (SKIP.has(tag)) return;
    if (!visible(el)) return;
    const kind = kindOf(el);
    if (kind) {
      const d = describe(el, kind);
      if (withRefs && d.kind !== 'protected' && d.kind !== 'file') { refs++; el.setAttribute('data-rk-ref', String(refs)); push(docTop(el), '[' + refs + '|' + d.text + ']', true); }
      else push(docTop(el), '[' + d.text + ']', true);
      // A control's own text is its label; nothing inside it is walked, except a control that wraps a section.
      const r = el.getBoundingClientRect(); if (r.height < 160) return;
    }
    if (/^H[1-6]$/.test(tag)) { push(docTop(el), '#'.repeat(+tag[1]) + ' ' + cut(el.innerText || el.textContent, 160), true); return; }
    if (tag === 'IMG') { const alt = clean(el.getAttribute('alt')); if (alt && el.getBoundingClientRect().width > 40) push(docTop(el), '[image: ' + cut(alt, 80) + ']', false); return; }
    if (tag === 'OPTION') return;
    if (tag === 'TR') { const cells = Array.from(el.children).map(c => visible(c) ? cut(c.innerText || c.textContent, 60) : '').filter(Boolean); if (cells.length && !el.querySelector('a,button,input,select,textarea')) { push(docTop(el), cells.join(' | '), true); return; } }
    if (tag === 'LI') push(docTop(el), '•', true);
    const block = BLOCK.has(tag);
    if (block) push(docTop(el), '\\n', false);
    for (const c of Array.from(el.childNodes)) walk(c);
    if (block) push(docTop(el), '\\n', false);
  };
  walk(document.body || document.documentElement);
  // Join in document order, then keep from the current scroll position, so scrolling moves the text the model sees.
  let text = ''; let skipped = 0;
  const start = items.findIndex(i => i.top >= startAt && i.text !== '\\n');
  const from = start > 0 ? start : 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const piece = it.text === '\\n' ? '\\n' : (it.block ? '\\n' + it.text + '\\n' : ' ' + it.text);
    if (i < from) { if (it.text !== '\\n') skipped += it.text.length; continue; }
    text += piece;
  }
  text = text.replace(/[ \\t]+\\n/g, '\\n').replace(/\\n[ \\t]+/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').replace(/ {2,}/g, ' ').trim();
  const more = Math.max(0, text.length - MAX);
  if (more) text = text.slice(0, MAX);
  const dialog = document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]');
  return {
    url: location.href, title: clean(document.title) || location.hostname, text, refs, protected: protectedCount, skipped, more,
    scroll: { y: Math.round(window.scrollY || 0), height: Math.round(Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0)), viewport: Math.round(window.innerHeight || 0) },
    dialog: dialog && visible(dialog) ? cut(dialog.innerText || dialog.textContent, 200) : ''
  };
})`;

/** Clicks the numbered control: scrolls it into view and returns what it is, or a reason it cannot be pressed. */
export const CLICK_PREP_SRC = `((ref) => {
  const el = document.querySelector('[data-rk-ref="' + ref + '"]');
  if (!el) return { ok: false, why: 'There is no control [' + ref + '] on this page any more; read the page again for the current numbers.' };
  if (el.disabled) return { ok: false, why: 'Control [' + ref + '] is disabled.' };
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  let label = clean(el.getAttribute('aria-label'));
  if (!label && el.labels && el.labels.length) label = clean(Array.from(el.labels).map(l => clean(l.textContent).replace(clean(el.textContent), '')).join(' '));
  if (!label) { const p = el.closest('label'); if (p) label = clean(clean(p.textContent).replace(clean(el.textContent), '')); }
  if (!label) label = clean(el.innerText) || (el.tagName === 'INPUT' && /^(submit|button|reset)$/.test(type) ? clean(el.value) : '') || clean(el.textContent) || clean(el.getAttribute('title')) || clean(el.getAttribute('alt'));
  if (!label) { const img = el.querySelector && el.querySelector('img[alt]'); if (img) label = clean(img.getAttribute('alt')); }
  return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName, type, href: el.tagName === 'A' ? (el.getAttribute('href') || '') : '', target: el.getAttribute('target') || '', label: label.slice(0, 80) };
})`;

/** Finds the numbered field for typing and says whether Ricorsa may fill it. */
export const FIELD_PREP_SRC = `((ref) => {
  const el = document.querySelector('[data-rk-ref="' + ref + '"]');
  if (!el) return { ok: false, why: 'There is no control [' + ref + '] on this page any more; read the page again for the current numbers.' };
  const tag = el.tagName; const type = (el.getAttribute('type') || 'text').toLowerCase();
  const editable = tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || (tag === 'INPUT' && !/^(submit|button|reset|image|checkbox|radio|file|hidden|range|color)$/.test(type)) || /^(textbox|searchbox|combobox)$/.test((el.getAttribute('role') || '').toLowerCase());
  if (!editable) return { ok: false, why: 'Control [' + ref + '] is not a field that takes text.' };
  if (el.disabled || el.readOnly) return { ok: false, why: 'Field [' + ref + '] cannot be edited.' };
  if (type === 'password' || /^(cc-|one-time-code|new-password|current-password)/.test((el.getAttribute('autocomplete') || '').toLowerCase())) return { ok: false, protectedField: true };
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, tag, type, contentEditable: !!el.isContentEditable };
})`;

/** Picks an option in a numbered select by value or visible text; returns what is now selected. */
export const SELECT_SRC = `((ref, want) => {
  const el = document.querySelector('[data-rk-ref="' + ref + '"]');
  if (!el) return { ok: false, why: 'There is no control [' + ref + '] on this page any more; read the page again for the current numbers.' };
  if (el.tagName !== 'SELECT') return { ok: false, why: 'Control [' + ref + '] is not a drop-down list; click it instead, or type into it.' };
  const w = String(want || '').trim().toLowerCase();
  const opts = Array.from(el.options);
  let o = opts.find(x => (x.value || '').toLowerCase() === w) || opts.find(x => (x.textContent || '').trim().toLowerCase() === w) || opts.find(x => (x.textContent || '').trim().toLowerCase().startsWith(w)) || opts.find(x => (x.textContent || '').toLowerCase().includes(w));
  if (!o) return { ok: false, why: 'No option matches "' + String(want).slice(0, 40) + '". Options: ' + opts.slice(0, 20).map(x => (x.textContent || '').trim()).filter(Boolean).join(' | ') };
  el.value = o.value; o.selected = true;
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selected: (o.textContent || '').trim() };
})`;

/** Finds text on the page: each match with its surroundings and the nearest numbered controls; the first match is scrolled into view. */
export const FIND_SRC = `((needle, max) => {
  const q = String(needle || '').trim().toLowerCase(); if (!q) return { matches: [], total: 0 };
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const out = []; let total = 0; let first = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT; return clean(n.nodeValue).toLowerCase().includes(q) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement; if (!p) continue;
    const r = p.getBoundingClientRect(); if (r.width < 1 && r.height < 1) continue;
    total++;
    if (out.length >= (max || 8)) continue;
    if (!first) first = p;
    const t = clean(n.nodeValue); const i = t.toLowerCase().indexOf(q);
    const around = t.slice(Math.max(0, i - 120), Math.min(t.length, i + q.length + 160));
    // Controls near the match: the element itself if it is one, else the closest ancestors' and siblings' numbered controls.
    const scope = p.closest('li, tr, article, section, form, fieldset, div') || p;
    const refs = Array.from(scope.querySelectorAll('[data-rk-ref]')).slice(0, 6).map(el => '[' + el.getAttribute('data-rk-ref') + '|' + clean(el.getAttribute('aria-label') || el.innerText || el.value || el.textContent).slice(0, 50) + ']');
    const self = p.closest('[data-rk-ref]'); if (self && !refs.length) refs.push('[' + self.getAttribute('data-rk-ref') + '|' + clean(self.innerText || self.textContent).slice(0, 50) + ']');
    out.push({ text: around, refs });
  }
  if (first) first.scrollIntoView({ block: 'center' });
  return { matches: out, total };
})`;
