'use strict';
/* =====================================================================
   The file viewer's renderer. It runs inside a sandboxed frame that the app opens (openFileViewer in
   app.js). The app fetches a file's bytes and posts them here; this page draws them the way the file's
   own application would: Word documents as pages, workbooks as a grid with sheet tabs and a formula bar,
   decks as slides, code in an editor, Markdown and HTML rendered or as source. Nothing here can reach the
   app, its cookies or its data: the frame has no origin of its own. Libraries load only when needed.
   ===================================================================== */

const root = document.getElementById('root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tell = msg => window.parent.postMessage(Object.assign({ from: 'ricorsa-viewer' }, msg), '*');
const ICON_INFO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

// ---------- Loading libraries on demand ----------
const loaded = {};
function loadScript(src) {
  return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }));
}
function loadCss(href) {
  return loaded[href] || (loaded[href] = new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }));
}

// ---------- Text decoding ----------
function decodeText(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF))) return new TextDecoder(b[0] === 0xFF ? 'utf-16le' : 'utf-16be').decode(b.subarray(2));
  const utf8 = new TextDecoder('utf-8').decode(b);
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > 0 && bad > utf8.length / 200) { try { return new TextDecoder('windows-1252').decode(b); } catch { /* keep utf-8 */ } }
  return utf8.charCodeAt(0) === 0xFEFF ? utf8.slice(1) : utf8;
}
const MAX_TEXT = 2_000_000;
function capText(text) { return text.length > MAX_TEXT ? { text: text.slice(0, MAX_TEXT), note: 'This file is very large; the first 2 million characters are shown.' } : { text, note: '' }; }

// ---------- Small pieces ----------
function noteBar(text) { return text ? `<div class="note">${ICON_INFO}<span>${esc(text)}</span></div>` : ''; }
function seg(items, on) { return `<div class="seg" role="radiogroup">${items.map(([k, l]) => `<button type="button" data-seg="${k}" class="${k === on ? 'on' : ''}" role="radio" aria-checked="${k === on}">${l}</button>`).join('')}</div>`; }
/** Shrink `inner` (with CSS zoom) so content `contentWidth` px wide fits in `outer`; never enlarges. */
function fitZoom(outer, inner, contentWidth, pad) {
  const apply = () => { const w = outer.clientWidth - pad; inner.style.zoom = contentWidth > 0 && w < contentWidth ? String(Math.max(0.2, w / contentWidth)) : '1'; };
  apply(); window.addEventListener('resize', apply);
}

// ---------- Markdown (same rules as the app's answers) ----------
function inlineMd(s) {
  let out = esc(s);
  const codes = [];
  out = out.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  out = out.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g, (_, t, u) => `<img src="${u}" alt="${t}">`);
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
      i++;
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

// ---------- Code, like an editor ----------
const KEYWORDS = new Set(('abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of package private protected public return static super switch this throw true try typeof var void while with yield ' +
  'def elif except lambda pass raise None True False and or not is global nonlocal assert del print ' +
  'fn pub mut impl struct trait use mod match loop where crate self Self ' +
  'func go chan defer select map range type nil ' +
  'using namespace int long double char short unsigned signed float bool include define final ' +
  'select from where group by order having join inner left right outer on insert into values update set delete create table drop alter index primary key not null distinct limit offset union all exists between like is ' +
  'begin end then fi done esac local echo export').split(/\s+/));
const HASH_COMMENT = new Set(['.py', '.rb', '.sh', '.yaml', '.yml', '.toml', '.ini', '.conf', '.pl']);
const SLASH_COMMENT = new Set(['.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.h', '.cpp', '.cs', '.php', '.json']);
function highlight(text, ext) {
  const hash = HASH_COMMENT.has(ext), slash = SLASH_COMMENT.has(ext), sql = ext === '.sql', json = ext === '.json', html = ext === '.html' || ext === '.htm' || ext === '.xml' || ext === '.svg';
  const parts = [];
  if (slash) parts.push('(\\/\\*[\\s\\S]*?\\*\\/)', '(\\/\\/[^\\n]*)'); else parts.push('(?!x)x', '(?!x)x');
  parts.push(hash ? '(#[^\\n]*)' : sql ? '(--[^\\n]*)' : html ? '(<!--[\\s\\S]*?-->)' : '(?!x)x');
  parts.push('("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)');
  parts.push('(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b)');
  parts.push(html ? '(<\\/?[A-Za-z][^\\s>\\/]*)' : '(\\b[A-Za-z_]\\w*\\b)');
  const re = new RegExp(parts.join('|'), 'g'), colon = /\s*:/y;
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index)); last = m.index + m[0].length;
    const t = m[0];
    if (m[1] || m[2] || m[3]) out += `<span class="tk-c">${esc(t)}</span>`;
    else if (m[4]) { colon.lastIndex = last; out += `<span class="${json && t[0] === '"' && colon.test(text) ? 'tk-key' : 'tk-s'}">${esc(t)}</span>`; }
    else if (m[5]) out += `<span class="tk-n">${esc(t)}</span>`;
    else if (m[6]) out += html ? `<span class="tk-p">${esc(t)}</span>` : (KEYWORDS.has(t) || (sql && KEYWORDS.has(t.toLowerCase()))) ? `<span class="tk-k">${esc(t)}</span>` : esc(t);
    else out += esc(t);
  }
  return out + esc(text.slice(last));
}
function codeView(text, ext, { wrap = false, plain = false, note = '' } = {}) {
  const lines = text.split('\n');
  const body = plain ? esc(text) : highlight(text, ext);
  return `${noteBar(note)}<div class="fill"><div class="code${wrap ? ' wrap' : ''}"><div class="gutter" aria-hidden="true">${lines.map((_, i) => i + 1).join('\n')}</div><pre>${body}</pre></div></div>`;
}

