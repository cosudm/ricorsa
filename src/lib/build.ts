/**
 * "Build it": turn a Discover idea into a working, self-contained web app, then keep building it in a
 * conversation. The model writes a short plan and a complete single-file HTML document, streamed as it
 * is written so the person watches it take shape; each request in the chat produces a new version, and
 * a plain question gets a plain answer. Every build carries a provenance id chained from the idea it came
 * from and the graph it was drawn from.
 */
import { streamAnswer, type SystemBlock, type Msg } from './llm';
import { graphPromptBlock } from './graph';
import type { GraphData } from './db/schema';

export const BUILD_SYSTEM = `You are Ricorsa's builder. You turn an idea drawn from a person's identity graph into a working web application they can use right away, and you keep improving it as they talk to you.

What you produce
- One complete, self-contained HTML document: inline <style> and <script>, no external scripts, stylesheets, fonts, images or network calls of any kind (no fetch, no XMLHttpRequest, no WebSocket, no CDN, no iframes). Everything must work offline inside a sandboxed frame. Blob URLs and data: URLs created in the page are fine (for downloads and generated images); WebCrypto (crypto.subtle) is fine.
- Real functionality, not a mockup: working state, interactions, validation, keyboard support, and persistence in localStorage (wrap every localStorage access in try/catch and work without it). Seed the app with sensible starter data that fits the person, so it is useful the moment it opens. Every button does something. Every screen in the navigation exists.
- Personal to the person: use what the identity graph says about their topics, entities, goals, expertise and style to decide defaults, examples, vocabulary and depth. Never show the graph itself or mention that a profile exists.
- Design: clean and light. Always a white or off-white page background with dark text; never a dark theme or dark panels as the base, whatever the subject, unless the person explicitly asks for dark. System font stack, generous spacing, responsive down to 360px wide, accessible (labels, focus states, contrast). Put a small footer line "Built by Ricorsa from your identity graph" at the bottom.
- Robustness: no console errors, no unhandled exceptions, no alert/confirm/prompt dialogs, no eval. Keep the whole document under about 1100 lines.
- If the idea needs a backend or a live service, build the fully working client-side part: the workspace, the logic, the data model, and realistic simulations with sample data. Label simulated parts plainly in the UI ("Demo data", "Simulated wallet") without breaking the flow.

By kind of idea
- Apps: several screens with real navigation, create/edit/delete, search or filter, and a settings screen.
- Tools: one focused job done well: clear inputs, instant output, copy and download buttons, a history of past runs, sensible defaults.
- Agents: an agent workspace: the goal and rules it works from, a run button that executes a visible step-by-step loop over realistic sample data, a log or timeline of what it did and why, and approvals for anything consequential.
- Decentralized (dApps, DIDs, credentials, consent, token gating, data unions): make the decentralized parts real where a browser can do it. Generate a key pair with WebCrypto (ECDSA P-256) and derive a did:key style identifier from it; sign credentials, receipts and claims with the private key and verify them with the public key, showing the JSON and the signature; keep a local append-only ledger in localStorage; simulate the wallet or network with a clearly labelled demo wallet and demo peers. Show verification succeeding and, when data is tampered with, failing.
- Data and credentials (exports, schemas, datasets, badges): show the schema, the rows, validation, and real export to JSON and CSV through download links built from Blob URLs; badges and claims are signed as above.
- Content (courses, newsletters, talks, playbooks): an outline editor with sections, drafting aids, word counts, reading time, and export to Markdown and HTML.

Definition of done (check every item before you finish; the version you return is the one the person uses)
- Every button, link, tab, menu item and form control does exactly what its label says. Nothing is decorative, nothing is disabled without a reason shown next to it, nothing says "coming soon".
- Every screen the navigation names exists, is reachable, and has content or an empty state that says what to do.
- Every flow works end to end: create, edit, delete, search or filter, export, settings, undo where it matters. Walk each one through in your head before you write the closing tag.
- No placeholder copy (lorem ipsum, TODO, sample text that means nothing), no console errors, no dead handlers.
- Saved data reloads correctly; a change request keeps the person's stored data loading.

Conversation
- The first message describes the idea. Later messages ask for changes or ask questions about the app.
- For a change request, return the full updated document; keep everything else working and keep the person's data model stable so their saved data still loads.
- For a question or a comment that needs no change, answer briefly in the reply form below instead of rebuilding.
- After every version, suggest what to build next: four short requests the person could send as the next step, each a concrete enhancement to this app (a new screen or feature, a smarter default, an integration to simulate, a design refinement). Phrase each as a request, like "Add a monthly view with totals".

Output format, exactly, with nothing else before, between or after. Either
<plan>
Three to six short lines: what the app is (or what changed this time), its main screens or parts, and the personal touches taken from the graph.
</plan>
<app>
<!doctype html>
...the complete HTML document...
</app>
<next>
Four next-step requests, one per line, no numbering
</next>
or, for a question that needs no change,
<reply>
...a short plain answer...
</reply>`;

