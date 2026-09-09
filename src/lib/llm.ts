import Anthropic from '@anthropic-ai/sdk';
import type { Source } from './search';

export type Tier = 'quick' | 'default' | 'complex';

export function modelFor(tier: Tier): string {
  if (tier === 'quick') return process.env.MODEL_QUICK || 'claude-haiku-4-5';
  if (tier === 'complex') return process.env.MODEL_COMPLEX || 'claude-opus-5';
  return process.env.MODEL_DEFAULT || 'claude-sonnet-5';
}

export function mockMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MOCK_LLM === '1';
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

/** Web search server-tool versions, newest first; an unknown version falls back to the next one. */
const SEARCH_TOOL_VERSIONS = [process.env.WEB_SEARCH_TOOL || 'web_search_20260318', 'web_search_20260209', 'web_search_20250305'];

export type SystemBlock = { text: string; cache?: boolean };
export type Msg = { role: 'user' | 'assistant'; content: string };
export type SearchOpts = { maxUses: number; allowedDomains?: string[] };
export type StreamResult = {
  text: string; truncated: boolean; model: string; sources: Source[];
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number; searches: number };
};

function domainOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function normUrl(url: string): string { return url.replace(/#.*$/, '').replace(/\/$/, ''); }

/**
 * Stream a completion. `onText` receives each delta of the answer text. With `search` set, the model
 * gets Anthropic's web search tool: results arrive as numbered sources (through `onSources`) while the
 * model is still working, and every citation the model attaches to a span is turned into a bracketed
 * marker `[n]` in the text stream, so the client renders it like any other citation.
 * The stable system block is marked for prompt caching so the instruction prefix is billed at the cache-read rate.
 */
export async function streamAnswer(opts: {
  tier: Tier; system: SystemBlock[]; messages: Msg[]; maxTokens: number; signal?: AbortSignal;
  search?: SearchOpts | null;
  onText: (delta: string) => void;
  onSources?: (sources: Source[]) => void;
  onStatus?: (text: string) => void;
}): Promise<StreamResult> {
  const model = modelFor(opts.tier);
  if (mockMode()) return mockStream(opts, model);
  const system = opts.system.map(b => b.cache ? ({ type: 'text' as const, text: b.text, cache_control: { type: 'ephemeral' as const } }) : ({ type: 'text' as const, text: b.text }));
  const messages = opts.messages.map((m, i) => ({
    role: m.role,
    content: i === opts.messages.length - 2 && opts.messages.length >= 4
      ? [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } }]  // cache the conversation prefix for follow-ups
      : m.content,
  }));

  let lastErr: unknown = null;
  for (const version of opts.search ? SEARCH_TOOL_VERSIONS : ['']) {
    const tools = opts.search
      ? [{ type: version, name: 'web_search', max_uses: opts.search.maxUses, ...(opts.search.allowedDomains?.length ? { allowed_domains: opts.search.allowedDomains } : {}) }]
      : undefined;
    try {
      return await runStream({ model, system, messages, maxTokens: opts.maxTokens, tools: tools as never, signal: opts.signal, onText: opts.onText, onSources: opts.onSources, onStatus: opts.onStatus });
    } catch (e) {
      lastErr = e;
      const err = e as { status?: number; message?: string };
      // An unsupported tool version is rejected before anything streams; try the previous version.
      if (opts.search && err?.status === 400 && /tool|type/i.test(String(err.message || '')) && version !== SEARCH_TOOL_VERSIONS[SEARCH_TOOL_VERSIONS.length - 1]) { console.warn('web search tool version rejected, falling back', version); continue; }
      throw e;
    }
  }
  throw lastErr;
}

