/**
 * Static checks on a finished app document, run before a version is called done. They catch the ways a
 * generated app most often falls short of "everything works": buttons and links nothing handles, screens
 * the navigation points at that do not exist, and placeholder copy. Anything found goes back to the
 * builder for one repair pass, so the version the person receives has every control doing its job.
 */
export type AuditIssue = { kind: 'unwired' | 'missing' | 'placeholder'; detail: string };

const CONTROL_RE = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
function textOf(inner: string): string { return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** Does the script mention this token as an id, class, data attribute or string? */
function mentioned(scripts: string, token: string): boolean {
  if (!token) return false;
  return new RegExp(`(?<![\\w-])${escapeRe(token)}(?![\\w-])`).test(scripts);
}

export function auditApp(html: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  // With event delegation the handler for a control is not tied to its own attributes; nothing can be judged then.
  const delegated = /(?:document|body|window|\brootEl\b|\bapp\b|\bmain\b)\s*\.addEventListener\s*\(\s*['"]click['"]/.test(scripts) && /\.closest\s*\(|\.target\b|\.matches\s*\(/.test(scripts);
  const idsInMarkup = new Set([...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
  // Screens are containers (section, div, main...) carrying a data-screen style attribute; the controls that point at them do not count.
  const screensInMarkup = new Set([...markup.matchAll(/<(?!a\b|button\b)[a-z][a-z0-9-]*\b[^>]*\bdata-(?:screen|view|tab|page|panel|section)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));

  if (!delegated) {
    let n = 0;
    for (const m of markup.matchAll(CONTROL_RE)) {
      const tag = m[1].toLowerCase(); const a = attrsOf(m[2]); const label = textOf(m[3]).slice(0, 40);
      if (tag === 'a' && a.href && !/^#?$|^javascript:/i.test(a.href) && !a.href.startsWith('#')) continue; // a real link
      if (tag === 'a' && a.href && a.href.startsWith('#') && a.href.length > 1) continue; // in-page anchor, checked below
      const inline = Object.keys(a).some(k => k.startsWith('on'));
      const submit = tag === 'button' && (a.type || 'submit').toLowerCase() === 'submit' && /onsubmit\s*=|addEventListener\s*\(\s*['"]submit['"]|\.onsubmit\s*=/.test(html);
      const tokens = [a.id, ...(a.class || '').split(/\s+/), ...Object.keys(a).filter(k => k.startsWith('data-')), ...Object.keys(a).filter(k => k.startsWith('data-')).map(k => k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())), ...Object.entries(a).filter(([k]) => k.startsWith('data-')).map(([, v]) => v)].filter(Boolean);
      const wired = inline || submit || tokens.some(t => mentioned(scripts, t)) || (a['aria-controls'] && idsInMarkup.has(a['aria-controls']));
      if (!wired && label && n < 12) { n++; issues.push({ kind: 'unwired', detail: `the ${tag === 'a' ? 'link' : 'button'} "${label}" has no handler and does nothing` }); }
    }
  }
  // Screens the navigation names must exist, or at least be known to the script.
  for (const m of markup.matchAll(/<(?:a|button)\b[^>]*\b(?:href\s*=\s*["']#([^"'\s]+)["']|data-(?:screen|view|tab|page|panel|section)\s*=\s*["']([^"']+)["'])[^>]*>/gi)) {
    const name = (m[1] || m[2] || '').trim(); if (!name || name === '/' ) continue;
    if (idsInMarkup.has(name) || screensInMarkup.has(name) || mentioned(scripts, name)) continue;
    if (!issues.some(i => i.detail.includes(`"${name}"`))) issues.push({ kind: 'missing', detail: `the navigation points at "${name}" but no screen or element with that name exists` });
  }
  // Placeholder copy where real content should be.
  const visible = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const re of [/coming soon/i, /not (?:yet )?implemented/i, /under construction/i, /lorem ipsum/i, /\bTODO\b/, /this (?:feature|screen|section) (?:will|would) be/i, /\bplaceholder (?:text|content)\b/i]) {
    const hit = visible.match(re); if (hit) issues.push({ kind: 'placeholder', detail: `placeholder copy: "${visible.slice(Math.max(0, (hit.index || 0) - 30), (hit.index || 0) + hit[0].length + 30).trim()}"` });
  }
  return issues.slice(0, 16);
}

/** The repair request handed back to the builder. */
export function repairRequest(issues: AuditIssue[]): string {
  return `A review of this version found parts that do not work. Fix every one of them and return the complete updated document; keep everything else exactly as it is, including the data model.\n${issues.map(i => `- ${i.detail}`).join('\n')}\nEvery button, link, tab and menu item must do what its label says, every screen the navigation names must exist and be reachable, and no placeholder copy may remain.`;
}
