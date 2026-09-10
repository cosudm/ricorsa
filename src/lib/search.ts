/**
 * Live web retrieval. Ricorsa searches the web itself (Brave Search API), numbers the results, and hands
 * them to the model as context; the model cites them with [n] markers that the client turns into
 * citations. Research turns run several queries and read the top pages, so the report draws on more
 * than snippets.
 */
import type { SearchOpts } from './llm';
import { quickJson, mockMode, mockSources } from './llm';

export type Source = { n: number; title: string; domain: string; url: string; snippet?: string; text?: string };

/** How many searches a turn may run, by mode and focus. Writing focus answers without the web unless it is a Research turn. */
export function searchPlan(mode: 'search' | 'research', focus: string): SearchOpts | null {
  if (focus === 'writing' && mode !== 'research') return null;
  if (mode === 'research') return { maxUses: 6 };
  if (focus === 'math') return { maxUses: 1 };
  return { maxUses: 3 };
}

const FOCUS_SITES: Record<string, string> = {
  academic: ' (site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:.edu OR site:.gov OR site:scholar.google.com OR site:nature.com OR site:sciencedirect.com)',
  code: ' documentation',
};

function domainOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function normUrl(url: string): string { return url.replace(/#.*$/, '').replace(/\/$/, ''); }

type BraveResult = { title?: string; url?: string; description?: string; extra_snippets?: string[]; age?: string };

/** One Brave web search. Returns [] when the key is missing or the service is unavailable, so an answer can still be written. */
export async function braveSearch(query: string, count = 8, signal?: AbortSignal): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) { console.warn('[search] BRAVE_API_KEY is not set'); return []; }
  const u = new URL((process.env.BRAVE_BASE_URL || 'https://api.search.brave.com') + '/res/v1/web/search');
  u.searchParams.set('q', query.slice(0, 400)); u.searchParams.set('count', String(Math.min(20, Math.max(1, count))));
  u.searchParams.set('text_decorations', 'false'); u.searchParams.set('search_lang', 'en'); u.searchParams.set('extra_snippets', 'true');
  try {
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key }, signal });
    if (!res.ok) { console.warn('[search] brave', res.status, (await res.text().catch(() => '')).slice(0, 200)); return []; }
    const j = await res.json() as { web?: { results?: BraveResult[] } };
    return (j.web?.results || []).filter(r => r.url && /^https?:\/\//.test(r.url)).map(r => ({
      title: String(r.title || domainOf(r.url!)).slice(0, 140), url: r.url!,
      snippet: [r.description, ...(r.extra_snippets || []).slice(0, 2)].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 600),
    }));
  } catch (e) { console.warn('[search] brave failed', String((e as Error)?.message || e)); return []; }
}

/** Turn a question into search queries. One for a plain question; several angles for Research. */
export async function planQueries(question: string, mode: 'search' | 'research', focus: string, history: string[]): Promise<string[]> {
  const suffix = FOCUS_SITES[focus] || '';
  const base = question.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (mode !== 'research' || mockMode()) {
    // A follow-up that leans on earlier turns ("what about the second one?") searches better with the thread's topic attached.
    const short = base.length < 40 && history.length ? `${base} ${history[history.length - 1].slice(0, 80)}` : base;
    return [short + suffix];
  }
  const planned = await quickJson<string[]>(`Write 4 to 6 web search queries that together would let a careful analyst answer this question thoroughly: the core question, its key sub-questions, a source of numbers or data, and a counterpoint or alternative view. Each query under 12 words, specific, no quotes. Question: ${base}${history.length ? `\nEarlier in the conversation: ${history.slice(-2).join(' | ').slice(0, 300)}` : ''}\nReply with only a JSON array of strings.`, 300);
  const qs = (Array.isArray(planned) ? planned : []).map(q => String(q || '').trim()).filter(q => q.length > 3).slice(0, 6);
  return (qs.length >= 2 ? qs : [base, `${base} statistics`, `${base} criticism`]).map(q => q + suffix);
}

/** Run the queries, merge and number the results. */
export async function retrieve(queries: string[], perQuery: number, signal?: AbortSignal): Promise<{ sources: Source[]; searches: number }> {
  if (mockMode() && !process.env.BRAVE_API_KEY) return { sources: mockSources(queries[0] || ''), searches: queries.length };
  const lists = await Promise.all(queries.map(q => braveSearch(q, perQuery, signal)));
  const sources: Source[] = []; const seen = new Map<string, number>();
  // Interleave the lists so every query contributes its best results first.
  for (let i = 0; i < perQuery; i++) for (const list of lists) {
    const r = list[i]; if (!r) continue;
    const k = normUrl(r.url); if (seen.has(k)) continue;
    seen.set(k, sources.length + 1);
    sources.push({ n: sources.length + 1, title: r.title, domain: domainOf(r.url), url: r.url, snippet: r.snippet });
    if (sources.length >= 14) break;
  }
  return { sources: sources.slice(0, 14), searches: queries.length };
}

/** Read the top pages (Research mode): plain text, trimmed, with a short timeout each. */
export async function readPages(sources: Source[], max = 5, signal?: AbortSignal): Promise<void> {
  const picks = sources.slice(0, max);
  await Promise.all(picks.map(async s => {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      signal?.addEventListener('abort', () => ctl.abort());
      const res = await fetch(s.url, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; RicorsaBot/1.0; +https://ricorsa.com)' }, signal: ctl.signal, redirect: 'follow' });
      clearTimeout(t);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !/text\/html|text\/plain|application\/xhtml/.test(ct)) return;
      const html = (await res.text()).slice(0, 150000);
      s.text = htmlToText(html).slice(0, 7000);
    } catch { /* unreadable page: the snippet still counts */ }
  }));
}

export function htmlToText(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const main = h.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i); if (main && main[2].length > 800) h = main[2];
  h = h.replace(/<(?:nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, ' ');
  h = h.replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|blockquote|pre)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  h = h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return h.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 30).join('\n');
}

/** The numbered source block the model reads. Snippets for every source; page text for the ones that were read. */
export function sourcesBlock(sources: Source[]): string {
  if (!sources.length) return '';
  const lines = sources.map(s => `[${s.n}] ${s.title} (${s.domain}) ${s.url}\n${s.text ? s.text.slice(0, 7000) : (s.snippet || '')}`);
  return `Web sources retrieved just now for this question. Cite them with their number in square brackets, like [2], right after the claim they support. Only cite numbers from this list.\n\n${lines.join('\n\n')}`;
}
