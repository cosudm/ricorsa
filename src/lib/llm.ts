/**
 * The model layer. Two providers sit behind one streaming interface:
 *  - Kimi (Moonshot AI) through its OpenAI-compatible API: streamed chat completions, function calling for
 *    connector tools, and partial-mode continuation when an answer runs past the output limit.
 *  - Claude (Anthropic Messages API): streamed messages with adaptive thinking and an effort level, prompt
 *    caching on the system prompt, and tool use for connectors.
 * A tier's configured MODEL_* id picks the provider by its name (claude-* goes to Anthropic). When that
 * provider cannot serve (no key, key rejected, unknown model, overloaded) the next candidate for the tier
 * takes over, so the product keeps answering. Web retrieval happens before the call (src/lib/search.ts) and
 * the sources are handed to the model as numbered context; connectors are called by Ricorsa itself through MCP.
 */
import type { Source } from './search';
import { callMcpTool } from './mcp';

/**
 * quick: planning and small structured calls · default: answers · complex: Reasoning answers ·
 * build: writing apps in the Build studio · ideas: Discover ideas (the build model unless MODEL_IDEAS says otherwise).
 */
export type Tier = 'quick' | 'default' | 'complex' | 'build' | 'ideas';

const DEFAULT_MODELS: Record<Tier, string> = { quick: 'kimi-k3', default: 'kimi-k3', complex: 'kimi-k3', build: 'claude-fable-5-1', ideas: 'claude-fable-5-1' };
/** Model ids to try for each tier, best first. The configured MODEL_* id always comes first. */
const CANDIDATES: Record<Tier, string[]> = {
  quick: ['kimi-k3-turbo', 'kimi-k3', 'kimi-k2-turbo-preview', 'kimi-k2.5-turbo', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-latest', 'moonshot-v1-8k'],
  default: ['kimi-k3', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-k2-turbo-preview', 'kimi-latest', 'moonshot-v1-32k'],
  complex: ['kimi-k3', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-latest', 'moonshot-v1-128k'],
  // Apps are long, exacting documents: Claude first, then the strongest Kimi models thinking hard, then the code models.
  build: ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-latest'],
  ideas: ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'kimi-k3', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-latest'],
};

/** Claude models are served by Anthropic; everything else by Kimi. */
export function isClaude(model: string): boolean { return /^claude-/i.test(model); }

/**
 * Thinking effort per tier. Kimi K3 and the thinking models take `reasoning_effort`; Claude takes
 * `output_config.effort` (low, medium, high, xhigh, max) with adaptive thinking. Fast thinks little, Best a
 * moderate amount, Reasoning as much as it can, builds and ideas a lot. Override per tier with
 * REASONING_QUICK, REASONING_DEFAULT, REASONING_COMPLEX, REASONING_BUILD, REASONING_IDEAS (Kimi) and
 * EFFORT_QUICK, EFFORT_DEFAULT, EFFORT_COMPLEX, EFFORT_BUILD, EFFORT_IDEAS (Claude); "off" sends nothing.
 */
const DEFAULT_REASONING: Record<Tier, string> = { quick: 'low', default: 'medium', complex: 'max', build: 'max', ideas: 'high' };
const DEFAULT_EFFORT: Record<Tier, string> = { quick: 'low', default: 'medium', complex: 'max', build: 'high', ideas: 'high' };
const CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
function envFor(prefix: string, tier: Tier): string | undefined {
  const key = `${prefix}_${tier.toUpperCase()}`;
  return process.env[key];
}
/** Thinking models (Kimi K3, K2.6, K2.7 code and the K2 thinking variants) accept only the default temperature; leave it out for them. Claude with thinking takes none either. */
function temperatureFor(model: string, wanted: number | undefined): number | undefined {
  if (isClaude(model) || /k3|k2\.[6-9]|k2-?thinking|thinking|reason/i.test(model)) return undefined;
  return wanted ?? 0.6;
}
function reasoningFor(tier: Tier, model: string): string | null {
  if (isClaude(model)) return null;
  const v = envFor('REASONING', tier) || DEFAULT_REASONING[tier];
  if (v === 'off' || v === 'none') return null;
  return /k3|thinking|reason/i.test(model) || process.env.REASONING_ALWAYS === '1' ? v : null;
}
function effortFor(tier: Tier, model: string): string | null {
  if (!isClaude(model)) return null;
  const v = (envFor('EFFORT', tier) || DEFAULT_EFFORT[tier]).toLowerCase();
  if (v === 'off' || v === 'none') return null;
  return CLAUDE_EFFORTS.has(v) ? v : 'high';
}
function configured(tier: Tier): string {
  if (tier === 'quick') return process.env.MODEL_QUICK || DEFAULT_MODELS.quick;
  if (tier === 'complex') return process.env.MODEL_COMPLEX || DEFAULT_MODELS.complex;
  if (tier === 'build') return process.env.MODEL_BUILD || DEFAULT_MODELS.build;
  if (tier === 'ideas') return process.env.MODEL_IDEAS || process.env.MODEL_BUILD || DEFAULT_MODELS.ideas;
  return process.env.MODEL_DEFAULT || DEFAULT_MODELS.default;
}
/** The configured id for a tier (what the settings say); `resolveModel` checks it against what the accounts can actually use. */
export function modelFor(tier: Tier): string { return configured(tier); }
export const PROVIDER_NAME = 'Kimi';
/** The provider a model id belongs to, for logs and the admin screen. */
export function providerOf(model: string): 'Anthropic' | 'Kimi' { return isClaude(model) ? 'Anthropic' : 'Kimi'; }

let modelList: { ids: string[]; at: number } | null = null;
/** The Kimi model ids the provider account can use, cached for ten minutes. Empty when the list cannot be fetched. */
export async function availableModels(force = false): Promise<string[]> {
  if (!force && modelList && Date.now() - modelList.at < 600_000) return modelList.ids;
  try {
    const res = await fetch(`${apiBase()}/models`, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (!res.ok) { console.warn('[provider] models list', res.status); return modelList?.ids || []; }
    const j = await res.json() as { data?: Array<{ id?: string }> };
    const ids = (j.data || []).map(m => String(m.id || '')).filter(Boolean);
    modelList = { ids, at: Date.now() };
    return ids;
  } catch (e) { console.warn('[provider] models list failed', String((e as Error)?.message || e)); return modelList?.ids || []; }
}

/** Anthropic is skipped for a while after its key is rejected or the account has no credit, so builds do not wait on a dead door. A changed key is tried at once. */
let anthropicDown: { key: string; until: number } | null = null;
function anthropicUsable(): boolean { const k = anthropicKey(); return !!k && !(anthropicDown && anthropicDown.key === k && Date.now() < anthropicDown.until); }
function markAnthropicDown(why: string) { anthropicDown = { key: anthropicKey() || '', until: Date.now() + 600_000 }; console.warn('[provider] anthropic set aside for ten minutes:', why); }
/** Whether Claude models can be used right now (a key is set and it has not been rejected recently). */
export function anthropicConfigured(): boolean { return !!anthropicKey(); }

/** The best model an account can use for a tier: the configured id when available, otherwise the next known one. */
export async function resolveModel(tier: Tier, exclude: string[] = []): Promise<string> {
  const want = [configured(tier), ...CANDIDATES[tier]].filter((v, i, a) => a.indexOf(v) === i && !exclude.includes(v));
  const ids = await availableModels();
  for (const w of want) {
    if (isClaude(w)) { if (anthropicUsable()) return w; continue; }
    if (!ids.length || ids.includes(w)) return w;
  }
  // Nothing from the list: take any kimi model the account has, newest-looking first.
  const kimi = ids.filter(id => /kimi/i.test(id) && !exclude.includes(id)).sort().reverse();
  return kimi[0] || ids.find(id => !exclude.includes(id)) || want.find(w => !isClaude(w)) || want[0];
}

export function mockMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MOCK_LLM === '1';
}

function apiBase(): string { return (process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, ''); }
function apiKey(): string {
  const k = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!k) throw Object.assign(new Error('KIMI_API_KEY is not set'), { status: 401 });
  return k;
}
function anthropicBase(): string { return (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''); }
function anthropicKey(): string | null { return process.env.ANTHROPIC_API_KEY || null; }
const ANTHROPIC_VERSION = '2023-06-01';

export type ProviderErrorCode = 'provider_billing' | 'provider_auth' | 'rate_limited' | 'overloaded' | 'prompt_too_large' | 'invalid_request' | 'upstream_error';
export type ProviderError = { code: ProviderErrorCode; status: number | null; type: string; message: string; forAdmin: string; forUser: string };

/** A failed provider call, carrying the HTTP status and the body the provider sent. */
export class ProviderRequestError extends Error {
  constructor(public status: number, message: string, public body?: unknown, public type = '') { super(message); }
}

/**
 * Read what the model provider actually said. Both providers answer in the same error shape
 * ({ error: { message, type } }) with a status: 401 bad key, 402/403 no balance or quota, 404 unknown
 * model, 429 rate limit, 5xx or 529 overloaded. Surface the message, and give the person something true to read.
 */
export function describeProviderError(e: unknown): ProviderError {
  const err = e as { status?: number; message?: string; type?: string; body?: unknown; error?: { message?: string; type?: string } };
  const status = typeof err?.status === 'number' ? err.status : null;
  const body = (err?.body || {}) as { error?: { message?: string; type?: string; code?: string } };
  const type = String(err?.type || body?.error?.type || err?.error?.type || '');
  const message = String(body?.error?.message || err?.error?.message || err?.message || e || '').slice(0, 400);
  const m = message.toLowerCase();
  let code: ProviderErrorCode = 'upstream_error';
  if (status === 402 || /balance|insufficient|quota|billing|recharge|top up|credit/.test(m) || (status === 403 && /quota|balance/.test(type))) code = 'provider_billing';
  else if (status === 401 || status === 403 || /invalid api key|authentication|unauthorized|invalid x-api-key/.test(m)) code = 'provider_auth';
  else if (status === 429 || /rate limit|too many requests|concurrency/.test(m)) code = 'rate_limited';
  else if (status === 503 || status === 502 || status === 529 || /overloaded|server busy|engine overloaded/.test(m)) code = 'overloaded';
  else if (status === 400 && /context length|too long|maximum context|max_tokens|token limit|prompt is too long/.test(m)) code = 'prompt_too_large';
  else if (status === 400 || status === 404 || status === 422) code = 'invalid_request';
  const forUser = {
    provider_billing: 'Ricorsa cannot reach its AI provider right now because the account behind it needs attention. The site owner has been notified; please try again later.',
    provider_auth: 'Ricorsa cannot reach its AI provider right now because its access key was rejected. The site owner has been notified; please try again later.',
    rate_limited: 'Ricorsa is handling a lot of questions right now. Wait a minute and try again.',
    overloaded: 'The model is overloaded at the moment. Try again in a minute.',
    prompt_too_large: 'This thread is too long to continue. Start a new thread for this question.',
    invalid_request: 'The request was rejected by the AI provider. Try again, or start a new thread.',
    upstream_error: 'The answer was interrupted on the way back. Try again.',
  }[code];
  const forAdmin = `${forUser} Provider said${status ? ` (HTTP ${status}${type ? `, ${type}` : ''})` : ''}: ${message}`;
  return { code, status, type, message, forAdmin, forUser };
}

export type SystemBlock = { text: string; cache?: boolean };
export type Msg = { role: 'user' | 'assistant'; content: string };
export type SearchOpts = { maxUses: number; allowedDomains?: string[] };
export type ToolCall = { server: string; name: string; error?: boolean };
/** A connector offered to the model as tools; Ricorsa calls the MCP server when the model asks. */
export type McpServerSpec = { name: string; label: string; url: string; token: string | null; allowedTools: string[] | null; tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
export type StreamResult = {
  text: string; truncated: boolean; model: string; sources: Source[];
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number; searches: number };
  tools: ToolCall[];
};

type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string; partial?: boolean; /** The assistant turn exactly as Anthropic produced it (thinking blocks included), replayed verbatim in tool loops. */ blocks?: ABlock[] };
type FunctionTool = { type: 'function'; function: { name: string; description?: string; parameters: Record<string, unknown> } };

const MAX_TOOL_ROUNDS = 6;
const MAX_CONTINUATIONS = 3;
/** Output budgets a Kimi model may refuse; the next one down is tried. */
const KIMI_MAX_TOKENS_STEPS = [32000, 16000];

/** Function names the API accepts: letters, digits, underscore, dash, at most 64 characters. */
function fnName(server: string, tool: string, taken: Set<string>): string {
  let base = `${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'tool';
  let out = base, n = 2;
  while (taken.has(out)) out = `${base.slice(0, 57)}_${n++}`;
  taken.add(out); return out;
}

function toolsFor(mcp: McpServerSpec[] | undefined): { tools: FunctionTool[]; lookup: Map<string, { spec: McpServerSpec; tool: string }> } {
  const tools: FunctionTool[] = []; const lookup = new Map<string, { spec: McpServerSpec; tool: string }>(); const taken = new Set<string>();
  for (const spec of mcp || []) {
    for (const t of spec.tools || []) {
      if (spec.allowedTools && !spec.allowedTools.includes(t.name)) continue;
      const name = fnName(spec.name, t.name, taken);
      lookup.set(name, { spec, tool: t.name });
      const params = t.inputSchema && typeof t.inputSchema === 'object' && t.inputSchema.type ? t.inputSchema : { type: 'object', properties: {} };
      tools.push({ type: 'function', function: { name, description: `${spec.label}: ${t.description || t.name}`.slice(0, 1000), parameters: params } });
      if (tools.length >= 96) break;
    }
  }
  return { tools, lookup };
}

/**
 * Stream a completion. `onText` receives each delta of the answer text. With `mcp` set, the connectors'
 * tools are offered to the model and called on its behalf (results go back to the model, the loop continues
 * until it answers). When the output limit cuts an answer short, the text so far is handed back and the
 * model carries on where it stopped.
 */
export async function streamAnswer(opts: {
  tier: Tier; system: SystemBlock[]; messages: Msg[]; maxTokens: number; signal?: AbortSignal;
  search?: SearchOpts | null;
  mcp?: McpServerSpec[] | null;
  temperature?: number;
  onText: (delta: string) => void;
  /** Each piece of the model's reasoning as it thinks (models that stream it); for progress, never shown as the answer. */
  onThinking?: (delta: string) => void;
  onSources?: (sources: Source[]) => void;
  onStatus?: (text: string) => void;
  onTool?: (call: ToolCall) => void;
  /** Sees every tool result before the model does; may hand back replacement text (used to number Vault pages as sources). */
  onToolResult?: (call: ToolCall, result: { text: string; isError: boolean; structured: unknown; args: Record<string, unknown> }) => string | void;
  /** Told which model is writing, including when a fallback takes over mid-way. */
  onModel?: (model: string) => void;
}): Promise<StreamResult> {
  if (mockMode()) return mockStream(opts, modelFor(opts.tier));
  let model = await resolveModel(opts.tier);
  opts.onModel?.(model);
  const systemText = opts.system.map(b => b.text).join('\n\n');
  const convo: ChatMessage[] = [{ role: 'system', content: systemText }, ...opts.messages.map(m => ({ role: m.role, content: m.content }))];
  const { tools, lookup } = toolsFor(opts.mcp || undefined);
  const labelOf = new Map((opts.mcp || []).map(m => [m.name, m.label]));
  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
  const toolCalls: ToolCall[] = [];
  let out = ''; let truncated = false; let rounds = 0; let continuations = 0;
  const tried: string[] = [model];

  let retriedModel = false; let reasoning = reasoningFor(opts.tier, model); let effort = effortFor(opts.tier, model); let noPartial = isClaude(model); let temperature = temperatureFor(model, opts.temperature); let maxTokens = opts.maxTokens; let overloadRetries = 0;
  const switchTo = (next: string) => { model = next; tried.push(next); reasoning = reasoningFor(opts.tier, next); effort = effortFor(opts.tier, next); temperature = temperatureFor(next, opts.temperature); noPartial = noPartial || isClaude(next); maxTokens = opts.maxTokens; opts.onModel?.(next); };
  for (;;) {
    let res: ChatOut;
    try {
      res = isClaude(model)
        ? await anthropicStream({ model, system: opts.system, messages: convo, maxTokens, tools: tools.length ? tools : undefined, effort, signal: opts.signal, onText: (d) => { out += d; opts.onText(d); }, onThinking: opts.onThinking })
        : await chatStream({ model, messages: convo, maxTokens, tools: tools.length ? tools : undefined, temperature, reasoning, signal: opts.signal, onText: (d) => { out += d; opts.onText(d); }, onThinking: opts.onThinking });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      if (isClaude(model) && e instanceof ProviderRequestError) {
        // Anthropic overloaded or rate limited: one short pause and a second try before anything else.
        if ((e.status === 429 || e.status === 529 || e.status === 503) && overloadRetries < 1) { overloadRetries++; await new Promise(r => setTimeout(r, 2000)); continue; }
        if (e.status === 401 || e.status === 402 || e.status === 403 || (e.status === 400 && /credit|billing|balance/i.test(e.message))) markAnthropicDown(`HTTP ${e.status}: ${e.message.slice(0, 120)}`);
        // Anything the Anthropic side refuses: hand the tier to the next candidate (a Kimi model) so the person still gets a result.
        const next = await resolveModel(opts.tier, tried);
        if (next !== model && out.length === 0) { console.warn('[provider] anthropic failed, switching', model, '->', next, `HTTP ${e.status}: ${e.message.slice(0, 160)}`); switchTo(next); continue; }
      }
      // A temperature this model does not take: send none and try again.
      if (e instanceof ProviderRequestError && e.status === 400 && temperature !== undefined && /temperature/i.test(e.message)) { console.warn('[provider] temperature not accepted by', model); temperature = undefined; continue; }
      // An output budget above what this model allows: come down a step and try again.
      if (e instanceof ProviderRequestError && e.status === 400 && /max_tokens/i.test(e.message)) {
        const lower = KIMI_MAX_TOKENS_STEPS.find(s => s < maxTokens);
        if (lower) { console.warn('[provider] max_tokens', maxTokens, 'not accepted by', model, '; trying', lower); maxTokens = lower; continue; }
      }
      // An id this account cannot use: refresh the list and try the next candidate once.
      if (!retriedModel && e instanceof ProviderRequestError && e.status === 404 && /model/i.test(e.message)) {
        retriedModel = true; await availableModels(true); const next = await resolveModel(opts.tier, tried);
        console.warn('[provider] model not available, switching', model, '->', next); if (next !== model) { switchTo(next); continue; }
      }
      // A parameter this model does not take: drop it and try again.
      if (e instanceof ProviderRequestError && e.status === 400 && reasoning && /reasoning/i.test(e.message)) { console.warn('[provider] reasoning_effort not accepted by', model); reasoning = null; continue; }
      if (e instanceof ProviderRequestError && e.status === 400 && !noPartial && /partial/i.test(e.message)) {
        noPartial = true;
        for (const m of convo) if (m.role === 'assistant' && m.partial) { delete m.partial; convo.push({ role: 'user', content: 'Continue exactly where you left off, without repeating anything.' }); }
        continue;
      }
      throw e;
    }
    usage.in += res.usage.in; usage.out += res.usage.out; usage.cacheRead += res.usage.cacheRead; usage.cacheWrite += res.usage.cacheWrite || 0;
    console.log('[answer]', JSON.stringify({ model, finish: res.finish, tools: res.toolCalls.length, chars: out.length, in: res.usage.in, out: res.usage.out, cacheRead: res.usage.cacheRead }));

    if (res.finish === 'tool_calls' && res.toolCalls.length && rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      convo.push({ role: 'assistant', content: res.text || null, tool_calls: res.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })), blocks: res.blocks });
      for (const c of res.toolCalls) {
        const hit = lookup.get(c.name);
        const call: ToolCall = { server: hit ? hit.spec.name : c.name, name: hit ? hit.tool : c.name };
        toolCalls.push(call); opts.onTool?.(call);
        opts.onStatus?.(`Using ${hit ? labelOf.get(hit.spec.name) || hit.spec.name : c.name}: ${call.name.replace(/_/g, ' ')}`);
        let args: Record<string, unknown> = {}; try { args = c.arguments ? JSON.parse(c.arguments) : {}; } catch { args = {}; }
        let text: string; let isError = false; let structured: unknown = undefined;
        if (!hit) { text = 'Unknown tool'; isError = true; }
        else {
          try { const r = await callMcpTool(hit.spec.url, hit.spec.token, hit.tool, args, { signal: opts.signal }); text = r.text; isError = r.isError; structured = r.structured; }
          catch (e) { text = `The connector could not be reached: ${String((e as Error)?.message || e)}`; isError = true; }
        }
        call.error = isError; opts.onTool?.(call);
        if (!isError && opts.onToolResult) { try { const replaced = opts.onToolResult(call, { text, isError, structured, args }); if (typeof replaced === 'string') text = replaced; } catch (e) { console.warn('[mcp] onToolResult failed', e); } }
        console.log('[mcp] tool', call.server, call.name, isError ? 'error' : 'ok', text.length);
        convo.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: isError ? `ERROR: ${text}` : text });
      }
      continue;
    }
    if (res.finish === 'length' && continuations < MAX_CONTINUATIONS && out.trim().length > 0 && !/<\/learned>\s*$|<\/app>\s*$|<\/reply>\s*$/.test(out)) {
      // Ran out of room mid-answer: hand the text back and let the model carry on. Kimi takes it as a partial
      // assistant message; Claude gets the text as the previous turn and a request to continue.
      continuations++;
      const last = convo[convo.length - 1];
      if (noPartial) {
        if (last.role === 'user' && /^Continue exactly where you left off/.test(last.content || '')) { const prev = convo[convo.length - 2]; if (prev.role === 'assistant') prev.content = out; }
        else { convo.push({ role: 'assistant', content: out }); convo.push({ role: 'user', content: 'Continue exactly where you left off, without repeating anything.' }); }
      } else if (last.role === 'assistant' && last.partial) last.content = out; else convo.push({ role: 'assistant', content: out, partial: true });
      continue;
    }
    truncated = res.finish === 'length';
    break;
  }
  return { text: out, truncated, model, sources: [], usage, tools: toolCalls };
}

type ChatOut = { text: string; finish: string; toolCalls: Array<{ id: string; name: string; arguments: string }>; usage: { in: number; out: number; cacheRead: number; cacheWrite?: number }; blocks?: ABlock[] };

/** One streamed chat completion on Kimi. Parses the SSE stream, collects text, tool calls and usage. */
async function chatStream(o: { model: string; messages: ChatMessage[]; maxTokens: number; tools?: FunctionTool[]; temperature?: number; reasoning?: string | null; signal?: AbortSignal; onText: (d: string) => void; onThinking?: (d: string) => void }): Promise<ChatOut> {
  const body: Record<string, unknown> = { model: o.model, messages: o.messages, max_tokens: o.maxTokens, stream: true, stream_options: { include_usage: true } };
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.tools?.length) { body.tools = o.tools; body.tool_choice = 'auto'; }
  if (o.reasoning) body.reasoning_effort = o.reasoning;
  const res = await fetch(`${apiBase()}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` }, body: JSON.stringify(body), signal: o.signal });
  if (!res.ok) throw await providerError(res);
  if (!res.body) throw new ProviderRequestError(502, 'Empty response from the model provider');
  let text = ''; let finish = 'stop';
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const usage = { in: 0, out: 0, cacheRead: 0 };
  await readSse(res.body, (data) => {
    if (data === '[DONE]') return;
    let j: { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
    try { j = JSON.parse(data); } catch { return; }
    const ch = j.choices?.[0];
    if (ch?.delta?.reasoning_content && o.onThinking) o.onThinking(ch.delta.reasoning_content);
    if (ch?.delta?.content) { text += ch.delta.content; o.onText(ch.delta.content); }
    for (const tc of ch?.delta?.tool_calls || []) {
      const idx = tc.index ?? 0; const cur = calls.get(idx) || { id: '', name: '', arguments: '' };
      if (tc.id) cur.id = tc.id; if (tc.function?.name) cur.name += tc.function.name; if (tc.function?.arguments) cur.arguments += tc.function.arguments;
      calls.set(idx, cur);
    }
    if (ch?.finish_reason) finish = ch.finish_reason;
    if (j.usage) { usage.in = j.usage.prompt_tokens || usage.in; usage.out = j.usage.completion_tokens || usage.out; usage.cacheRead = j.usage.prompt_tokens_details?.cached_tokens || j.usage.cached_tokens || usage.cacheRead; }
  });
  const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], k) => ({ id: c.id || `call_${k}`, name: c.name, arguments: c.arguments }));
  if (toolCalls.length && finish !== 'tool_calls') finish = 'tool_calls';
  return { text, finish, toolCalls, usage };
}

/** The Anthropic Messages API's shape of a conversation. */
type ABlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } } | { type: 'thinking'; thinking: string; signature: string } | { type: 'redacted_thinking'; data: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type AMessage = { role: 'user' | 'assistant'; content: ABlock[] };

/** Our conversation, as Anthropic wants it: no system entries, tool results inside user turns, strict alternation. */
function toAnthropicMessages(convo: ChatMessage[]): AMessage[] {
  const out: AMessage[] = [];
  const push = (role: 'user' | 'assistant', blocks: ABlock[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks); else out.push({ role, content: blocks });
  };
  for (const m of convo) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') { push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id || '', content: m.content || '', is_error: /^ERROR:/.test(m.content || '') || undefined }]); continue; }
    if (m.role === 'assistant') {
      if (m.blocks && m.blocks.length) { push('assistant', m.blocks); continue; }
      const blocks: ABlock[] = [];
      if (m.content && m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const c of m.tool_calls || []) { let input: unknown = {}; try { input = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch { input = {}; } blocks.push({ type: 'tool_use', id: c.id, name: c.function.name, input }); }
      push('assistant', blocks); continue;
    }
    if (m.content && m.content.trim()) push('user', [{ type: 'text', text: m.content }]);
  }
  // A conversation must start with the person; an assistant turn cannot be the last thing said unless it is a prefill, which thinking forbids.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/**
 * One streamed message on Anthropic: adaptive thinking with the tier's effort, the system prompt cached, tools
 * offered when connectors are present. Parses the event stream into text, thinking, tool calls and usage.
 */
async function anthropicStream(o: { model: string; system: SystemBlock[]; messages: ChatMessage[]; maxTokens: number; tools?: FunctionTool[]; effort: string | null; signal?: AbortSignal; onText: (d: string) => void; onThinking?: (d: string) => void }): Promise<ChatOut> {
  const key = anthropicKey(); if (!key) throw new ProviderRequestError(401, 'ANTHROPIC_API_KEY is not set');
  const system: ABlock[] = o.system.filter(b => b.text.trim()).map(b => b.cache ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: b.text });
  const body: Record<string, unknown> = { model: o.model, max_tokens: o.maxTokens, stream: true, system, messages: toAnthropicMessages(o.messages), thinking: { type: 'adaptive' } };
  if (o.effort) body.output_config = { effort: o.effort };
  if (o.tools?.length) body.tools = o.tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  const res = await fetch(`${anthropicBase()}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify(body), signal: o.signal });
  if (!res.ok) throw await providerError(res);
  if (!res.body) throw new ProviderRequestError(502, 'Empty response from the model provider');
  let text = ''; let stop = 'end_turn';
  const blocks = new Map<number, { type: string; id: string; name: string; json: string; text: string; signature: string; data: string }>();
  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  await readSse(res.body, (data) => {
    let j: { type?: string; index?: number; message?: { usage?: AUsage }; content_block?: { type?: string; id?: string; name?: string; data?: string }; delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; signature?: string; stop_reason?: string }; usage?: AUsage; error?: { type?: string; message?: string } };
    try { j = JSON.parse(data); } catch { return; }
    switch (j.type) {
      case 'message_start': { const u = j.message?.usage; if (u) readUsage(usage, u); break; }
      case 'content_block_start': { const b = j.content_block; blocks.set(j.index ?? 0, { type: b?.type || 'text', id: b?.id || '', name: b?.name || '', json: '', text: '', signature: '', data: b?.data || '' }); break; }
      case 'content_block_delta': {
        const d = j.delta; const b = blocks.get(j.index ?? 0);
        if (d?.type === 'text_delta' && d.text) { text += d.text; if (b) b.text += d.text; o.onText(d.text); }
        else if (d?.type === 'thinking_delta' && d.thinking) { if (b) b.text += d.thinking; o.onThinking?.(d.thinking); }
        else if (d?.type === 'signature_delta' && d.signature) { if (b) b.signature += d.signature; }
        else if (d?.type === 'input_json_delta') { if (b) b.json += d.partial_json || ''; }
        break;
      }
      case 'message_delta': { if (j.delta?.stop_reason) stop = j.delta.stop_reason; if (j.usage) readUsage(usage, j.usage); break; }
      case 'error': throw new ProviderRequestError(502, j.error?.message || 'The model stream failed', j, j.error?.type || '');
      default: break;
    }
  });
  const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const toolCalls = ordered.filter(b => b.type === 'tool_use').map((b, k) => ({ id: b.id || `toolu_${k}`, name: b.name, arguments: b.json || '{}' }));
  // The turn as produced, for replay in a tool loop: thinking (with its signature), text and tool_use blocks in order.
  const replay: ABlock[] = [];
  for (const b of ordered) {
    if (b.type === 'thinking' && b.text) replay.push({ type: 'thinking', thinking: b.text, signature: b.signature });
    else if (b.type === 'redacted_thinking' && b.data) replay.push({ type: 'redacted_thinking', data: b.data });
    else if (b.type === 'text' && b.text.trim()) replay.push({ type: 'text', text: b.text });
    else if (b.type === 'tool_use') { let input: unknown = {}; try { input = b.json ? JSON.parse(b.json) : {}; } catch { input = {}; } replay.push({ type: 'tool_use', id: b.id, name: b.name, input }); }
  }
  const finish = stop === 'tool_use' || toolCalls.length ? 'tool_calls' : stop === 'max_tokens' ? 'length' : stop === 'refusal' ? 'refusal' : 'stop';
  return { text, finish, toolCalls, usage, blocks: replay };
}
type AUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
function readUsage(u: { in: number; out: number; cacheRead: number; cacheWrite: number }, a: AUsage) {
  if (typeof a.input_tokens === 'number') u.in = a.input_tokens;
  if (typeof a.output_tokens === 'number') u.out = a.output_tokens;
  if (typeof a.cache_read_input_tokens === 'number') u.cacheRead = a.cache_read_input_tokens;
  if (typeof a.cache_creation_input_tokens === 'number') u.cacheWrite = a.cache_creation_input_tokens;
}