async function runStream(o: {
  model: string; system: unknown; messages: unknown; maxTokens: number; tools?: unknown; signal?: AbortSignal;
  onText: (d: string) => void; onSources?: (s: Source[]) => void; onStatus?: (t: string) => void;
}): Promise<StreamResult> {
  let out = '';
  const sources: Source[] = [];
  const byUrl = new Map<string, number>();
  const emit = (t: string) => { out += t; o.onText(t); };
  const sourceFor = (url: string, title: string | null, snippet?: string): number => {
    const k = normUrl(url);
    let n = byUrl.get(k);
    if (!n) { n = sources.length + 1; byUrl.set(k, n); sources.push({ n, title: (title || domainOf(url) || url).slice(0, 140), domain: domainOf(url), url, snippet: snippet ? snippet.replace(/\s+/g, ' ').slice(0, 300) : undefined }); }
    else if (snippet && !sources[n - 1].snippet) sources[n - 1].snippet = snippet.replace(/\s+/g, ' ').slice(0, 300);
    return n;
  };

  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
  const messages = [...(o.messages as Array<{ role: string; content: unknown }>)];
  let truncated = false;
  // The server tool loop can pause a long turn (stop_reason "pause_turn"); continue it a few times.
  for (let round = 0; round < 4; round++) {
    const stream = client().messages.stream({ model: o.model, max_tokens: o.maxTokens, system: o.system as never, messages: messages as never, ...(o.tools ? { tools: o.tools as never } : {}) }, { signal: o.signal });
    const marked = new Map<number, Set<number>>();   // content block index -> source numbers already marked in it
    const toolInput = new Map<number, string>();

    stream.on('streamEvent', (ev) => {
      if (ev.type === 'content_block_start') {
        const b = ev.content_block as { type: string; content?: unknown };
        if (b.type === 'web_search_tool_result') {
          const content = b.content;
          if (Array.isArray(content)) {
            let added = false;
            for (const r of content as Array<{ type: string; url?: string; title?: string }>) {
              if (r.type !== 'web_search_result' || !r.url || !/^https?:\/\//.test(r.url)) continue;
              const before = sources.length; sourceFor(r.url, r.title || null); if (sources.length > before) added = true;
            }
            console.log('[search] results', content.length, 'sources', sources.length);
            if (added) o.onSources?.(sources.map(s => ({ ...s })));
          } else if (content && typeof content === 'object' && (content as { type?: string }).type === 'web_search_tool_result_error') {
            console.log('[search] error', (content as { error_code?: string }).error_code);
          }
        } else if (b.type === 'server_tool_use') { toolInput.set(ev.index, ''); }
      } else if (ev.type === 'content_block_delta') {
        const d = ev.delta as { type: string; text?: string; partial_json?: string; citation?: { type: string; url?: string; title?: string | null; cited_text?: string } };
        if (d.type === 'text_delta' && d.text) emit(d.text);
        else if (d.type === 'input_json_delta') toolInput.set(ev.index, (toolInput.get(ev.index) || '') + (d.partial_json || ''));
        else if (d.type === 'citations_delta' && d.citation && d.citation.type === 'web_search_result_location' && d.citation.url) {
          const n = sourceFor(d.citation.url, d.citation.title || null, d.citation.cited_text);
          const set = marked.get(ev.index) || new Set<number>();
          if (!set.has(n)) { set.add(n); marked.set(ev.index, set); emit(`[${n}]`); }
        }
      } else if (ev.type === 'content_block_stop' && toolInput.has(ev.index)) {
        try { const q = (JSON.parse(toolInput.get(ev.index) || '{}') as { query?: string }).query; if (q) o.onStatus?.(`Searching: ${String(q).slice(0, 80)}`); } catch { /* partial json */ }
        toolInput.delete(ev.index);
      }
    });

    const final = await stream.finalMessage();
    const u = final.usage as unknown as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } };
    usage.in += u.input_tokens || 0; usage.out += u.output_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; usage.searches += u.server_tool_use?.web_search_requests || 0;
    const cited = final.content.filter(c => c.type === 'text' && Array.isArray((c as { citations?: unknown[] }).citations) && (c as { citations: unknown[] }).citations.length).length;
    console.log('[answer]', JSON.stringify({ round, stop: final.stop_reason, searches: u.server_tool_use?.web_search_requests || 0, sources: sources.length, citedBlocks: cited, markers: (out.match(/\[\d{1,2}\]/g) || []).length, chars: out.length, model: o.model }));
    if (final.stop_reason === 'pause_turn' && round < 3) { messages.push({ role: 'assistant', content: final.content }); continue; }
    if (final.stop_reason === 'max_tokens' && round < 3 && out.trim().length > 0 && !/<\/learned>\s*$/.test(out)) {
      // Ran out of room mid-answer: hand the text back as a prefill and let the model carry on where it stopped.
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') messages.pop();
      messages.push({ role: 'assistant', content: out.replace(/\s+$/, '') });
      continue;
    }
    truncated = final.stop_reason === 'max_tokens';
    break;
  }
  return { text: out, truncated, model: o.model, sources, usage };
}

