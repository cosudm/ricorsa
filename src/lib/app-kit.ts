/**
 * The Ricorsa app kit: a design system (CSS) and a runtime (window.rk) inlined into every app the studio builds,
 * so each deliverable starts from professional components instead of whatever the model improvises. The builder
 * writes against the documented API below and never sees the kit's code: it is stripped from the document the
 * builder is shown and put back after every version and every edit (`withKit`), and it travels inside the single
 * HTML file, so a downloaded copy works on its own. Sources: src/lib/app-kit/kit.css and kit.js, bundled by
 * scripts/build-kit.mjs into app-kit.generated.ts.
 */
import { KIT_CSS, KIT_JS } from './app-kit.generated';

export const KIT_VERSION = 1;
const OPEN = `<style data-ricorsa-kit="${KIT_VERSION}">`;
const STYLE_RE = /<style data-ricorsa-kit="[^"]*">[\s\S]*?<\/style>\s*/g;
const SCRIPT_RE = /<script data-ricorsa-kit="[^"]*">[\s\S]*?<\/script>\s*/g;

/** The document without the kit, as the builder sees it and edits it. */
export function stripKit(html: string): string {
  return html.replace(STYLE_RE, '').replace(SCRIPT_RE, '');
}

/** The document with the current kit at the top of <head>, whatever version it had before. */
export function withKit(html: string): string {
  const bare = stripKit(html);
  const tag = `${OPEN}\n${KIT_CSS}\n</style>\n<script data-ricorsa-kit="${KIT_VERSION}">\n${KIT_JS}\n</script>\n`;
  const head = /<head[^>]*>/i.exec(bare);
  if (head) return bare.slice(0, head.index + head[0].length) + '\n' + tag + bare.slice(head.index + head[0].length);
  const htmlTag = /<html[^>]*>/i.exec(bare);
  if (htmlTag) return bare.slice(0, htmlTag.index + htmlTag[0].length) + `\n<head>\n${tag}</head>` + bare.slice(htmlTag.index + htmlTag[0].length);
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${tag}</head>\n<body class="rk">\n${bare}\n</body>\n</html>`;
}

/** Whether a document carries the kit (any version). */
export function hasKit(html: string): boolean { return /<script data-ricorsa-kit="/.test(html); }

/**
 * The kit as the builder reads it: what exists, what each thing does, how to call it. Everything here is
 * available in the running app before the app's own script runs; nothing here needs to be written again.
 */
export const KIT_DOC = `The Ricorsa app kit (already in the document; do not write it, do not link it, do not redefine its classes or window.rk)
The kit is inlined at the top of <head> by Ricorsa before the document is saved, so it is present in the browser and in every downloaded copy even though you never see its code. Put class="rk" on <body> to get its base styles (light background, system type, focus rings, [hidden] hides). Set the app's accent with one CSS rule: :root{--rk-accent:#1F6F5C;--rk-accent-soft:#E3F1ED;--rk-accent-line:#B6D8CE}. Everything in the kit is prefixed rk- (CSS) or lives on window.rk (JS); write only the CSS and JS that is specific to this app.

Layout classes
- .rk-app (sidebar + main grid; stacks on phones) > .rk-side (with .rk-brand > .rk-logo + name, nav.rk-nav of <button type="button" data-screen="x">, .rk-side-foot) + .rk-main > .rk-top (title bar: h1, .rk-spacer, actions) + .rk-content (the screens).
- Screens: <section class="rk-screen" data-screen="home"> ... one shown at a time; rk.router handles the switching, hidden attribute, aria-current and the URL hash.
- .rk-page-h (title row: h1/h2 + .rk-sub + actions on the right), .rk-row, .rk-stack, .rk-grid (auto cards), .rk-cols-2, .rk-cols-3, .rk-split (2:1), .rk-spacer, .rk-divider, .rk-toolbar.
- .rk-card (+ .pad, or .rk-card-h header + .rk-card-body), .rk-stat > .l label, .v value, .d delta (.up/.down).
Controls
- .rk-btn (+ .primary, .ghost, .danger, .sm, .lg, .icon, .busy while working), .rk-seg (segmented: buttons with aria-pressed), .rk-tabs > .rk-tab[aria-selected], .rk-chip[aria-pressed], .rk-menu via rk.menu.
- .rk-field > label + input/select/textarea + .hint + .err (error text shown when the field has .invalid); .rk-form (two columns, .wide spans both) + .rk-form-actions; .rk-check, .rk-switch (input + span.t), .rk-search (wrap an input).
- .rk-badge (+ .accent/.good/.warn/.bad, optional <i class="dot">), .rk-notice (+ .good/.warn/.bad/.info), .rk-progress > i (width in %), .rk-timeline > .rk-tl-item (.when, .t; + .good/.warn/.bad), .rk-list > .rk-list-item (.t title, .s subtitle, .grow), .rk-empty, .rk-skel, .rk-kbd, .rk-muted, .rk-small, .rk-num, .rk-truncate, .rk-mono.
- Tables: .rk-table-wrap > table.rk-table (th.num/td.num for numbers); or let rk.table build it.
window.rk (JS; every function is safe to call at any time after the document loads)
- rk.h(tag, attrs, ...children): element builder. attrs: class, id, type, value, placeholder, data:{}, aria:{}, style:{}, html (trusted string), text, onClick/onInput/onChange/onSubmit/onKeydown (any onX). Children: strings, nodes, arrays, null. rk.render(el, stringOrNodeOrArray), rk.clear(el), rk.esc(s), rk.$(sel), rk.$$(sel), rk.id(prefix), rk.debounce(fn, ms).
- rk.store(key, { version, initial, migrate(oldData, oldVersion) }) -> { get(), set(data), update(fn), on(fn), reset() }: versioned localStorage state that works without storage. Use exactly one store per app; every change goes through update() then render().
- rk.router({ initial, onChange(name) }) -> { go(name), current(), names() }: wires every [data-screen] control to its screen.
- rk.toast(text, { kind: 'ok' | 'bad' | 'info', action: { label, onClick } }), rk.undoable(text, undoFn) (a toast with Undo: use it after every delete), rk.confirm({ title, text, ok, cancel, danger }) -> Promise<boolean>, rk.prompt({ title, label, value, multiline }) -> Promise<string | null>, rk.modal({ title, body, actions: [{ label, kind, onClick(api), close }], wide, onClose }) -> { close(), body }, rk.menu(button, [{ label, onClick, danger }]). Never use alert, confirm or prompt from the browser.
- rk.download(filename, textOrBlob, type), rk.toCSV(rows, columns?), rk.parseCSV(text), rk.copy(text) -> Promise<boolean>.
- rk.fmt.num(n, digits), .int(n), .money(n, 'USD'), .compact(n), .pct(n), .date(v, 'short' | 'long'), .dateTime(v), .time(v), .iso(v), .rel(v) ("3 days ago"), .bytes(n), .duration(ms), .plural(n, 'item'), .title(s); rk.today(), rk.addDays(v, n).
- rk.sortBy(arr, keyOrFn, 'asc' | 'desc'), rk.groupBy, rk.countBy, rk.sum, rk.avg, rk.uniq, rk.search(items, query, fields) (every word must match), rk.range(n), rk.clamp(n, lo, hi).
- rk.table(el, { columns: [{ key, label, num, render(row) -> string | node, sortable, width, digits }], rows, sort: { key, dir }, search, searchFields, pageSize, empty: { title, text, action: { label, onClick } }, onRow(row), rowKey, selected, noun }) -> { update({ rows, search, sort }), state, rows() }: a sortable, searchable, paged data table with an empty state; call update({ rows }) after every change.
- rk.chart.bars(el, { labels, values, format, height, color }), rk.chart.line(el, { labels, series: [{ name, values, color }], format, height }), rk.chart.spark(el, values), rk.chart.donut(el, { parts: [{ label, value, color }], format, centerLabel }): real SVG charts with axes, gridlines, value labels and tooltips.
- rk.field({ label, name, type: 'text' | 'number' | 'date' | 'email' | 'select' | 'textarea' | 'checkbox', value, options, hint, required, placeholder, wide }) -> a .rk-field element; rk.validate(form, { name: ['required', 'max:80'], amount: ['required', 'number', 'min:0'], email: ['email'], when: ['date'], other: [{ test: (value, values) => boolean, message }] }) -> { ok, values, errors } and shows each message under its field.
- rk.empty({ title, text, icon, action: { label, onClick } }) -> element for an empty list.
- rk.ask(prompt, { system, search, history, format, onText }) -> Promise<{ text, sources, model, live }>: Ricorsa's model, with a labeled sample answer when the app runs outside Ricorsa (rk.live is false). rk.askInto(el, prompt, { button, sourcesEl, system, search, history, format: 'text' | 'markdown' }) streams the answer into el, disables the button meanwhile, lists sources and adds the "Answered by Ricorsa" line. rk.md(text) renders Markdown to safe HTML.
- rk.shortcut({ 'mod+k': fn, 'n': fn, 'escape': fn }): keyboard shortcuts that stay out of the way while typing.
- The footer line "Built by Ricorsa from your identity graph" is added by the kit; do not write it.`;