/** Read a server-sent-event body line by line, handing each data payload to `onData`. */
async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader(); const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  }
  if (buf.startsWith('data:')) onData(buf.slice(5).trim());
}

/** The provider's error, with its status and the body it sent (both providers use { error: { message, type } }). */
async function providerError(res: Response): Promise<ProviderRequestError> {
  const raw = await res.text().catch(() => '');
  let parsed: unknown = null; try { parsed = JSON.parse(raw); } catch { /* not json */ }
  const err = (parsed as { error?: { message?: string; type?: string } })?.error;
  return new ProviderRequestError(res.status, err?.message || raw.slice(0, 300) || `HTTP ${res.status}`, parsed, String(err?.type || ''));
}

/**
 * Small structured call (query planning, rewrites, Home suggestions). Returns parsed JSON or null. The tier
 * picks the model: `quick` by default; `ideas` for Discover, which goes to the build model.
 */
export async function quickJson<T = unknown>(prompt: string, maxTokens = 400, tier: Tier = 'quick'): Promise<T | null> {
  if (mockMode()) return null;
  const system = 'Reply with valid JSON only: no prose, no markdown fences.';
  const tried: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = await resolveModel(tier, tried); tried.push(model);
    try {
      let text = '';
      if (isClaude(model)) {
        const r = await anthropicStream({ model, system: [{ text: system }], messages: [{ role: 'user', content: prompt }], maxTokens, effort: effortFor(tier, model), onText: (d) => { text += d; } });
        console.log('[json]', JSON.stringify({ model, tier, in: r.usage.in, out: r.usage.out, cacheRead: r.usage.cacheRead }));
      } else {
        const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
        const temp = temperatureFor(model, 0.4); if (temp !== undefined) body.temperature = temp;
        const effort = reasoningFor(tier, model); if (effort) body.reasoning_effort = effort;
        const res = await fetch(`${apiBase()}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` }, body: JSON.stringify(body) });
        if (!res.ok) throw await providerError(res);
        const j = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        text = j.choices?.[0]?.message?.content || '';
        console.log('[json]', JSON.stringify({ model, tier, in: j.usage?.prompt_tokens, out: j.usage?.completion_tokens }));
      }
      return parseJsonLoosely<T>(text);
    } catch (e) {
      const p = describeProviderError(e);
      console.warn('[provider] quickJson failed', JSON.stringify({ model, tier, code: p.code, status: p.status, type: p.type, message: p.message }));
      if (isClaude(model) && (p.code === 'provider_auth' || p.code === 'provider_billing')) markAnthropicDown(p.message);
      // A Claude failure hands the call to the next candidate once; a Kimi failure is final.
      if (!isClaude(model)) return null;
    }
  }
  return null;
}