/** Small structured call (query planning, rewrites, Discover ideas). Returns parsed JSON or null. */
export async function quickJson<T = unknown>(prompt: string, maxTokens = 400): Promise<T | null> {
  if (mockMode()) return null;
  try {
    const res = await client().messages.create({ model: modelFor('quick'), max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
    const text = res.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('');
    const a = text.indexOf('['), b = text.lastIndexOf(']'); const oa = text.indexOf('{'), ob = text.lastIndexOf('}');
    const slice = a >= 0 && (oa < 0 || a < oa) ? text.slice(a, b + 1) : text.slice(oa, ob + 1);
    return JSON.parse(slice) as T;
  } catch (e) { console.warn('quickJson failed', e); return null; }
}

async function mockStream(opts: { system?: SystemBlock[]; messages: Msg[]; search?: SearchOpts | null; onText: (d: string) => void; onSources?: (s: Source[]) => void; onStatus?: (t: string) => void; signal?: AbortSignal }, model: string): Promise<StreamResult> {
  if (opts.system?.[0]?.text.startsWith("You are Ricorsa's builder")) return mockBuild(opts, model);
  const q = opts.messages[opts.messages.length - 1]?.content.split('Question:').pop()?.trim().slice(0, 80) || 'your question';
  const sources: Source[] = opts.search ? mockSources(q) : [];
  if (opts.search) { opts.onStatus?.(`Searching: ${q.slice(0, 60)}`); await new Promise(r => setTimeout(r, 300)); opts.onSources?.(sources); }
  const full = `<answer>
This is a mock answer for "${q}", streamed by the local development stub so the app can be exercised without API keys${sources.length ? '[1][2]' : ''}.

## What you are seeing
- **Sources** above arrived from the search stub the same way live web search results arrive in production, numbered in order of appearance${sources.length ? '[1]' : ''}.
- The answer streams token by token through the same server-sent-event channel production uses${sources.length ? '[3]' : ''}.
- When it finishes, the learned block below merges into your identity graph and the Graph page updates${sources.length ? '[2]' : ''}.

| Piece | Real mode | Mock mode |
|---|---|---|
| Retrieval | Anthropic web search | canned results |
| Model | Claude | this text |
| Graph | D1 | D1 |
</answer>
<related>
How does prompt caching lower the cost per answer?
What happens when a subscription lapses mid-month?
How is the identity graph kept private to one person?
Can Research mode run more than one search?
Where do exported files go?
</related>
<learned>
{"intent":"You are checking that the Ricorsa pipeline works end to end before wiring real keys","topics":["${q.replace(/"/g, '')}","developer testing"],"entities":["Ricorsa"],"goals":["ship the SaaS build"],"expertise":[{"area":"web development","level":"intermediate"}],"style":["wants a table"]}
</learned>`;
  for (let i = 0; i < full.length; i += 24) {
    if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    await new Promise(r => setTimeout(r, 15));
    opts.onText(full.slice(i, i + 24));
  }
  return { text: full, truncated: false, model, sources, usage: { in: 1200, out: 320, cacheRead: 900, cacheWrite: 0, searches: sources.length ? 1 : 0 } };
}

async function mockBuild(opts: { messages: Msg[]; onText: (d: string) => void; signal?: AbortSignal }, model: string): Promise<StreamResult> {
  const title = (opts.messages[0]?.content.match(/Idea to build: (.*)/) || [])[1] || 'Your app';
  const full = `<plan>
- A small working tracker for "${title}"
- One screen: add items, mark them done, see a running total
- Remembers everything in this browser
</plan>
<app>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#fbfbf9;color:#1b2228}main{max-width:640px;margin:0 auto;padding:32px 20px}h1{font-size:24px;margin:0 0 6px}p{color:#55606b}form{display:flex;gap:8px;margin:18px 0}input{flex:1;padding:10px 12px;border:1px solid #cfcfc7;border-radius:10px;font:inherit}button{padding:10px 14px;border:0;border-radius:10px;background:#2d5f8a;color:#fff;font:inherit;cursor:pointer}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e5e5df}li.done span{text-decoration:line-through;color:#8a939c}footer{margin-top:28px;font-size:12px;color:#8a939c}</style></head>
<body><main><h1>${title}</h1><p>A mock build from the development stub. Add a few items below.</p>
<form id="f"><input id="t" placeholder="Add something" aria-label="Add an item" required><button type="submit">Add</button></form>
<ul id="l"></ul><p id="c"></p><footer>Built by Ricorsa from your identity graph</footer></main>
<script>
var items=[];try{items=JSON.parse(localStorage.getItem('mock-items')||'[]')}catch(e){}
function save(){try{localStorage.setItem('mock-items',JSON.stringify(items))}catch(e){}}
function render(){var l=document.getElementById('l');l.innerHTML='';items.forEach(function(it,i){var li=document.createElement('li');if(it.done)li.className='done';var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!it.done;cb.onchange=function(){it.done=cb.checked;save();render()};var s=document.createElement('span');s.textContent=it.text;li.appendChild(cb);li.appendChild(s);l.appendChild(li)});document.getElementById('c').textContent=items.filter(function(x){return x.done}).length+' of '+items.length+' done'}
document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var t=document.getElementById('t');items.push({text:t.value,done:false});t.value='';save();render()});
render();
</script></body></html>
</app>`;
  for (let i = 0; i < full.length; i += 40) {
    if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    await new Promise(r => setTimeout(r, 12));
    opts.onText(full.slice(i, i + 40));
  }
  return { text: full, truncated: false, model, sources: [], usage: { in: 900, out: 700, cacheRead: 0, cacheWrite: 0, searches: 0 } };
}

function mockSources(query: string): Source[] {
  const base = [
    ['Rayleigh scattering', 'en.wikipedia.org', 'https://en.wikipedia.org/wiki/Rayleigh_scattering', 'Rayleigh scattering is the scattering of light by particles much smaller than the wavelength of the light, and it is proportional to the inverse fourth power of the wavelength.'],
    ['Why Is the Sky Blue?', 'spaceplace.nasa.gov', 'https://spaceplace.nasa.gov/blue-sky/en/', 'Blue light is scattered in all directions by the tiny molecules of air in Earth\'s atmosphere.'],
    ['Blue Sky and Rayleigh Scattering', 'hyperphysics.phy-astr.gsu.edu', 'http://hyperphysics.phy-astr.gsu.edu/hbase/atmos/blusky.html', 'The blue color of the sky is caused by the scattering of sunlight off the molecules of the atmosphere.'],
    ['Mie scattering', 'en.wikipedia.org', 'https://en.wikipedia.org/wiki/Mie_scattering', 'Mie scattering describes scattering by particles comparable in size to the wavelength, such as dust and water droplets.'],
  ];
  return base.map((b, i) => ({ n: i + 1, title: b[0], domain: b[1], url: b[2], snippet: b[3] + ' (mock result for: ' + query.slice(0, 40) + ')' }));
}
