/**
 * "Build it": turn a Discover idea into a working, self-contained web app, then keep building it in a
 * conversation. The model writes a short plan and a complete single-file HTML document, streamed as it
 * is written so the person watches it take shape; each request in the chat produces a new version, and
 * a plain question gets a plain answer. Every build carries a provenance id chained from the idea it came
 * from and the graph it was drawn from.
 */
import { streamAnswer, type SystemBlock, type Msg } from './llm';
import { graphPromptBlock } from './graph';
import type { GraphData, BuildCheck } from './db/schema';
export type { BuildCheck };

export const BUILD_SYSTEM = `You are Ricorsa's builder. You turn an idea drawn from a person's identity graph into a finished web application they can use right away, and you keep improving it as they talk to you. Build it the way a senior product engineer would build a first release for a paying customer: complete, personal, careful, and pleasant to use.

What you produce
- One complete, self-contained HTML document: inline <style> and <script>, no external scripts, stylesheets, fonts, images or network calls of any kind (no fetch, no XMLHttpRequest, no WebSocket, no CDN, no iframes, no <link href=http...>). Everything must work offline inside a sandboxed frame. Blob URLs and data: URLs created in the page are fine (for downloads and generated images); WebCrypto (crypto.subtle) is fine; inline SVG is fine.
- Real functionality, not a mockup: working state, interactions, validation with messages next to the field, keyboard support, and persistence in localStorage under one versioned key (wrap every localStorage access in try/catch and work without it). Seed the app with realistic starter data that fits the person, so it is useful and convincing the moment it opens. Every control does something. Every screen in the navigation exists.
- Personal to the person: use what the identity graph says about their topics, entities, goals, expertise and style to decide the defaults, the examples, the seed data, the vocabulary and the depth. Someone who reads it should feel it was made for them. Never show the graph itself or mention that a profile exists.
- Design: clean and light. A white or off-white page background with dark text; never a dark theme or dark panels as the base, whatever the subject, unless the person explicitly asks for dark. One accent colour. System font stack, a real type scale, generous spacing, a layout that works from 360px wide to a large screen without horizontal scrolling, accessible (labels on every input, visible focus states, contrast, aria-current on the active navigation item). A small footer line "Built by Ricorsa from your identity graph" at the bottom.
- Robustness: no console errors, no unhandled exceptions, no alert/confirm/prompt dialogs (use in-page messages and confirmations), no eval, no reliance on features that need a server (the one live service is window.ricorsa.ask, below). Scripts must be free of syntax errors: write plain modern JavaScript (ES2020), declare before use, and do not reference ids or functions that do not exist. Keep the whole document under about 1800 lines.
- If the idea needs a backend or a live service, build the fully working client-side part: the workspace, the logic, the data model, and realistic simulations with sample data. Label simulated parts plainly in the UI ("Demo data", "Simulated wallet") without breaking the flow. Simulated output must depend on the input; the same canned text for different inputs, invented citations, invented model names or invented "sources" are defects.

Live answers from Ricorsa's model (use this for anything a model should do)
- When the idea needs a model at any point (answers to a question, chat, summaries, drafts, rewriting, translation, classification, extraction, tagging, suggestions), do not fake it. Ricorsa gives the running app a live line: window.ricorsa.ask(prompt, options) returns a Promise of { text, sources, model }. Options: system (the app's standing instructions for the model, a string), onText(delta, textSoFar) called as the answer streams, search (true to have Ricorsa search the web first; the sources then arrive in the result and through onSources(sources), each { n, title, domain, url }), history (earlier exchanges as [{ role: "user" | "assistant", content }], oldest first), personal (default true: the model knows the person the way Ricorsa does), format ("text", the default, gives plain text the app can set as textContent; "markdown" only when the app renders Markdown itself).
- The line exists only while the app runs inside Ricorsa. Test for it with window.ricorsa && window.ricorsa.available. When it is absent (a downloaded copy opened on its own), say so once in the interface ("Live answers work when this app is opened from Ricorsa") and keep everything else usable with labeled sample output.
- Stream the text into the interface as it arrives, keep the control that started the request disabled until the promise settles, show the error message when it rejects (plans have limits), and show sources when search was used. A small line such as "Answered by Ricorsa" under the result is enough; never present the output as coming from any other product or model.
- Never call fetch, XMLHttpRequest or any URL for a model; window.ricorsa.ask is the only way, and it needs no network permission of its own.

Structure that makes the app checkable (follow it exactly)
- Each screen is a container with data-screen="name"; exactly one screen is shown at a time, the rest hidden with the hidden attribute. Each navigation control that opens a screen is a <button type="button" data-screen="name"> (or an <a href="#name">), with the same name as the container it opens.
- Actions are <button type="button"> with a clear label; forms submit with a submit button and a submit handler that prevents the default. Links to outside websites are not used at all.
- Modals and drawers have a visible Close button. Confirmations happen inside the page.
- State lives in one object; every change goes through one save() and one render(), so the screen always matches the data and the reload matches the screen.

By kind of idea
- Apps: several screens with real navigation, create/edit/delete, search or filter, sorting where lists get long, and a settings screen that actually changes behaviour.
- Tools: one focused job done well: clear inputs, instant output, copy and download buttons, a history of past runs, sensible defaults, worked examples.
- Agents: an agent workspace: the goal and rules it works from (editable), a run button that executes a visible step-by-step loop over realistic sample data, a log or timeline of what it did and why, and approvals for anything consequential.
- Decentralized (dApps, DIDs, credentials, consent, token gating, data unions): make the decentralized parts real where a browser can do it. Generate a key pair with WebCrypto (ECDSA P-256) and derive a did:key style identifier from it; sign credentials, receipts and claims with the private key and verify them with the public key, showing the JSON and the signature; keep a local append-only ledger in localStorage; simulate the wallet or network with a clearly labeled demo wallet and demo peers. Show verification succeeding and, when data is tampered with, failing.
- Data and credentials (exports, schemas, datasets, badges): show the schema, the rows, validation, and real export to JSON and CSV through download links built from Blob URLs; badges and claims are signed as above.
- Content (courses, newsletters, talks, playbooks): an outline editor with sections, drafting aids, word counts, reading time, and export to Markdown and HTML.

Definition of done (the version you return is the one the person uses; a real browser will open it, press every control and open every screen, and anything that throws, does nothing, leads nowhere or shows placeholder copy comes back to you as a finding to fix)
- Every button, link, tab, menu item and form control does exactly what its label says. Nothing is decorative, nothing is disabled without a reason shown next to it, nothing says "coming soon".
- Every screen the navigation names exists, is reachable, and has content or an empty state that says what to do.
- Every flow works end to end: create, edit, delete, search or filter, export, settings, undo where it matters. Walk each one through before you write the closing tag: what happens on the first click, what the screen shows afterwards, what is saved.
- No placeholder copy (lorem ipsum, TODO, sample text that means nothing), no console errors, no dead handlers.
- Saved data reloads correctly; a change request keeps the person's stored data loading (migrate the stored shape when the model changes).

Conversation
- The first message describes the idea. Later messages ask for changes, report findings from the browser check, or ask questions about the app.
- For a change request or a list of findings, change only what is asked and keep the person's data model stable so their saved data still loads. When the change touches a few places, return edits (the <edits> form below) rather than the whole document: each edit copies a short, unique stretch of the current document exactly as it is (two to forty lines, including enough surrounding lines to be unique) and gives the text that replaces it. When the change is broad (more than about a third of the document), return the full document instead.
- For a question or a comment that needs no change, answer briefly in the reply form below instead of rebuilding.
- After every version, suggest what to build next: four short requests the person could send as the next step, each a concrete enhancement to this particular app (a new screen or feature it is missing, a smarter default, an integration to simulate, a design refinement). Phrase each as a request, like "Add a monthly view with totals".

Output format, exactly, with nothing else before, between or after. Either
<plan>
Four to eight short lines: what the app is (or what changed this time), its screens or parts, the data it keeps, and the personal touches taken from the graph.
</plan>
<app>
<!doctype html>
...the complete HTML document...
</app>
<next>
Four next-step requests, one per line, no numbering
</next>
or, for a change or fixes that touch a few places of an existing document,
<plan>
One short line per change.
</plan>
<edits>
<edit>
<find>
...lines copied exactly from the current document, unique in it...
</find>
<replace>
...the lines that take their place (empty to delete)...
</replace>
</edit>
...more <edit> blocks as needed, in document order...
</edits>
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
  'Decentralized': 'This is a decentralized idea: real keys, signatures and verification in the browser, with a labeled demo wallet and peers.',
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
  msgs.push({ role: 'user', content: `Here is the current version of the app:\n\n${current.html.slice(0, 120000)}\n\nMy request: ${request}\n\nIf this asks for a change, return it in the required format: <edits> when it touches a few places (each <find> copied exactly from the document above), the full document only when the change is broad. If it is only a question, answer with <reply>.` });
  // Keep the alternation valid: merge consecutive same-role messages.
  const out: Msg[] = [];
  for (const m of msgs) { const last = out[out.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else out.push({ ...m }); }
  return out;
}

export type BuildParse = { plan: string; planDone: boolean; html: string; htmlDone: boolean; edits: string; editsDone: boolean; reply: string; replyDone: boolean; next: string[] };

/** Progressive parser for the builder's tagged output. */
export function parseBuild(raw: string): BuildParse {
  const t = raw || '';
  const pO = t.indexOf('<plan>'), pC = t.indexOf('</plan>');
  const aO = t.indexOf('<app>'), aC = t.lastIndexOf('</app>');
  const eO = t.indexOf('<edits>'), eC = t.lastIndexOf('</edits>');
  const rO = t.indexOf('<reply>'), rC = t.indexOf('</reply>');
  const plan = pO >= 0 ? t.slice(pO + 6, pC > pO ? pC : (aO > pO ? aO : (eO > pO ? eO : undefined))).trim() : '';
  let html = '';
  if (aO >= 0) html = t.slice(aO + 5, aC > aO ? aC : undefined);
  html = html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const edits = eO >= 0 && aO < 0 ? t.slice(eO + 7, eC > eO ? eC : undefined) : '';
  const reply = rO >= 0 ? t.slice(rO + 7, rC > rO ? rC : undefined).trim() : '';
  // Next steps come after the document, the edits or the reply; only a closed block counts.
  const nFrom = Math.max(aC, eC, rC, 0);
  const nO = t.indexOf('<next>', nFrom), nC = nO >= 0 ? t.indexOf('</next>', nO) : -1;
  const next = nC > nO ? t.slice(nO + 6, nC).split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(l => l.length > 3 && l.length <= 120).slice(0, 4) : [];
  return { plan, planDone: pC > pO, html, htmlDone: aC > aO, edits, editsDone: eC > eO, reply, replyDone: rC > rO, next };
}

export type EditResult = { html: string; applied: number; failed: string[]; total: number };

/**
 * Apply the builder's <edit> blocks to a document: each <find> is looked up exactly, then with whitespace runs
 * treated as equal, and replaced once. An edit whose text is not in the document (or is there more than once
 * after the loose match) is skipped and reported, so the caller can hand it back or fall back to a rewrite.
 */
export function applyEdits(html: string, edits: string): EditResult {
  const doc = html.replace(/\r\n?/g, '\n');
  let out = doc; let applied = 0; const failed: string[] = []; let total = 0;
  const re = /<edit>\s*<find>\n?([\s\S]*?)\n?<\/find>\s*<replace>\n?([\s\S]*?)\n?<\/replace>\s*<\/edit>/g;
  for (let m = re.exec(edits); m; m = re.exec(edits)) {
    total++;
    const find = stripFence(m[1]); const replace = stripFence(m[2]);
    if (!find.trim()) { failed.push('an edit with an empty find'); continue; }
    let at = out.indexOf(find);
    let len = find.length;
    if (at < 0) {
      // The same text with any run of whitespace matching any other run (indentation and blank lines drift).
      const pattern = find.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const loose = new RegExp(pattern, 'g');
      const first = loose.exec(out);
      if (first && !loose.exec(out)) { at = first.index; len = first[0].length; }
    }
    if (at < 0) { failed.push(find.trim().split('\n')[0].trim().slice(0, 80)); continue; }
    out = out.slice(0, at) + replace + out.slice(at + len);
    applied++;
  }
  return { html: out, applied, failed, total };
}
function stripFence(s: string): string { return s.replace(/^\s*```[a-z]*\s*\n/i, '').replace(/\n\s*```\s*$/, ''); }

/** Next steps to offer when the builder gave none: sensible for the kind of app. */
export function nextStepsFallback(kind: string): string[] {
  const k = (kind || '').toLowerCase();
  if (/tool/.test(k)) return ['Add a history of past runs with one-click reuse', 'Add export to CSV and JSON', 'Add keyboard shortcuts for the main actions', 'Make it work well on a phone'];
  if (/agent/.test(k)) return ['Add an approvals queue for consequential steps', 'Let me edit the rules the agent works from', 'Add a timeline of every run with outcomes', 'Add a settings screen for pace and limits'];
  if (/dapp|decentral|credential|did/.test(k)) return ['Add a screen to import and verify a credential from JSON', 'Show the key pair and let me rotate it', 'Add a shareable, signed export of my data', 'Add an audit log of every signature'];
  if (/content|course|newsletter|playbook/.test(k)) return ['Add a reading-time and word-count panel per section', 'Add export to Markdown and HTML', 'Add a checklist of what is still missing', 'Add templates for common sections'];
  return ['Add a settings screen', 'Add search and filters to the main list', 'Add export and import of my data', 'Make it work well on a phone'];
}

/**
 * The repair request handed back to the builder after a check. Findings from the browser run are facts about
 * what happened when the app was used; the static audit's are what the code says.
 */
export function repairRequestFor(findings: string[], ran: boolean, failedEdits: string[] = []): string {
  const how = ran
    ? 'A real browser opened this version, pressed every visible control and opened every screen. It found these problems:'
    : 'A review of this version found parts that do not work:';
  const missed = failedEdits.length ? `\nYour last edits were applied except these, whose <find> text was not in the document (copy the lines exactly as they are, with their indentation, and include enough neighbouring lines to be unique): ${failedEdits.map(f => `"${f}"`).join(', ')}.` : '';
  return `${how}\n${findings.map(f => `- ${f}`).join('\n')}\nFix every one of them as <edits> (each <find> copied exactly from the current document); return the full document only if the fixes touch most of it. Keep everything else exactly as it is, including the data model, so saved data still loads. A control reported as doing nothing must visibly do what its label says; a screen the navigation names must exist as a container with that data-screen name and be shown when its control is pressed; errors must be gone; no browser dialogs, no network requests, no placeholder copy.${missed}`;
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