/** The first JSON array or object in a reply, fences and prose around it ignored. */
export function parseJsonLoosely<T>(text: string): T | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']'); const oa = t.indexOf('{'), ob = t.lastIndexOf('}');
  const slice = a >= 0 && (oa < 0 || a < oa) ? t.slice(a, b + 1) : t.slice(oa, ob + 1);
  try { return JSON.parse(slice) as T; } catch { return null; }
}

async function mockStream(opts: { system?: SystemBlock[]; messages: Msg[]; search?: SearchOpts | null; mcp?: McpServerSpec[] | null; onText: (d: string) => void; onSources?: (s: Source[]) => void; onStatus?: (t: string) => void; onTool?: (call: ToolCall) => void; onToolResult?: (call: ToolCall, result: { text: string; isError: boolean; structured: unknown; args: Record<string, unknown> }) => string | void; signal?: AbortSignal }, model: string): Promise<StreamResult> {
  if (opts.system?.[0]?.text.startsWith("You are Ricorsa's builder")) return mockBuild(opts, model);
  const q = opts.messages[opts.messages.length - 1]?.content.split('Question:').pop()?.trim().slice(0, 80) || 'your question';
  const sources: Source[] = opts.search ? mockSources(q) : [];
  if (opts.search) { opts.onStatus?.(`Searching: ${q.slice(0, 60)}`); await new Promise(r => setTimeout(r, 300)); opts.onSources?.(sources); }
  // With a Vault connected, the stub searches it for real (the local Vault), so the numbering and the viewer can be exercised.
  let vaultPara = ''; const toolCalls: ToolCall[] = [];
  const vault = (opts.mcp || []).find(m => (m.tools || []).some(t => t.name === 'vault_search'));
  if (vault) {
    const call: ToolCall = { server: vault.name, name: 'vault_search' }; toolCalls.push(call); opts.onTool?.(call); opts.onStatus?.(`Using ${vault.label}: vault search`);
    let r: { text: string; isError: boolean; structured?: unknown };
    try { r = await callMcpTool(vault.url, vault.token, 'vault_search', { query: q, limit: 5 }, { signal: opts.signal }); } catch (e) { r = { text: String((e as Error)?.message || e), isError: true }; }
    call.error = r.isError; opts.onTool?.(call);
    let text = r.text; if (!r.isError && opts.onToolResult) { const rep = opts.onToolResult(call, { text: r.text, isError: r.isError, structured: r.structured, args: { query: q } }); if (typeof rep === 'string') text = rep; }
    const nums = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m => m[1]))].slice(0, 3);
    vaultPara = r.isError ? `\n\nThe Vault could not be searched (${text.slice(0, 120)}).` : nums.length ? `\n\n## From your Vault\nThe connected Vault has pages that match${nums.map(n => `[${n}]`).join('')}; in production the model reads them and answers from what they say, citing each page it relies on${nums[0] ? `[${nums[0]}]` : ''}.` : `\n\nNothing in the connected Vault matched "${q}".`;
  }
  const full = `<answer>
This is a mock answer for "${q}", streamed by the local development stub so the app can be exercised without API keys${sources.length ? '[1][2]' : ''}.${vaultPara}

## What you are seeing
- **Sources** above arrived from the search stub the same way live web search results arrive in production, numbered in order of appearance${sources.length ? '[1]' : ''}.
- The answer streams token by token through the same server-sent-event channel production uses${sources.length ? '[3]' : ''}.
- When it finishes, the learned block below merges into your identity graph and the Graph page updates${sources.length ? '[2]' : ''}.

| Piece | Real mode | Mock mode |
|---|---|---|
| Retrieval | Brave Search | canned results |
| Model | Kimi K2 | this text |
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
  return { text: full, truncated: false, model, sources, usage: { in: 1200, out: 320, cacheRead: 900, cacheWrite: 0, searches: sources.length ? 1 : 0 }, tools: toolCalls };
}

async function mockBuild(opts: { messages: Msg[]; onText: (d: string) => void; signal?: AbortSignal }, model: string): Promise<StreamResult> {
  const title = (opts.messages[0]?.content.match(/Idea to build: (.*)/) || [])[1] || 'Your app';
  const last = opts.messages[opts.messages.length - 1]?.content || '';
  const request = (last.match(/My request: ([\s\S]*?)\n\nIf this asks/) || [])[1] || (last.match(/A review of this version found[\s\S]*/) || [])[0] || '';
  // The stub answers questions with a reply and treats everything else as a change (a new version with a note).
  if (request && /\?\s*$/.test(request.trim())) {
    const full = `<reply>\nThis is the development stub answering your question about "${title}": ${request.trim()} In production the builder reads the current version and answers from it.\n</reply>`;
    for (let i = 0; i < full.length; i += 30) { await new Promise(r => setTimeout(r, 8)); opts.onText(full.slice(i, i + 30)); }
    return { text: full, truncated: false, model, sources: [], usage: { in: 300, out: 60, cacheRead: 0, cacheWrite: 0, searches: 0 }, tools: [] };
  }
  const note = request ? `<p style="background:#e8eff6;padding:8px 12px;border-radius:8px">Change applied (stub): ${request.replace(/</g, '&lt;').slice(0, 120)}</p>` : '';
  const full = `<plan>