const KIND_HINT: Record<string, string> = {
  'Apps': 'This is an application.',
  'Tools': 'This is a tool: one focused job, instant results, copy and download.',
  'Agents': 'This is an agent: build the agent workspace with a visible run loop.',
  'Decentralized': 'This is a decentralized idea: real keys, signatures and verification in the browser, with a labelled demo wallet and peers.',
  'Data & credentials': 'This is a data or credential product: schema, rows, validation, signed claims, real exports.',
  'Content': 'This is content: outline, drafting, exports.',
};

export function buildSystem(graph: GraphData): SystemBlock[] {
  const profile = graphPromptBlock(graph);
  return [{ text: BUILD_SYSTEM, cache: true }, { text: (profile ? profile + '\n\n' : '') + `Today's date: ${new Date().toISOString().slice(0, 10)}.` }];
}

export type BuildSpec = { title: string; kind: string; what: string; prompt?: string; category?: string; builds?: string[] };
export type BuildTurn = { role: 'user' | 'assistant'; text: string };

/**
 * A version row counts as being written right now while its status is "building" and it has been touched
 * within this window; the build stream touches its row regularly. Older "building" rows were interrupted
 * (a dropped connection, a killed worker) and are treated as failed.
 */
export const LIVE_WINDOW_MS = 120_000;
export function isLiveBuild(row: { status: string; updatedAt: Date | number | string }): boolean {
  return row.status === 'building' && Date.now() - new Date(row.updatedAt).getTime() < LIVE_WINDOW_MS;
}
/** A "building" row nobody has touched for a while: the stream that was writing it is gone. */
export function isStaleBuild(row: { status: string; updatedAt: Date | number | string }): boolean {
  return row.status === 'building' && !isLiveBuild(row);
}
export const INTERRUPTED = 'interrupted';

/**
 * The message list for a build session: the idea, then the conversation so far, then the current document and
 * the new request. With no finished document yet (a first version being started again), the person's notes
 * so far are folded into the idea so the first version already takes them into account.
 */
