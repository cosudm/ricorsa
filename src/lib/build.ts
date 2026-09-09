/**
 * "Build it": turn a Discover idea into a working, self-contained web app. The model writes a
 * short plan and then a complete single-file HTML document, streamed as it is written so the
 * person watches it take shape; the finished document is stored and rendered in a sandboxed frame.
 * Every build carries a provenance id chained from the idea it came from and the graph it was drawn from.
 */
import { streamAnswer, type SystemBlock, type Msg } from './llm';
import { graphPromptBlock } from './graph';
import type { GraphData } from './db/schema';

export const BUILD_SYSTEM = `You are Ricorsa's builder. You turn an idea drawn from a person's identity graph into a working web application they can use right away.

What you produce
- One complete, self-contained HTML document: inline <style> and <script>, no external scripts, stylesheets, fonts, images or network calls of any kind (no fetch, no XMLHttpRequest, no WebSocket, no CDN, no iframes). Everything must work offline inside a sandboxed frame.
- Real functionality, not a mockup: working state, interactions, validation, keyboard support, and persistence in localStorage (wrap every localStorage access in try/catch and work without it). Seed the app with sensible starter data that fits the person, so it is useful the moment it opens.
- Personal to the person: use what the identity graph says about their topics, entities, goals, expertise and style to decide defaults, examples, vocabulary and depth. Never show the graph itself or mention that a profile exists.
- Design: clean, light theme, system font stack, generous spacing, responsive down to 360px wide, accessible (labels, focus states, contrast), no dark background. Put a small footer line "Built by Ricorsa from your identity graph" at the bottom.
- Robustness: no console errors, no unhandled exceptions, no alert/confirm/prompt dialogs, no eval. Keep the whole document under about 900 lines.
- If the idea describes an agent, service, or something that needs a backend, build the fully working client-side part (the workspace, the logic, the data model, simulations with realistic sample data) and make clear in the UI which parts would connect to live systems.

Output format, exactly, with nothing else before, between or after:
<plan>
Three to six short lines: what the app is, its main screens or parts, and the personal touches taken from the graph.
</plan>
<app>
<!doctype html>
...the complete HTML document...
</app>`;

export function buildSystem(graph: GraphData): SystemBlock[] {
  const profile = graphPromptBlock(graph);
  return [{ text: BUILD_SYSTEM, cache: true }, { text: (profile ? profile + '\n\n' : '') + `Today's date: ${new Date().toISOString().slice(0, 10)}.` }];
}

export function buildMessages(spec: { title: string; kind: string; what: string; prompt?: string; category?: string; builds?: string[] }, previous?: { html: string; changes: string } | null): Msg[] {
  const idea = [
    `Idea to build: ${spec.title}`,
    `Kind: ${spec.kind}${spec.category ? ` (from the ${spec.category} category of Discover)` : ''}`,
    `What it is: ${spec.what}`,
    spec.builds?.length ? `Draws on these parts of the graph: ${spec.builds.join(', ')}` : '',
    spec.prompt ? `The person's first question about it: ${spec.prompt}` : '',
  ].filter(Boolean).join('\n');
  if (previous) {
    return [
      { role: 'user', content: `${idea}\n\nHere is the current version of the app:\n\n${previous.html.slice(0, 120000)}\n\nRevise it with these changes, keeping everything else working:\n${previous.changes}\n\nReturn the full updated document in the required format.` },
    ];
  }
  return [{ role: 'user', content: `${idea}\n\nBuild it now.` }];
}

export type BuildParse = { plan: string; planDone: boolean; html: string; htmlDone: boolean };

/** Progressive parser for the builder's tagged output. */
export function parseBuild(raw: string): BuildParse {
  const t = raw || '';
  const pO = t.indexOf('<plan>'), pC = t.indexOf('</plan>');
  const aO = t.indexOf('<app>'), aC = t.lastIndexOf('</app>');
  const plan = pO >= 0 ? t.slice(pO + 6, pC > pO ? pC : (aO > pO ? aO : undefined)).trim() : '';
  let html = '';
  if (aO >= 0) html = t.slice(aO + 5, aC > aO ? aC : undefined);
  html = html.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return { plan, planDone: pC > pO, html, htmlDone: aC > aO };
}

/** Stamp the finished document with its provenance so a copy anywhere can be traced back. */
export function stampHtml(html: string, meta: { buildId: string; ideaId?: string | null; graphHash?: string | null; lineage?: string | null }): string {
  const comment = `<!-- Built by Ricorsa · build ${meta.buildId}${meta.ideaId ? ` · idea ${meta.ideaId}` : ''}${meta.graphHash ? ` · graph ${meta.graphHash}` : ''}${meta.lineage ? ` · lineage ${meta.lineage}` : ''} -->`;
  const tag = `<meta name="ricorsa-provenance" content="build=${meta.buildId}${meta.ideaId ? `;idea=${meta.ideaId}` : ''}${meta.graphHash ? `;graph=${meta.graphHash}` : ''}${meta.lineage ? `;lineage=${meta.lineage}` : ''}">`;
  let out = html;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => `${m}\n${tag}`);
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, m => `${m}\n<head>${tag}</head>`);
  else out = `<!doctype html><html><head>${tag}</head><body>${out}</body></html>`;
  return `${comment}\n${out}`;
}

export { streamAnswer };