- A small working tracker for "${title}"
- One screen: add items, mark them done, see a running total
- Remembers everything in this browser
</plan>
<app>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#fbfbf9;color:#1b2228}main{max-width:640px;margin:0 auto;padding:32px 20px}h1{font-size:24px;margin:0 0 6px}p{color:#55606b}form{display:flex;gap:8px;margin:18px 0}input{flex:1;padding:10px 12px;border:1px solid #cfcfc7;border-radius:10px;font:inherit}button{padding:10px 14px;border:0;border-radius:10px;background:#2d5f8a;color:#fff;font:inherit;cursor:pointer}ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e5e5df}li.done span{text-decoration:line-through;color:#8a939c}footer{margin-top:28px;font-size:12px;color:#8a939c}</style></head>
<body><main><h1>${title}</h1><p>A mock build from the development stub. Add a few items below.</p>${note}
<form id="f"><input id="t" placeholder="Add something" aria-label="Add an item" required><button type="submit">Add</button></form>
<ul id="l"></ul><p id="c"></p><footer>Built by Ricorsa from your identity graph</footer></main>
<script>
var items=[];try{items=JSON.parse(localStorage.getItem('mock-items')||'[]')}catch(e){}
function save(){try{localStorage.setItem('mock-items',JSON.stringify(items))}catch(e){}}
function render(){var l=document.getElementById('l');l.innerHTML='';items.forEach(function(it,i){var li=document.createElement('li');if(it.done)li.className='done';var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!it.done;cb.onchange=function(){it.done=cb.checked;save();render()};var s=document.createElement('span');s.textContent=it.text;li.appendChild(cb);li.appendChild(s);l.appendChild(li)});document.getElementById('c').textContent=items.filter(function(x){return x.done}).length+' of '+items.length+' done'}
document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var t=document.getElementById('t');items.push({text:t.value,done:false});t.value='';save();render()});
render();
</script></body></html>
</app>
<next>
Add a due date to each item
Add a filter for done and open items
Add export to CSV
Make it work well on a phone
</next>`;
  for (let i = 0; i < full.length; i += 40) {
    if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    await new Promise(r => setTimeout(r, 12));
    opts.onText(full.slice(i, i + 40));
  }
  return { text: full, truncated: false, model, sources: [], usage: { in: 900, out: 700, cacheRead: 0, cacheWrite: 0, searches: 0 }, tools: [] };
}

export function mockSources(query: string): Source[] {
  const base = [
    ['Rayleigh scattering', 'en.wikipedia.org', 'https://en.wikipedia.org/wiki/Rayleigh_scattering', 'Rayleigh scattering is the scattering of light by particles much smaller than the wavelength of the light, and it is proportional to the inverse fourth power of the wavelength.'],
    ['Why Is the Sky Blue?', 'spaceplace.nasa.gov', 'https://spaceplace.nasa.gov/blue-sky/en/', 'Blue light is scattered in all directions by the tiny molecules of air in Earth\'s atmosphere.'],
    ['Blue Sky and Rayleigh Scattering', 'hyperphysics.phy-astr.gsu.edu', 'http://hyperphysics.phy-astr.gsu.edu/hbase/atmos/blusky.html', 'The blue color of the sky is caused by the scattering of sunlight off the molecules of the atmosphere.'],
    ['Mie scattering', 'en.wikipedia.org', 'https://en.wikipedia.org/wiki/Mie_scattering', 'Mie scattering describes scattering by particles comparable in size to the wavelength, such as dust and water droplets.'],
  ];
  return base.map((b, i) => ({ n: i + 1, title: b[0], domain: b[1], url: b[2], snippet: b[3] + ' (mock result for: ' + query.slice(0, 40) + ')' }));
}