export function buildMessages(spec: BuildSpec, history: BuildTurn[], current: { html: string } | null, request: string | null): Msg[] {
  const idea = [
    `Idea to build: ${spec.title}`,
    `Kind: ${spec.kind}${spec.category ? ` (from the ${spec.category} category of Discover). ${KIND_HINT[spec.category] || ''}` : ''}`,
    `What it is: ${spec.what}`,
    spec.builds?.length ? `Draws on these parts of the graph: ${spec.builds.join(', ')}` : '',
    spec.prompt ? `The person's first question about it: ${spec.prompt}` : '',
  ].filter(Boolean).join('\n');
  if (!current) {
    const first = history.find(t => t.role === 'user');
    const notes = [...history.filter(t => t.role === 'user' && t !== first).map(t => t.text), request || ''].map(n => n.trim()).filter(Boolean);
    const extra = notes.length ? `\n\nThe person added these notes before the first version was finished; follow them from the start:\n${notes.map(n => `- ${n}`).join('\n')}` : '';
    return [{ role: 'user', content: `${idea}${extra}\n\nBuild it now.` }];
  }
  const msgs: Msg[] = [{ role: 'user', content: `${idea}\n\nBuild it now.` }];
  if (!request) return msgs;
  // Earlier turns as plain text (plans and replies only; the documents themselves are not repeated).
  msgs.push({ role: 'assistant', content: '<plan>\n(built)\n</plan>' });
  for (const t of history.slice(-8)) msgs.push({ role: t.role, content: t.role === 'assistant' ? `<reply>\n${t.text}\n</reply>` : t.text });
  msgs.push({ role: 'user', content: `Here is the current version of the app:\n\n${current.html.slice(0, 120000)}\n\nMy request: ${request}\n\nIf this asks for a change, return the full updated document in the required format. If it is only a question, answer with <reply>.` });
  // Keep the alternation valid: merge consecutive same-role messages.
  const out: Msg[] = [];
  for (const m of msgs) { const last = out[out.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else out.push({ ...m }); }
  return out;
}

export type BuildParse = { plan: string; planDone: boolean; html: string; htmlDone: boolean; reply: string; replyDone: boolean; next: string[] };

/** Progressive parser for the builder's tagged output. */
export function parseBuild(raw: string): BuildParse {
  const t = raw || '';
  const pO = t.indexOf('<plan>'), pC = t.indexOf('</plan>');
  const aO = t.indexOf('<app>'), aC = t.lastIndexOf('</app>');
  const rO = t.indexOf('<reply>'), rC = t.indexOf('</reply>');
  const plan = pO >= 0 ? t.slice(pO + 6, pC > pO ? pC : (aO > pO ? aO : undefined)).trim() : '';
  let html = '';
  if (aO >= 0) html = t.slice(aO + 5, aC > aO ? aC : undefined);
  html = html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const reply = rO >= 0 ? t.slice(rO + 7, rC > rO ? rC : undefined).trim() : '';
  // Next steps come after the document (or the reply); only a closed block counts.
  const nFrom = Math.max(aC, rC, 0);
  const nO = t.indexOf('<next>', nFrom), nC = nO >= 0 ? t.indexOf('</next>', nO) : -1;
  const next = nC > nO ? t.slice(nO + 6, nC).split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(l => l.length > 3 && l.length <= 120).slice(0, 4) : [];
  return { plan, planDone: pC > pO, html, htmlDone: aC > aO, reply, replyDone: rC > rO, next };
}

/** Next steps to offer when the builder gave none: sensible for the kind of app. */
export function nextStepsFallback(kind: string): string[] {
  const k = (kind || '').toLowerCase();
  if (/tool/.test(k)) return ['Add a history of past runs with one-click reuse', 'Add export to CSV and JSON', 'Add keyboard shortcuts for the main actions', 'Make it work well on a phone'];
  if (/agent/.test(k)) return ['Add an approvals queue for consequential steps', 'Let me edit the rules the agent works from', 'Add a timeline of every run with outcomes', 'Add a settings screen for pace and limits'];
  if (/dapp|decentral|credential|did/.test(k)) return ['Add a screen to import and verify a credential from JSON', 'Show the key pair and let me rotate it', 'Add a shareable, signed export of my data', 'Add an audit log of every signature'];
  if (/content|course|newsletter|playbook/.test(k)) return ['Add a reading-time and word-count panel per section', 'Add export to Markdown and HTML', 'Add a checklist of what is still missing', 'Add templates for common sections'];
  return ['Add a settings screen', 'Add search and filters to the main list', 'Add export and import of my data', 'Make it work well on a phone'];
}

/** Stamp the finished document with its provenance so a copy anywhere can be traced back. Earlier stamps are replaced. */
export function stampHtml(html: string, meta: { buildId: string; ideaId?: string | null; graphHash?: string | null; lineage?: string | null }): string {
  const comment = `<!-- Built by Ricorsa · build ${meta.buildId}${meta.ideaId ? ` · idea ${meta.ideaId}` : ''}${meta.graphHash ? ` · graph ${meta.graphHash}` : ''}${meta.lineage ? ` · lineage ${meta.lineage}` : ''} -->`;
  const tag = `<meta name="ricorsa-provenance" content="build=${meta.buildId}${meta.ideaId ? `;idea=${meta.ideaId}` : ''}${meta.graphHash ? `;graph=${meta.graphHash}` : ''}${meta.lineage ? `;lineage=${meta.lineage}` : ''}">`;
  let out = html.replace(/<!--\s*Built by Ricorsa[^>]*-->\s*/g, '').replace(/\s*<meta name="ricorsa-provenance"[^>]*>/g, '');
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => `${m}\n${tag}`);
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, m => `${m}\n<head>${tag}</head>`);
  else out = `<!doctype html><html><head>${tag}</head><body>${out}</body></html>`;
  return `${comment}\n${out}`;
}

export { streamAnswer };