// ---------- A grid, like a workbook window ----------
const MAX_ROWS = 5000, MAX_COLS = 256;
function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
/** sheets: [{ name, rows: [[{ v, t, f, l }]], widths?: [px], heights?: [px], merges?: [{ s:{r,c}, e:{r,c} }], truncated? }] */
function gridView(sheets, info) {
  root.innerHTML = `<div class="sheet"><div class="fbar"><div class="namebox" data-name></div><div class="fx">fx</div><div class="formula" data-formula></div></div><div class="gridwrap fill" data-grid></div><div class="tabs" data-tabs></div></div>`;
  const gridEl = root.querySelector('[data-grid]'), tabs = root.querySelector('[data-tabs]'), nameBox = root.querySelector('[data-name]'), formula = root.querySelector('[data-formula]');
  let active = 0;
  const paint = () => {
    const sh = sheets[active];
    // The grid continues past the data, as a workbook window does.
    const nRows = Math.max(Math.min(sh.rows.length, MAX_ROWS), 40);
    let nCols = 0; for (let r = 0; r < sh.rows.length && r < MAX_ROWS; r++) nCols = Math.max(nCols, sh.rows[r].length);
    nCols = Math.max(26, Math.min(nCols, MAX_COLS));
    const covered = new Set(), span = new Map();
    for (const m of (sh.merges || [])) {
      if (!m || !m.s || !m.e) continue;
      span.set(m.s.r + ':' + m.s.c, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(r + ':' + c);
    }
    const w = c => (sh.widths && sh.widths[c]) || 72;
    let html = `<table class="grid"><colgroup><col style="width:44px">${Array.from({ length: nCols }, (_, c) => `<col style="width:${w(c)}px">`).join('')}</colgroup><thead><tr><th class="rn corner"></th>${Array.from({ length: nCols }, (_, c) => `<th>${colName(c)}</th>`).join('')}</tr></thead><tbody>`;
    for (let r = 0; r < nRows; r++) {
      const row = sh.rows[r] || [];
      html += `<tr${sh.heights && sh.heights[r] ? ` style="height:${sh.heights[r]}px"` : ''}><td class="rn">${r + 1}</td>`;
      for (let c = 0; c < nCols; c++) {
        if (covered.has(r + ':' + c)) continue;
        const cell = row[c]; const sp = span.get(r + ':' + c);
        const attrs = sp ? ` rowspan="${sp.rs}" colspan="${sp.cs}"` : '';
        if (!cell || cell.v === '' || cell.v == null) { html += `<td${attrs} data-r="${r}" data-c="${c}"></td>`; continue; }
        const cls = cell.t === 'n' ? ' class="num"' : cell.t === 'b' ? ' class="bool"' : /\n/.test(cell.v) ? ' class="wrap"' : '';
        const v = esc(cell.v);
        html += `<td${cls}${attrs} data-r="${r}" data-c="${c}" title="${v}">${cell.l ? `<a href="${esc(cell.l)}" target="_blank" rel="noopener noreferrer">${v}</a>` : v}</td>`;
      }
      html += '</tr>';
    }
    gridEl.innerHTML = html + '</tbody></table>';
    tabs.innerHTML = sheets.map((s, i) => `<button type="button" data-tab="${i}" class="${i === active ? 'on' : ''}" title="${esc(s.name)}">${esc(s.name)}</button>`).join('') + `<span class="info">${sh.rows.length > MAX_ROWS ? `First ${MAX_ROWS.toLocaleString('en-US')} of ${sh.rows.length.toLocaleString('en-US')} rows · ` : ''}${sh.rows.length.toLocaleString('en-US')} row${sh.rows.length === 1 ? '' : 's'} × ${Math.max(1, ...sh.rows.slice(0, MAX_ROWS).map(r => r.length))} column${nCols === 1 ? '' : 's'} of data${info ? ' · ' + esc(info) : ''}</span>`;
    tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { active = +b.dataset.tab; paint(); }));
    nameBox.textContent = 'A1'; formula.textContent = '';
    const first = sh.rows[0] && sh.rows[0][0]; if (first && first.v != null) formula.textContent = first.f ? '=' + first.f : first.v;
  };
  gridEl.addEventListener('click', e => {
    const td = e.target.closest('td'); if (!td || td.classList.contains('rn') || td.dataset.r === undefined) return;
    gridEl.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel')); td.classList.add('sel');
    const r = +td.dataset.r, c = +td.dataset.c; const cell = (sheets[active].rows[r] || [])[c];
    nameBox.textContent = colName(c) + (r + 1); formula.textContent = cell ? (cell.f ? '=' + cell.f : (cell.v ?? '')) : '';
  });
  paint();
  return { count: sheets.length };
}
function parseDelimited(text, delim) {
  const rows = []; let row = [], field = '', q = false, i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; } field += ch; i++; continue; }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every(f => f === '')) rows.pop();
  return rows;
}
function delimitedSheet(name, text, ext) {
  const firstLine = (text.split(/\r?\n/).find(l => l.trim()) || '');
  const count = ch => (firstLine.match(new RegExp(ch === '|' ? '\\|' : ch, 'g')) || []).length;
  const delim = ext === '.tsv' ? '\t' : ['\t', ';', '|', ','].reduce((best, ch) => count(ch) > count(best) ? ch : best, ',');
  const rows = parseDelimited(text, delim).map(r => r.map(v => ({ v, t: /^\s*-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?\s*$/.test(v) ? 'n' : 's' })));
  const widths = []; for (const r of rows.slice(0, 200)) r.forEach((c, i) => { widths[i] = Math.max(widths[i] || 0, Math.min(320, 14 + Math.min(40, c.v.length) * 7)); });
  return { name, rows, widths: widths.map(w => Math.max(64, w)) };
}

// ---------- Renderers ----------
async function renderWorkbook(f) {
  tell({ type: 'status', text: 'Opening the workbook' });
  await loadScript('vendor/xlsx.full.min.js');
  const wb = XLSX.read(f.buffer, { type: 'array', cellText: true, cellNF: false });
  const sheets = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; const rows = []; let widths = [], heights = [], merges = [];
    if (ws && ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const hiddenRow = r => ws['!rows'] && ws['!rows'][r] && ws['!rows'][r].hidden;
      const hiddenCol = c => ws['!cols'] && ws['!cols'][c] && ws['!cols'][c].hidden;
      const colMap = []; for (let c = range.s.c; c <= range.e.c && colMap.length < MAX_COLS; c++) if (!hiddenCol(c)) colMap.push(c);
      widths = colMap.map(c => { const col = ws['!cols'] && ws['!cols'][c]; return col && (col.wpx || (col.wch ? Math.round(col.wch * 7 + 5) : 0)) || 72; });
      const rowMap = []; for (let r = range.s.r; r <= range.e.r; r++) if (!hiddenRow(r)) rowMap.push(r);
      heights = rowMap.map(r => { const rw = ws['!rows'] && ws['!rows'][r]; return rw && (rw.hpx || (rw.hpt ? Math.round(rw.hpt * 96 / 72) : 0)) || 0; });
      for (const r of rowMap) {
        const row = [];
        for (const c of colMap) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell || cell.t === 'z') { row.push(null); continue; }
          const v = cell.w != null ? cell.w : (cell.v instanceof Date ? cell.v.toLocaleDateString() : String(cell.v ?? ''));
          row.push({ v, t: cell.t === 'e' ? 's' : cell.t, f: cell.f, l: cell.l && /^https?:\/\//i.test(cell.l.Target || '') ? cell.l.Target : null });
        }
        rows.push(row);
      }
      // Merges are given in sheet coordinates; map them onto the visible rows and columns.
      const rIdx = new Map(rowMap.map((r, i) => [r, i])), cIdx = new Map(colMap.map((c, i) => [c, i]));
      merges = (ws['!merges'] || []).map(m => rIdx.has(m.s.r) && cIdx.has(m.s.c) ? { s: { r: rIdx.get(m.s.r), c: cIdx.get(m.s.c) }, e: { r: rIdx.get(Math.min(m.e.r, rowMap[rowMap.length - 1])) ?? rIdx.get(m.s.r), c: cIdx.get(Math.min(m.e.c, colMap[colMap.length - 1])) ?? cIdx.get(m.s.c) } } : null).filter(Boolean);
    }
    sheets.push({ name, rows, widths, heights, merges });
  }
  if (!sheets.length) throw new Error('The workbook has no sheets');
  gridView(sheets);
  return `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`;
}
function renderDelimited(f) {
  const { text, note } = capText(f.text != null ? f.text : decodeText(f.buffer));
  gridView([delimitedSheet(f.name.replace(/\.[^.]+$/, ''), text, f.ext)], note);
  return `${f.ext === '.tsv' ? 'Tab' : 'Comma'}-separated values`;
}
async function renderDocx(f) {
  tell({ type: 'status', text: 'Laying out the pages' });
  await loadScript('vendor/jszip.min.js'); await loadScript('vendor/docx-preview.min.js');
  root.innerHTML = '<div class="fill docx-host" data-host><div data-doc></div></div>';
  const host = root.querySelector('[data-host]'), el = root.querySelector('[data-doc]');
  await docx.renderAsync(f.buffer, el, null, { className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderComments: false, useBase64URL: true, experimental: true, trimXmlDeclaration: true, ignoreLastRenderedPageBreak: true });
  const pages = el.querySelectorAll('section.docx');
  if (!pages.length) throw new Error('No pages could be drawn from this document');
  fitZoom(host, el, pages[0].getBoundingClientRect().width, 24);
  return `${pages.length} page${pages.length === 1 ? '' : 's'}`;
}
function renderDeck(f) {
  return new Promise(async (resolve, reject) => {
    try {
      tell({ type: 'status', text: 'Drawing the slides' });
      await loadCss('vendor/pptx/pptxjs.css'); await loadCss('vendor/pptx/nv.d3.min.css');
      for (const s of ['jquery.min.js', 'jszip2.min.js', 'filereader.js', 'd3.min.js', 'nv.d3.min.js', 'dingbat.js', 'pptxjs.min.js']) await loadScript('vendor/pptx/' + s);
    } catch (e) { reject(e); return; }
    root.innerHTML = '<div class="fill deck" data-host><div id="slides"></div></div>';
    const host = root.querySelector('[data-host]');
    let settled = false, timer = null, limit = null;
    const finish = (err) => { if (settled) return; settled = true; window.removeEventListener('error', onError); clearInterval(timer); clearTimeout(limit); if (err) reject(err); else done(); };
    const onError = (e) => finish(new Error((e.error && e.error.message) || e.message || 'The deck could not be drawn'));
    window.addEventListener('error', onError);
    const url = URL.createObjectURL(new Blob([f.buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
    const done = () => {
      const slides = Array.from(host.querySelectorAll('.slide'));
      if (!slides.length) { reject(new Error('No slides could be drawn from this deck')); return; }
      const wrapper = host.querySelector('#all_slides_warpper') || host.querySelector('#slides');
      slides.forEach((s, i) => { const wrap = document.createElement('div'); wrap.className = 'slide-wrap'; wrap.style.width = s.style.width || s.offsetWidth + 'px'; s.parentNode.insertBefore(wrap, s); wrap.appendChild(s); const no = document.createElement('span'); no.className = 'slide-no'; no.textContent = String(i + 1); wrap.appendChild(no); });
      fitZoom(host, wrapper, slides[0].offsetWidth, 64);
      URL.revokeObjectURL(url);
      resolve(`${slides.length} slide${slides.length === 1 ? '' : 's'}`);
    };
    try { window.jQuery('#slides').pptxToHtml({ pptxFileUrl: url, slideMode: false, keyBoardShortCut: false, mediaProcess: true, jsZipV2: false, themeProcess: true }); }
    catch (e) { finish(e); return; }
    // PPTXjs has no completion callback: the wrapper it adds around the slides marks the end.
    timer = setInterval(() => { if (host.querySelector('#all_slides_warpper')) finish(); }, 120);
    limit = setTimeout(() => finish(new Error('The deck took too long to draw')), 90_000);
  });
}
function renderMarkdown(f) {
  const { text, note } = capText(f.text != null ? f.text : decodeText(f.buffer));
  const draw = (mode) => {
    root.innerHTML = `<div class="bar"><span>Markdown</span><span class="spacer"></span>${seg([['rendered', 'Rendered'], ['source', 'Source']], mode)}</div>` +
      (mode === 'rendered' ? `${noteBar(note)}<div class="fill paper-bg"><div class="page prose">${md(text)}</div></div>` : codeView(text, '.md', { plain: true, wrap: true, note }));
    root.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => draw(b.dataset.seg)));
  };
  draw('rendered');
  return 'Markdown';
}
function renderHtml(f) {
  const { text, note } = capText(f.text != null ? f.text : decodeText(f.buffer));
  const draw = (mode) => {
    root.innerHTML = `<div class="bar"><span>HTML</span><span class="spacer"></span>${seg([['rendered', 'Rendered'], ['source', 'Source']], mode)}</div>` +
      (mode === 'rendered' ? `${noteBar(note || 'Shown with scripts turned off.')}<div class="fill"><iframe class="htmlframe" sandbox="" title="Rendered HTML"></iframe></div>` : codeView(text, f.ext, { note }));
    const fr = root.querySelector('iframe'); if (fr) fr.srcdoc = text;
    root.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => draw(b.dataset.seg)));
  };
  draw('rendered');
  return 'HTML';
}
function renderCode(f) {
  let { text, note } = capText(f.text != null ? f.text : decodeText(f.buffer));
  if (f.ext === '.json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* shown as is */ } }
  root.innerHTML = codeView(text, f.ext, { note });
  return `${text.split('\n').length.toLocaleString('en-US')} lines`;
}
function renderPlain(f) {
  const { text, note } = capText(f.text != null ? f.text : decodeText(f.buffer));
  root.innerHTML = `${noteBar(note)}<div class="fill plain"><pre>${esc(text)}</pre></div>`;
  return `${text.split('\n').length.toLocaleString('en-US')} lines`;
}
/** The text Ricorsa read, laid out as pages (or as a grid when it came from a spreadsheet), for files nothing else can draw. */
function renderReadText(f) {
  const { text, note } = capText(f.text || '');
  const lead = f.note || '';
  if (!text.trim()) { root.innerHTML = `${noteBar(lead)}<div class="center">No text was read from this file.</div>`; return 'No text'; }
  if (/^\s*\[Sheet: /.test(text)) {
    const parts = text.split(/^\[Sheet: (.*?)\]\s*$/m); const sheets = [];
    for (let i = 1; i < parts.length; i += 2) sheets.push(delimitedSheet(parts[i], parts[i + 1].trim(), '.tsv'));
    gridView(sheets, lead); return `${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (as read)`;
  }
  const marker = /^\[(Page|Slide) (\d+)\]\s*$/m;
  const chunks = marker.test(text) ? text.split(/^\[(?:Page|Slide) \d+\]\s*$/m).map(s => s.trim()).filter(Boolean) : [text.trim()];
  const para = s => s.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');
  root.innerHTML = `${noteBar(lead || note)}<div class="fill paper-bg">${chunks.map(c => `<div class="page">${para(c)}</div>`).join('')}</div>`;
  return chunks.length > 1 ? `${chunks.length} pages of text` : 'Text as read';
}

// ---------- PDF: pages drawn with pdf.js, each with a text layer, so passages can be found and highlighted ----------
// Pages are laid out at once (placeholders sized from the first page) and drawn as they scroll into view. The text of
// every page is read up front, which is cheap, so Find can search the whole document before a page is drawn.
const PDF = { doc: null, pages: [], texts: [], scale: 1, host: null, observer: null };
async function renderPdf(f) {
  tell({ type: 'status', text: 'Opening the PDF' });
  await loadScript('vendor/pdfjs/pdf.min.js');
  const lib = window.pdfjsLib; if (!lib) throw new Error('The PDF library did not load');
  lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', location.href).href;
  const doc = await lib.getDocument({ data: new Uint8Array(f.buffer), isEvalSupported: false, disableFontFace: false }).promise;
  root.innerHTML = '<div class="fill pdf-host" data-host><div class="pdf-pages" data-pages></div></div>';
  const host = root.querySelector('[data-host]'), pagesEl = root.querySelector('[data-pages]');
  PDF.doc = doc; PDF.pages = []; PDF.texts = []; PDF.host = host;
  const first = await doc.getPage(1); const vp1 = first.getViewport({ scale: 1 });
  const avail = Math.max(320, host.clientWidth - 32);
  PDF.scale = Math.min(1.6, avail / vp1.width);
  for (let n = 1; n <= doc.numPages; n++) {
    const el = document.createElement('div'); el.className = 'pdf-page'; el.dataset.page = String(n);
    el.style.width = Math.floor(vp1.width * PDF.scale) + 'px'; el.style.height = Math.floor(vp1.height * PDF.scale) + 'px';
    el.innerHTML = `<span class="pdf-no">${n}</span>`;
    pagesEl.appendChild(el); PDF.pages.push({ n, el, drawn: false, drawing: null, textLayer: null });
  }
  if (PDF.observer) PDF.observer.disconnect();
  PDF.observer = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) drawPdfPage(Number(e.target.dataset.page)); }, { root: host, rootMargin: '600px 0px' });
  PDF.pages.forEach(p => PDF.observer.observe(p.el));
  // The text of every page, for Find; read in the background after the first pages are up.
  (async () => { for (let n = 1; n <= doc.numPages; n++) { if (PDF.doc !== doc) return; try { PDF.texts[n - 1] = await pdfPageText(doc, n); } catch { PDF.texts[n - 1] = ''; } } if (PDF.pending) { const q = PDF.pending; PDF.pending = null; findInDocument(q.query, q.dir); } })();
  return `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
}
async function pdfPageText(doc, n) {
  const page = await doc.getPage(n); const tc = await page.getTextContent();
  let out = '';
  for (const it of tc.items) { if (!('str' in it)) continue; out += it.str; if (it.hasEOL) out += '\n'; else if (it.str && !/\s$/.test(it.str)) out += ' '; }
  return out;
}
async function drawPdfPage(n) {
  const p = PDF.pages[n - 1]; if (!p || p.drawn || p.drawing) return;
  const doc = PDF.doc; if (!doc) return;
  p.drawing = (async () => {
    const page = await doc.getPage(n); if (PDF.doc !== doc) return;
    const vp = page.getViewport({ scale: PDF.scale }); const dpr = Math.min(2, window.devicePixelRatio || 1);
    p.el.style.width = Math.floor(vp.width) + 'px'; p.el.style.height = Math.floor(vp.height) + 'px';
    const canvas = document.createElement('canvas'); canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr); canvas.style.width = Math.floor(vp.width) + 'px'; canvas.style.height = Math.floor(vp.height) + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (PDF.doc !== doc) return;
    const layer = document.createElement('div'); layer.className = 'pdf-text'; layer.style.width = canvas.style.width; layer.style.height = canvas.style.height;
    // pdf.js 3.x sizes the text layer with this CSS variable.
    layer.style.setProperty('--scale-factor', String(vp.scale));
    p.el.appendChild(canvas); p.el.appendChild(layer);
    try { const tc = await page.getTextContent(); await window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: layer, viewport: vp, textDivs: [] }).promise; } catch (e) { console.warn('[viewer] text layer', e); }
    p.textLayer = layer; p.drawn = true;
    if (p.afterDraw) { const fn = p.afterDraw; p.afterDraw = null; fn(); }
  })().catch(e => console.warn('[viewer] page', n, e)).finally(() => { p.drawing = null; });
  return p.drawing;
}
/** Scroll a PDF page into view and draw it if it is not yet; resolves when its text layer exists. */
function showPdfPage(n) {
  return new Promise((resolve) => {
    const p = PDF.pages[n - 1]; if (!p) { resolve(null); return; }
    p.el.scrollIntoView({ block: 'start' });
    if (p.drawn) { resolve(p); return; }
    p.afterDraw = () => resolve(p); drawPdfPage(n);
  });
}

// ---------- Find and highlight, over whatever is on screen ----------
// The rendered text is read through a walker into one normalized string (lowercase, runs of whitespace collapsed)
// with a map back to the text nodes, so a phrase can be found across runs, cells and spans and wrapped in <mark>.
const FIND = { query: '', hits: [], index: -1, pdf: null };
const BLOCKS = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'TR', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'PRE', 'BLOCKQUOTE', 'BR', 'UL', 'OL', 'DT', 'DD', 'FIGCAPTION']);
function textIndex(rootEl, spanBoundaries) {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, { acceptNode(n) { const p = n.parentElement; if (!p || p.closest('script, style, noscript, .note, .pdf-no, .slide-no, .rn, thead, .fbar, .tabs, .bar')) return NodeFilter.FILTER_REJECT; return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
  const nodes = []; const map = []; let norm = ''; let lastSpace = true; let prevParent = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (nodes.length && !lastSpace) {
      // A boundary between two text nodes counts as a space when it crosses a block, or between the spans of a PDF text layer.
      let block = spanBoundaries; if (!block && parent !== prevParent) { let a = prevParent; while (a && a !== rootEl && !BLOCKS.has(a.tagName)) a = a.parentElement; let b = parent; while (b && b !== rootEl && !BLOCKS.has(b.tagName)) b = b.parentElement; block = a !== b; }
      if (block) { norm += ' '; map.push(map[map.length - 1]); lastSpace = true; }
    }
    const ni = nodes.push(n) - 1; const t = n.nodeValue;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (/\s/.test(ch)) { if (lastSpace) continue; norm += ' '; map.push([ni, i]); lastSpace = true; }
      else { const lc = ch.toLowerCase(); norm += lc.length === 1 ? lc : ch; map.push([ni, i]); lastSpace = false; }
    }
    prevParent = parent;
  }
  return { nodes, norm, map };
}
function normQuery(q) { return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
/** Wrap the normalized ranges [a, b) in <mark> elements; ranges are applied last to first so earlier offsets stay valid. */
function markRanges(idx, ranges, cls) {
  const marks = [];
  for (const [a, b] of ranges.slice().sort((x, y) => y[0] - x[0])) {
    const s = idx.map[a], e = idx.map[b - 1]; if (!s || !e) continue;
    const pieces = [];
    for (let ni = s[0]; ni <= e[0]; ni++) {
      const node = idx.nodes[ni]; if (!node || !node.parentNode) continue;
      const from = ni === s[0] ? s[1] : 0, to = ni === e[0] ? e[1] + 1 : node.nodeValue.length;
      if (to <= from) continue;
      pieces.push([node, from, to]);
    }
    const made = [];
    for (const [node, from, to] of pieces.reverse()) {
      let target = node;
      if (to < node.nodeValue.length) target.splitText(to);
      if (from > 0) target = target.splitText(from);
      const m = document.createElement('mark'); m.className = cls; target.parentNode.insertBefore(m, target); m.appendChild(target); made.unshift(m);
    }
    if (made.length) marks.unshift(made);
  }
  return marks;
}
function clearMarks(cls) {
  for (const m of Array.from(root.querySelectorAll('mark.' + cls))) { const parent = m.parentNode; while (m.firstChild) parent.insertBefore(m.firstChild, m); parent.removeChild(m); parent.normalize(); }
}
/** Find every occurrence of a phrase in the rendered document (or, for a PDF, in every page's text). */
function findInDocument(query, dir) {
  const q = normQuery(query);
  clearMarks('hit'); FIND.hits = []; FIND.index = -1; FIND.query = q;
  if (!q || q.length < 2) { tell({ type: 'found', count: 0, index: -1, query: q }); return; }
  if (PDF.doc) {
    if (PDF.texts.length < PDF.doc.numPages) { PDF.pending = { query, dir }; tell({ type: 'found', count: 0, index: -1, query: q, reading: true }); return; }
    const hits = [];
    PDF.texts.forEach((t, i) => { const n = normQuery(t); let at = n.indexOf(q); while (at >= 0 && hits.length < 2000) { hits.push({ page: i + 1, at }); at = n.indexOf(q, at + q.length); } });
    FIND.hits = hits; FIND.pdf = true;
    tell({ type: 'found', count: hits.length, index: hits.length ? 0 : -1, query: q });
    if (hits.length) gotoHit(0);
    return;
  }
  const idx = textIndex(root, false);
  const ranges = []; let at = idx.norm.indexOf(q);
  while (at >= 0 && ranges.length < 2000) { ranges.push([at, at + q.length]); at = idx.norm.indexOf(q, at + q.length); }
  FIND.hits = markRanges(idx, ranges, 'hit'); FIND.pdf = false;
  tell({ type: 'found', count: FIND.hits.length, index: FIND.hits.length ? 0 : -1, query: q });
  if (FIND.hits.length) gotoHit(0);
}
async function gotoHit(i) {
  if (!FIND.hits.length) return;
  FIND.index = ((i % FIND.hits.length) + FIND.hits.length) % FIND.hits.length;
  root.querySelectorAll('mark.hit.cur').forEach(m => m.classList.remove('cur'));
  if (FIND.pdf) {
    const h = FIND.hits[FIND.index]; const p = await showPdfPage(h.page); if (!p || !p.textLayer) { tell({ type: 'found', count: FIND.hits.length, index: FIND.index, query: FIND.query }); return; }
    // Mark every occurrence on this page; the current one is the nth on the page.
    clearMarks('hit');
    const idx = textIndex(p.textLayer, true); const ranges = []; let at = idx.norm.indexOf(FIND.query);
    while (at >= 0 && ranges.length < 500) { ranges.push([at, at + FIND.query.length]); at = idx.norm.indexOf(FIND.query, at + FIND.query.length); }
    const marks = markRanges(idx, ranges, 'hit');
    const onPage = FIND.hits.filter(x => x.page === h.page); const k = onPage.indexOf(h);
    const cur = marks[Math.min(k, marks.length - 1)];
    if (cur) { cur.forEach(m => m.classList.add('cur')); cur[0].scrollIntoView({ block: 'center' }); }
    tell({ type: 'found', count: FIND.hits.length, index: FIND.index, query: FIND.query, page: h.page });
    return;
  }
  const cur = FIND.hits[FIND.index]; cur.forEach(m => m.classList.add('cur')); cur[0].scrollIntoView({ block: 'center' });
  tell({ type: 'found', count: FIND.hits.length, index: FIND.index, query: FIND.query });
}
/**
 * Light one passage: the snippet a citation carries (the passage's first words), on the page it names when there is one.
 * Falls back to a shorter and shorter prefix of the snippet, since a rendered file's whitespace and line breaks differ
 * from the text that was read.
 */
/** From a match of the snippet, the end of the sentence it starts (so the whole sentence lights up), within reason. */
function sentenceEnd(norm, at, len, prose) {
  let end = at + len; if (!prose) return end;
  const limit = Math.min(norm.length, at + len + 420);
  for (let i = end; i < limit; i++) { const ch = norm[i]; if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= norm.length || norm[i + 1] === ' ' || norm[i + 1] === '"' || norm[i + 1] === '”')) return i + 1; }
  return end;
}
async function highlightPassage(m) {
  clearMarks('ctx');
  const snippet = normQuery(m.snippet); if (!snippet) { tell({ type: 'highlighted', ok: false }); return; }
  const prose = !m.sheet;
  const tries = [snippet, snippet.slice(0, 60), snippet.slice(0, 40), snippet.split(' ').slice(0, 4).join(' ')].filter((x, i, a) => x.length >= 8 && a.indexOf(x) === i);
  if (PDF.doc) {
    let pages = m.page ? [m.page] : [];
    if (!pages.length) { if (PDF.texts.length < PDF.doc.numPages) { await new Promise(r => { const t = setInterval(() => { if (PDF.texts.length >= PDF.doc.numPages) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 8000); }); } for (const q of tries) { PDF.texts.forEach((t, i) => { if (normQuery(t).includes(q)) pages.push(i + 1); }); if (pages.length) break; } }
    if (!pages.length) { tell({ type: 'highlighted', ok: false }); return; }
    const p = await showPdfPage(pages[0]); if (!p || !p.textLayer) { tell({ type: 'highlighted', ok: false, page: pages[0] }); return; }
    const idx = textIndex(p.textLayer, true);
    for (const q of tries) { const at = idx.norm.indexOf(q); if (at >= 0) { const marks = markRanges(idx, [[at, sentenceEnd(idx.norm, at, q.length, prose)]], 'ctx'); if (marks[0]) { marks[0][0].scrollIntoView({ block: 'center' }); tell({ type: 'highlighted', ok: true, page: pages[0] }); return; } } }
    tell({ type: 'highlighted', ok: false, page: pages[0] });
    return;
  }
  // Slides, sheets and the text-as-read pages have landmarks of their own to jump to first.
  if (m.slide) { const el = root.querySelectorAll('.deck .slide-wrap, .deck .slide')[m.slide - 1] || root.querySelectorAll('.page')[m.slide - 1]; if (el) el.scrollIntoView({ block: 'start' }); }
  else if (m.page && !m.sheet) { const el = root.querySelectorAll('section.docx')[m.page - 1] || root.querySelectorAll('.page')[m.page - 1]; if (el) el.scrollIntoView({ block: 'start' }); }
  else if (m.sheet) { const tab = Array.from(root.querySelectorAll('.tabs [data-tab]')).find(b => (b.textContent || '').trim() === m.sheet); if (tab && !tab.classList.contains('on')) tab.click(); }
  await new Promise(r => setTimeout(r, 30));
  const idx = textIndex(root, false);
  for (const q of tries) {
    const at = idx.norm.indexOf(q);
    if (at >= 0) { const marks = markRanges(idx, [[at, sentenceEnd(idx.norm, at, q.length, prose)]], 'ctx'); if (marks[0]) { marks[0][0].scrollIntoView({ block: 'center' }); tell({ type: 'highlighted', ok: true }); return; } }
  }
  tell({ type: 'highlighted', ok: false });
}

const RENDERERS = { sheet: renderWorkbook, csv: renderDelimited, docx: renderDocx, pptx: renderDeck, markdown: renderMarkdown, html: renderHtml, json: renderCode, code: renderCode, text: renderPlain, read: renderReadText, pdf: renderPdf };

window.addEventListener('message', async (e) => {
  if (e.source !== window.parent || !e.data) return;
  if (e.data.type === 'find') { findInDocument(e.data.query, 1); return; }
  if (e.data.type === 'findNext') { gotoHit(FIND.index + (e.data.dir < 0 ? -1 : 1)); return; }
  if (e.data.type === 'clearFind') { clearMarks('hit'); FIND.hits = []; FIND.index = -1; FIND.query = ''; return; }
  if (e.data.type === 'highlight') { highlightPassage(e.data); return; }
  if (e.data.type === 'clearHighlight') { clearMarks('ctx'); return; }
  if (e.data.type !== 'open') return;
  const f = e.data;
  PDF.doc = null; PDF.pages = []; PDF.texts = []; FIND.hits = []; FIND.index = -1; FIND.pdf = false; if (PDF.observer) { PDF.observer.disconnect(); PDF.observer = null; }
  const render = RENDERERS[f.kind] || renderReadText;
  root.innerHTML = '<div class="center"><span class="spinner"></span></div>';
  try {
    const info = await render(f);
    tell({ type: 'done', info: info || '' });
  } catch (err) {
    console.error('[viewer]', err);
    tell({ type: 'error', message: String((err && err.message) || err || 'Could not draw this file') });
  }
});
// Keys pressed while the frame has focus still work the viewer: Escape closes it, the arrows page through files.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea, [contenteditable]') && !e.target.closest('.gridwrap'))) tell({ type: 'key', key: e.key });
});
tell({ type: 'ready' });
