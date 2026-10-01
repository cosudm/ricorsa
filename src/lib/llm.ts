/**
 * The model layer. Every provider sits behind one streaming interface, over one of two wire protocols:
 *  - the OpenAI-compatible chat completions API (Moonshot's Kimi, OpenAI, Google Gemini, xAI, Mistral,
 *    DeepSeek, Groq, OpenRouter, Together and any custom endpoint): streamed completions, function calling for
 *    connector tools, and on Moonshot partial-mode continuation when an answer runs past the output limit;
 *  - Anthropic's Messages API (Claude): streamed messages with adaptive thinking and an effort level, prompt
 *    caching on the system prompt, and tool use for connectors.
 * A tier's active model is the admin's choice under Settings → Model accounts, else the MODEL_* variable, else
 * the default; its provider is whoever has a key and lists it (src/lib/providers.ts). When that provider cannot
 * serve (no key, key rejected, unknown model, overloaded) the next candidate for the tier takes over, so the
 * product keeps answering. Web retrieval happens before the call (src/lib/search.ts) and the sources are handed
 * to the model as numbered context; connectors are called by Ricorsa itself through MCP.
 */
import type { Source } from './search';
import { callMcpTool } from './mcp';
import { loadProviders, providersNow, providerForModel, providerUsable, markProviderDown, providerSetAside, listProviderModels, probeProvider, modelSettings, modelSettingsNow, isHomeOf, type Provider } from './providers';

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
  // Apps are long, exacting documents: Claude first. When Anthropic cannot be used, the fast Kimi code model
  // rather than K3: an app is 20 to 35 thousand tokens of output, and K3 writes at about a third of the speed
  // after minutes of thinking, so a K3 build ran past twenty minutes without finishing its plan.
  build: ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'kimi-k2.7-code-highspeed', 'kimi-k2.7-code', 'kimi-k3', 'kimi-k2.6', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-latest'],
  ideas: ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'kimi-k3', 'kimi-k2.5', 'kimi-k2-0905-preview', 'kimi-latest'],
};

/** Whether a model is served over Anthropic's Messages API (Claude); every other model speaks the OpenAI-compatible API. */
export function isClaude(model: string): boolean { const p = providerForModel(model); return p ? p.kind === 'anthropic' : /^claude-/i.test(model); }
/** The provider that serves a model right now, honoring the tier's chosen provider when one is set. */
function providerFor(model: string, tier?: Tier): Provider | null { return providerForModel(model, tier ? configuredProvider(tier) : undefined); }

/**
 * Thinking effort per tier. Kimi K3 and the thinking models take `reasoning_effort`; Claude takes
 * `output_config.effort` (low, medium, high, xhigh, max) with adaptive thinking. Fast thinks little, Best a
 * moderate amount, Reasoning as much as it can, builds and ideas a lot. Builds on Kimi stop at "high": at
 * "max" K3 thinks for many minutes before writing a line, and the plan it writes first is most of the value
 * of that thinking anyway. Override per tier with REASONING_QUICK, REASONING_DEFAULT, REASONING_COMPLEX,
 * REASONING_BUILD, REASONING_IDEAS (Kimi) and EFFORT_QUICK, EFFORT_DEFAULT, EFFORT_COMPLEX, EFFORT_BUILD,
 * EFFORT_IDEAS (Claude); "off" sends nothing.
 */
const DEFAULT_REASONING: Record<Tier, string> = { quick: 'low', default: 'medium', complex: 'max', build: 'high', ideas: 'high' };
const DEFAULT_EFFORT: Record<Tier, string> = { quick: 'low', default: 'medium', complex: 'max', build: 'high', ideas: 'high' };
const CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
function envFor(prefix: string, tier: Tier): string | undefined {
  const key = `${prefix}_${tier.toUpperCase()}`;
  return process.env[key];
}
/** Thinking models (Kimi K3, K2.5 and later, K2.7 code and the K2 thinking variants) accept only their fixed temperature; leave it out for them. Claude with thinking takes none either. */
function temperatureFor(model: string, wanted: number | undefined): number | undefined {
  if (isClaude(model) || /k3|k2\.[5-9]|k2-?thinking|thinking|reason/i.test(model)) return undefined;
  return wanted ?? 0.6;
}
function reasoningFor(tier: Tier, model: string): string | null {
  if (isClaude(model)) return null;
  const v = envFor('REASONING', tier) || DEFAULT_REASONING[tier];
  if (v === 'off' || v === 'none') return null;
  const takes = /k3|thinking|reason|^o[1-9](-|$)|^gpt-5|^gemini-(2\.5|3)|^grok-.*mini|magistral/i.test(model) || process.env.REASONING_ALWAYS === '1';
  if (!takes) return null;
  // Kimi K3 takes low, high or max and nothing between (a value it does not know is refused, and the retry without
  // one thinks at max); everyone else tops out at "high".
  if (/k3/i.test(model)) return v === 'medium' ? 'low' : v;
  const p = providerFor(model);
  return v === 'max' && p && p.id !== 'moonshot' ? 'high' : v;
}
/**
 * Kimi K2.5 and K2.6 think by default and take no effort level; `thinking: {type: 'disabled'}` turns it off
 * (K2.7 code and K3 cannot turn it off). Sent on structured calls, where an answer is a few hundred tokens of JSON
 * and the thinking was what ran the budget and the clock out.
 */
function canDisableThinking(model: string): boolean { return /k2\.[56](?!\d)/i.test(model) && !/code/i.test(model); }
function effortFor(tier: Tier, model: string): string | null {
  if (!isClaude(model)) return null;
  const v = (envFor('EFFORT', tier) || DEFAULT_EFFORT[tier]).toLowerCase();
  if (v === 'off' || v === 'none') return null;
  return CLAUDE_EFFORTS.has(v) ? v : 'high';
}
function configured(tier: Tier): string {
  const chosen = modelSettingsNow()[tier]; if (chosen?.model) return chosen.model;
  if (tier === 'quick') return process.env.MODEL_QUICK || DEFAULT_MODELS.quick;
  if (tier === 'complex') return process.env.MODEL_COMPLEX || DEFAULT_MODELS.complex;
  if (tier === 'build') return process.env.MODEL_BUILD || DEFAULT_MODELS.build;
  if (tier === 'ideas') return process.env.MODEL_IDEAS || process.env.MODEL_BUILD || DEFAULT_MODELS.ideas;
  return process.env.MODEL_DEFAULT || DEFAULT_MODELS.default;
}
/** The provider an admin chose for a tier under Settings → Model accounts, when they chose one. */
function configuredProvider(tier: Tier): string | undefined { return modelSettingsNow()[tier]?.provider; }
/** The configured id for a tier (what the settings say); `resolveModel` checks it against what the accounts can actually use. */
export function modelFor(tier: Tier): string { return configured(tier); }
export const PROVIDER_NAME = 'Kimi';
/** The provider a model id belongs to, for logs and the admin screen. */
export function providerOf(model: string, tier?: Tier): string { const p = providerFor(model, tier); return p ? p.name : (/^claude-/i.test(model) ? 'Anthropic (Claude)' : 'Moonshot (Kimi)'); }

/** The model ids the Kimi (Moonshot) account can use; kept for the admin readout. Empty when the list cannot be fetched. */
export async function availableModels(force = false): Promise<string[]> {
  const p = (await loadProviders()).find(x => x.id === 'moonshot');
  return p && p.key ? listProviderModels(p, force) : [];
}

/** Whether an Anthropic key is set at all (environment or account). */
export function anthropicConfigured(): boolean { return !!providersNow().find(p => p.id === 'anthropic')?.key || !!process.env.ANTHROPIC_API_KEY; }
/** Why a Claude tier is not on Claude right now: no key, or the last refusal that set Anthropic aside. Null when Claude is in use. */
export function anthropicStatus(): { configured: boolean; usable: boolean; setAsideUntil: string | null; why: string | null } {
  const p = providersNow().find(x => x.id === 'anthropic');
  if (!p || !p.key) return { configured: false, usable: false, setAsideUntil: null, why: 'No Anthropic API key on the server or the account' };
  const aside = providerSetAside(p);
  return { configured: true, usable: !aside, setAsideUntil: aside ? aside.until : null, why: aside ? aside.why : null };
}
/** One tiny message on Anthropic so an admin can read exactly what the account answers; an accepted probe lifts a set-aside. */
export async function probeAnthropic(model = configured('build')): Promise<{ ok: boolean; status: number; message: string; model: string; ms: number }> {
  const p = (await loadProviders()).find(x => x.id === 'anthropic');
  const m = /^claude-/i.test(model) ? model : DEFAULT_MODELS.build;
  if (!p || !p.key) return { ok: false, status: 0, message: 'No Anthropic API key on the server or the account', model: m, ms: 0 };
  const r = await probeProvider(p, m);
  return { ok: r.ok, status: r.status, message: r.message, model: r.model, ms: r.ms };
}

/**
 * The best model for a tier right now: the admin's or the environment's choice when its provider has a key, is
 * not set aside, and lists the model (a provider without a list is trusted); otherwise the next candidate whose
 * provider can serve it; otherwise the best chat model any usable provider offers.
 */
export async function resolveModel(tier: Tier, exclude: string[] = []): Promise<string> {
  await loadProviders(); await modelSettings();
  const first = configured(tier);
  const want = [first, ...CANDIDATES[tier]].filter((v, i, a) => a.indexOf(v) === i && !exclude.includes(v));
  // First the candidates known to answer: listed by their provider, or the provider's own model that an admin
  // configured for some tier or that has answered here before (Moonshot's list lagged K3 by weeks). Then the
  // provider's other own models, unlisted, in order: the request itself tells whether the id is served, and one
  // that is not is set aside for an hour.
  const open: Array<[string, Provider]> = [];
  for (const w of want) {
    const p = providerFor(w, w === first ? tier : undefined);
    if (!p || !providerUsable(p) || modelAsideFor(p, w)) continue;
    const ids = p.models.length ? p.models : await listProviderModels(p);
    if (!ids.length || ids.includes(w)) return w;
    if (!isHomeOf(p, w)) continue;
    if (configuredAnywhere(w) || modelSeen.has(`${p.id}:${w}`)) return w;
    open.push([w, p]);
  }
  if (open[0]) return open[0][0];
  const chat = (id: string) => !exclude.includes(id) && !/embed|whisper|tts|image|dall|moderation|audio|realtime|rerank|vision-only/i.test(id);
  // Nothing from the wanted list: the tier's chosen provider first, then Moonshot's newest Kimi, then any chat model from a usable provider.
  const hint = configuredProvider(tier);
  const usable = providersNow().filter(p => providerUsable(p) && !p.aggregator).sort((a, b) => (a.id === hint ? -1 : b.id === hint ? 1 : a.id === 'moonshot' ? -1 : b.id === 'moonshot' ? 1 : 0));
  for (const p of usable) {
    const ids = (p.models.length ? p.models : await listProviderModels(p)).filter(chat).filter(id => !modelAsideFor(p, id) && (p.custom || p.aggregator || isHomeOf(p, id)));
    if (p.id === 'moonshot') { const kimi = ids.filter(id => /^kimi-k\d/i.test(id) && !/code/i.test(id)).sort().reverse(); if (kimi[0]) return kimi[0]; }
    const pick = ids.sort().reverse()[0]; if (pick) return pick;
  }
  return want.find(w => !isClaude(w)) || want[0];
}

/**
 * A (provider, model) pair set aside: the provider answered 404 for the model (an hour: the id is not this account's
 * to use, whatever the list says) or the model ran past the time limit (ten minutes). Resolution skips the pair
 * so the next request goes straight to a model that answers.
 */
const modelAside = new Map<string, { until: number; why: string }>();
/** (provider, model) pairs that have answered in this process: known to be served whatever the provider's list says. */
const modelSeen = new Set<string>();
function markModelSeen(p: Provider, model: string): void { modelSeen.add(`${p.id}:${model}`); modelAside.delete(`${p.id}:${model}`); }
/** Whether an admin configured this model id for any tier (so it is known to exist, listed or not). */
function configuredAnywhere(model: string): boolean { return (['quick', 'default', 'complex', 'build', 'ideas'] as Tier[]).some(t => configured(t) === model); }
export function setModelAside(p: Provider, model: string, why: string, ms: number): void {
  modelAside.set(`${p.id}:${model}`, { until: Date.now() + ms, why });
  console.warn('[provider]', p.id, 'sets aside', model, `for ${Math.round(ms / 60000)} min:`, why.slice(0, 160));
}
function modelAsideFor(p: Provider, model: string): { until: number; why: string } | null {
  const a = modelAside.get(`${p.id}:${model}`);
  return a && Date.now() < a.until ? a : null;
}
const ASIDE_NOT_FOUND_MS = 60 * 60_000;
const ASIDE_SLOW_MS = 10 * 60_000;
/** Whether an error is the request running past its time limit (AbortSignal.timeout) rather than the provider refusing. */
function isTimeout(e: unknown): boolean {
  const err = e as { name?: string; message?: string };
  return err?.name === 'TimeoutError' || /aborted due to timeout|timed out|timeout/i.test(String(err?.message || ''));
}

export function mockMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_MOCK_LLM === '1';
}

const ANTHROPIC_VERSION = '2023-06-01';
/** The provider for a model, or a clear error when no configured provider serves it. */
function requireProvider(model: string, tier?: Tier): Provider {
  const p = providerFor(model, tier);
  if (!p || !p.key) throw new ProviderRequestError(401, `No API key for a provider that serves ${model}`);
  return p;
}

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
  else if (status === 401 || status === 403 || /invalid api key|authentication|unauthorized|invalid x-api-key|workspace-id|not scoped to a workspace/.test(m)) code = 'provider_auth';
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
/** A tool result as the model reads it: text, whether the call failed, and any structured data the caller may use. */
export type ToolOutcome = { text: string; isError: boolean; structured?: unknown };
/**
 * Tools Ricorsa runs itself, in process (its browser), offered to the model beside the connectors' tools. `name` is
 * what a ToolCall reports as the server; each tool's name is used as the function name the model sees.
 */
export type LocalToolSet = {
  name: string; label: string;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  call: (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolOutcome>;
  /** The status line shown while a call runs; by default "Using <label>: <tool>". */
  status?: (tool: string, args: Record<string, unknown>) => string;
};
export type StreamResult = {
  text: string; truncated: boolean; model: string; sources: Source[];
  usage: { in: number; out: number; cacheRead: number; cacheWrite: number; searches: number };
  tools: ToolCall[];
};

type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string; partial?: boolean; /** The assistant turn exactly as Anthropic produced it (thinking blocks included), replayed verbatim in tool loops. */ blocks?: ABlock[] };
type FunctionTool = { type: 'function'; function: { name: string; description?: string; parameters: Record<string, unknown> } };

const MAX_TOOL_ROUNDS = 6;
const MAX_CONTINUATIONS = 3;
/** How many models one call may move through before the error is handed back. */
const MAX_SWITCHES = 4;
/** Output budgets a model may refuse; the next one down is tried. */
const MAX_TOKENS_STEPS = [32000, 16000, 8000, 4000];

/** Why a tier's configured model is not the one answering, for the admin's fallback note. */
function whyNot(model: string, tier: Tier): string {
  const p = providerFor(model, tier);
  if (!p || !p.key) return `No API key for a provider that serves ${model}`;
  const aside = providerSetAside(p); if (aside) return aside.why;
  const pair = modelAsideFor(p, model); if (pair) return pair.why;
  if (p.models.length && !p.models.includes(model) && !isHomeOf(p, model)) return `${p.name} does not list ${model} for this account`;
  return `${p.name} could not be used`;
}

/** Function names the API accepts: letters, digits, underscore, dash, at most 64 characters. */
function fnName(server: string, tool: string, taken: Set<string>): string {
  let base = `${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'tool';
  let out = base, n = 2;
  while (taken.has(out)) out = `${base.slice(0, 57)}_${n++}`;
  taken.add(out); return out;
}

type ToolTarget = { kind: 'mcp'; spec: McpServerSpec; tool: string } | { kind: 'local'; set: LocalToolSet; tool: string };
function toolsFor(mcp: McpServerSpec[] | undefined, local: LocalToolSet[] | undefined): { tools: FunctionTool[]; lookup: Map<string, ToolTarget> } {
  const tools: FunctionTool[] = []; const lookup = new Map<string, ToolTarget>(); const taken = new Set<string>();
  // Ricorsa's own tools first, under their plain names, so the model addresses them as written in its guide.
  for (const set of local || []) {
    for (const t of set.tools) {
      const name = taken.has(t.name) ? fnName(set.name, t.name, taken) : (taken.add(t.name), t.name);
      lookup.set(name, { kind: 'local', set, tool: t.name });
      tools.push({ type: 'function', function: { name, description: t.description.slice(0, 1000), parameters: t.parameters } });
    }
  }
  for (const spec of mcp || []) {
    for (const t of spec.tools || []) {
      if (spec.allowedTools && !spec.allowedTools.includes(t.name)) continue;
      const name = fnName(spec.name, t.name, taken);
      lookup.set(name, { kind: 'mcp', spec, tool: t.name });
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
  /** Tools Ricorsa runs itself (its browser), beside the connectors' tools. */
  local?: LocalToolSet[] | null;
  /** How many rounds of tool calls one answer may take; the default suits connectors, a browsing answer needs more. */
  maxToolRounds?: number;
  temperature?: number;
  onText: (delta: string) => void;
  /** Each piece of the model's reasoning as it thinks (models that stream it); for progress, never shown as the answer. */
  onThinking?: (delta: string) => void;
  onSources?: (sources: Source[]) => void;
  onStatus?: (text: string) => void;
  onTool?: (call: ToolCall) => void;
  /** Sees every tool result before the model does; may hand back replacement text (used to number Vault pages as sources). */
  onToolResult?: (call: ToolCall, result: { text: string; isError: boolean; structured: unknown; args: Record<string, unknown> }) => string | void;
  /** Told which model is writing, including when a fallback takes over mid-way; `fallback` says which model was wanted and why it could not be used. */
  onModel?: (model: string, fallback?: { wanted: string; why: string }) => void;
}): Promise<StreamResult> {
  if (mockMode()) return mockStream(opts, modelFor(opts.tier));
  let model = await resolveModel(opts.tier);
  let provider = requireProvider(model, opts.tier);
  const wanted = configured(opts.tier);
  opts.onModel?.(model, model !== wanted ? { wanted, why: whyNot(wanted, opts.tier) } : undefined);
  const systemText = opts.system.map(b => b.text).join('\n\n');
  const convo: ChatMessage[] = [{ role: 'system', content: systemText }, ...opts.messages.map(m => ({ role: m.role, content: m.content }))];
  const { tools, lookup } = toolsFor(opts.mcp || undefined, opts.local || undefined);
  const labelOf = new Map((opts.mcp || []).map(m => [m.name, m.label]));
  const maxRounds = Math.max(1, opts.maxToolRounds || MAX_TOOL_ROUNDS);
  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };
  const toolCalls: ToolCall[] = [];
  let out = ''; let truncated = false; let rounds = 0; let continuations = 0; let budgetClosed = false;
  const tried: string[] = [model];

  let retriedModel = false; let reasoning = reasoningFor(opts.tier, model); let effort = effortFor(opts.tier, model); let noPartial = provider.id !== 'moonshot'; let temperature = temperatureFor(model, opts.temperature); let maxTokens = opts.maxTokens; let overloadRetries = 0;
  let streamUsage = true; let maxTokensParam: 'max_tokens' | 'max_completion_tokens' = 'max_tokens';
  const switchTo = (next: string, fallback?: { wanted: string; why: string }) => {
    model = next; provider = requireProvider(next, opts.tier); tried.push(next);
    reasoning = reasoningFor(opts.tier, next); effort = effortFor(opts.tier, next); temperature = temperatureFor(next, opts.temperature); noPartial = noPartial || provider.id !== 'moonshot'; maxTokens = opts.maxTokens; overloadRetries = 0; streamUsage = true; maxTokensParam = 'max_tokens';
    opts.onModel?.(next, fallback);
  };
  for (;;) {
    if (opts.local?.length && rounds > 4) compactToolHistory(convo, 4, 1200);
    let res: ChatOut;
    try {
      res = provider.kind === 'anthropic'
        ? await anthropicStream({ provider, model, system: opts.system, messages: convo, maxTokens, tools: tools.length ? tools : undefined, effort, signal: opts.signal, onText: (d) => { out += d; opts.onText(d); }, onThinking: opts.onThinking })
        : await chatStream({ provider, model, messages: convo, maxTokens, maxTokensParam, tools: tools.length ? tools : undefined, temperature, reasoning, streamUsage, signal: opts.signal, onText: (d) => { out += d; opts.onText(d); }, onThinking: opts.onThinking });
    } catch (e) {
      if (opts.signal?.aborted || !(e instanceof ProviderRequestError)) throw e;
      const msg = e.message;
      if (e.status === 400) {
        // A parameter this model does not take: fix the request and try the same model again.
        if (temperature !== undefined && /temperature/i.test(msg)) { console.warn('[provider] temperature not accepted by', model); temperature = undefined; continue; }
        if (maxTokensParam === 'max_tokens' && /max_completion_tokens/i.test(msg)) { console.warn('[provider]', model, 'takes max_completion_tokens'); maxTokensParam = 'max_completion_tokens'; continue; }
        if (/max_tokens|max_completion_tokens|output.?tokens|completion.?tokens/i.test(msg)) {
          // An output budget above what this model allows: come down a step and try again.
          const lower = MAX_TOKENS_STEPS.find(s => s < maxTokens);
          if (lower) { console.warn('[provider] max_tokens', maxTokens, 'not accepted by', model, '; trying', lower); maxTokens = lower; continue; }
        }
        if (reasoning && /reasoning/i.test(msg)) { console.warn('[provider] reasoning_effort not accepted by', model); reasoning = null; continue; }
        if (streamUsage && /stream_options/i.test(msg)) { console.warn('[provider] stream_options not accepted by', model); streamUsage = false; continue; }
        if (!noPartial && /partial/i.test(msg)) {
          noPartial = true;
          for (const m of convo) if (m.role === 'assistant' && m.partial) { delete m.partial; convo.push({ role: 'user', content: 'Continue exactly where you left off, without repeating anything.' }); }
          continue;
        }
        // A conversation too long for any model: no other candidate will take it either.
        if (/context length|too long|maximum context|token limit|prompt is too long/i.test(msg) && !/credit|billing|balance|quota/i.test(msg)) throw e;
      }
      // Overloaded or rate limited: one short pause and a second try on the same model before moving on.
      if ((e.status === 429 || e.status === 529 || e.status === 503 || e.status === 502) && overloadRetries < 1) { overloadRetries++; await new Promise(r => setTimeout(r, 2000)); continue; }
      // The account refused (bad key, no credit): set the provider aside so nothing else waits on it for a while.
      if (e.status === 401 || e.status === 402 || e.status === 403 || (e.status === 400 && /credit|billing|balance|quota/i.test(msg))) markProviderDown(provider, `HTTP ${e.status}: ${msg.slice(0, 120)}`);
      // An id this account cannot use: set the pair aside for a while and refresh the provider's list once so the next pick is a listed model.
      if (e.status === 404) { setModelAside(provider, model, msg, ASIDE_NOT_FOUND_MS); if (!retriedModel) { retriedModel = true; await listProviderModels(provider, true); } }
      // Anything the provider refuses before a word is written: hand the tier to the next candidate so the person still gets a result.
      if (out.length === 0 && tried.length <= MAX_SWITCHES) {
        const next = await resolveModel(opts.tier, tried); const np = providerFor(next, opts.tier);
        if (next !== model && np && providerUsable(np)) {
          const why = `HTTP ${e.status}: ${msg.slice(0, 160)}`;
          console.warn('[provider]', provider.id, 'failed, switching', model, '->', next, why);
          switchTo(next, { wanted: model, why }); continue;
        }
      }
      throw e;
    }
    usage.in += res.usage.in; usage.out += res.usage.out; usage.cacheRead += res.usage.cacheRead; usage.cacheWrite += res.usage.cacheWrite || 0;
    markModelSeen(provider, model);
    console.log('[answer]', JSON.stringify({ model, finish: res.finish, tools: res.toolCalls.length, chars: out.length, in: res.usage.in, out: res.usage.out, cacheRead: res.usage.cacheRead }));

    if (res.finish === 'tool_calls' && res.toolCalls.length && (rounds < maxRounds || !budgetClosed)) {
      convo.push({ role: 'assistant', content: res.text || null, tool_calls: res.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })), blocks: res.blocks });
      if (rounds >= maxRounds) {
        // The rounds this answer may spend on tools are used up: every pending call is answered with that, once, so the model writes from what it has.
        budgetClosed = true;
        for (const c of res.toolCalls) convo.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: 'ERROR: No more tool calls are available for this answer. Write the answer now from what you have seen, and say what was left undone.' });
        continue;
      }
      rounds++;
      for (const c of res.toolCalls) {
        const hit = lookup.get(c.name);
        const call: ToolCall = { server: hit ? (hit.kind === 'mcp' ? hit.spec.name : hit.set.name) : c.name, name: hit ? hit.tool : c.name };
        toolCalls.push(call); opts.onTool?.(call);
        let args: Record<string, unknown> = {}; try { args = c.arguments ? JSON.parse(c.arguments) : {}; } catch { args = {}; }
        if (hit?.kind === 'local') opts.onStatus?.(hit.set.status?.(hit.tool, args) || `Using ${hit.set.label}: ${call.name.replace(/_/g, ' ')}`);
        else opts.onStatus?.(`Using ${hit ? labelOf.get(hit.spec.name) || hit.spec.name : c.name}: ${call.name.replace(/_/g, ' ')}`);
        let text: string; let isError = false; let structured: unknown = undefined;
        if (!hit) { text = 'Unknown tool'; isError = true; }
        else if (hit.kind === 'local') {
          try { const r = await hit.set.call(hit.tool, args, opts.signal); text = r.text; isError = r.isError; structured = r.structured; }
          catch (e) { if (opts.signal?.aborted) throw e; text = String((e as Error)?.message || e); isError = true; }
        } else {
          try { const r = await callMcpTool(hit.spec.url, hit.spec.token, hit.tool, args, { signal: opts.signal }); text = r.text; isError = r.isError; structured = r.structured; }
          catch (e) { text = `The connector could not be reached: ${String((e as Error)?.message || e)}`; isError = true; }
        }
        call.error = isError; opts.onTool?.(call);
        if (!isError && opts.onToolResult) { try { const replaced = opts.onToolResult(call, { text, isError, structured, args }); if (typeof replaced === 'string') text = replaced; } catch (e) { console.warn('[mcp] onToolResult failed', e); } }
        console.log('[tool]', call.server, call.name, isError ? 'error' : 'ok', text.length);
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

/**
 * A browsing answer reads a page after every action; keeping every full page in the conversation would grow it by
 * thousands of tokens a step. All but the last `keep` tool results are cut to their opening lines (the header that
 * says which page it was and what happened), so the model keeps the trail without the text.
 */
function compactToolHistory(convo: ChatMessage[], keep: number, maxChars: number): void {
  const idx = convo.map((m, i) => (m.role === 'tool' ? i : -1)).filter(i => i >= 0);
  for (const i of idx.slice(0, Math.max(0, idx.length - keep))) {
    const m = convo[i]; const c = m.content || '';
    if (c.length <= maxChars || c.endsWith('(earlier page text trimmed)')) continue;
    m.content = c.slice(0, maxChars).replace(/\s+\S*$/, '') + '\n…(earlier page text trimmed)';
  }
}

/** The conversation as an OpenAI-compatible provider wants it: the wire fields only (no Anthropic replay blocks; Moonshot's `partial` flag kept). */
function toChatMessages(convo: ChatMessage[]): Array<Omit<ChatMessage, 'blocks'>> {
  return convo.map(m => { const { blocks: _blocks, ...rest } = m; void _blocks; return rest; });
}

/** One streamed chat completion on an OpenAI-compatible provider. Parses the SSE stream, collects text, tool calls and usage. */
async function chatStream(o: { provider: Provider; model: string; messages: ChatMessage[]; maxTokens: number; maxTokensParam?: 'max_tokens' | 'max_completion_tokens'; tools?: FunctionTool[]; temperature?: number; reasoning?: string | null; streamUsage?: boolean; signal?: AbortSignal; onText: (d: string) => void; onThinking?: (d: string) => void }): Promise<ChatOut> {
  const body: Record<string, unknown> = { model: o.model, messages: toChatMessages(o.messages), [o.maxTokensParam || 'max_tokens']: o.maxTokens, stream: true };
  if (o.streamUsage !== false) body.stream_options = { include_usage: true };
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.tools?.length) { body.tools = o.tools; body.tool_choice = 'auto'; }
  if (o.reasoning) body.reasoning_effort = o.reasoning;
  const res = await fetch(`${o.provider.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.provider.key}` }, body: JSON.stringify(body), signal: o.signal });
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
async function anthropicStream(o: { provider: Provider; model: string; system: SystemBlock[]; messages: ChatMessage[]; maxTokens: number; tools?: FunctionTool[]; effort: string | null; signal?: AbortSignal; onText: (d: string) => void; onThinking?: (d: string) => void }): Promise<ChatOut> {
  const key = o.provider.key; if (!key) throw new ProviderRequestError(401, `No API key for ${o.provider.name}`);
  const system: ABlock[] = o.system.filter(b => b.text.trim()).map(b => b.cache ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: b.text });
  const body: Record<string, unknown> = { model: o.model, max_tokens: o.maxTokens, stream: true, system, messages: toAnthropicMessages(o.messages), thinking: { type: 'adaptive' } };
  if (o.effort) body.output_config = { effort: o.effort };
  if (o.tools?.length) body.tools = o.tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  const res = await fetch(`${o.provider.baseUrl}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify(body), signal: o.signal });
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
  if (Array.isArray(parsed)) parsed = parsed[0];   // Google's OpenAI-compatible endpoint wraps its error in an array
  const err = (parsed as { error?: { message?: string; type?: string; status?: string } })?.error;
  return new ProviderRequestError(res.status, err?.message || raw.slice(0, 300) || `HTTP ${res.status}`, parsed, String(err?.type || err?.status || ''));
}

/**
 * Room for a thinking model's reasoning on top of the answer in a structured call. Both Kimi (`reasoning_effort`) and
 * Claude (adaptive thinking) count their thinking against `max_tokens`, so a budget sized for the JSON alone comes
 * back as thinking with the answer cut off (Discover on Kimi K2.6 spent exactly its 5,000 tokens thinking, every time).
 */
const THINKING_ROOM: Record<string, number> = { low: 4000, medium: 8000, high: 16000, xhigh: 24000, max: 32000 };
/** Models that think before they answer whether or not an effort parameter is sent (Kimi K3 and K2.6 and later, the thinking variants, the reasoning families). */
function thinkingModel(model: string): boolean { return /k3|k2\.[6-9]|k2-?thinking|thinking|reason|^o[1-9](-|$)|^gpt-5|^gemini-(2\.5|3)|^grok-.*mini|magistral/i.test(model); }
/**
 * Thinking effort for a structured call: the tier's, capped at medium (low on Kimi K3, which has no medium), since a
 * JSON answer gains little from long deliberation.
 */
function jsonEffort(effort: string | null, model = ''): string | null {
  if (!effort) return null;
  const capped = effort === 'high' || effort === 'xhigh' || effort === 'max' ? 'medium' : effort;
  return capped === 'medium' && /k3/i.test(model) ? 'low' : capped;
}
/** How long one structured call may take: planning before an answer cannot hold the person for minutes; an idea set may take longer. */
const JSON_TIMEOUT_MS: Record<Tier, number> = { quick: 60_000, default: 60_000, complex: 90_000, build: 120_000, ideas: 120_000 };
function jsonTimeout(tier: Tier): number {
  const override = process.env.NODE_ENV !== 'production' ? Number(process.env.JSON_TIMEOUT_MS || 0) : 0;   // tests shorten the wait
  return override > 0 ? override : JSON_TIMEOUT_MS[tier];
}

/**
 * Small structured call (query planning, rewrites, Home suggestions, Discover ideas). Returns parsed JSON or null.
 * The tier picks the model: `quick` by default; `ideas` for Discover, which goes to the build model. `maxTokens` is
 * the room the answer itself needs; thinking gets its own room on top, or is turned off where the model allows it
 * (Kimi K2.5 and K2.6). A reply cut off by its budget is tried once more on the same model with twice the room and
 * the least thinking. A model the provider does not know, or one that runs past the time limit, is set aside; it and
 * a reply with no JSON in it hand the call to the next candidate, up to three models in all. A prompt no model can
 * take is final.
 */
export async function quickJson<T = unknown>(prompt: string, maxTokens = 400, tier: Tier = 'quick'): Promise<T | null> {
  if (mockMode()) return null;
  const system = 'Reply with valid JSON only: no prose, no markdown fences.';
  const tried: string[] = []; let answers = 0;
  while (answers < 3 && tried.length < 8) {
    const model = await resolveModel(tier, tried);
    if (!model || tried.includes(model)) break;
    tried.push(model);
    let provider: Provider;
    try { provider = requireProvider(model, tier); } catch { return null; }
    answers++;
    try {
      // The thinking control this model takes: an effort level, an off switch, or nothing (it thinks on its own terms); and the room its thinking needs.
      const noThinking = provider.kind !== 'anthropic' && canDisableThinking(model);
      let effort = noThinking ? null : jsonEffort(provider.kind === 'anthropic' ? effortFor(tier, model) : reasoningFor(tier, model), model);
      const thinks = !noThinking && (!!effort || provider.kind === 'anthropic' || thinkingModel(model));
      let room = maxTokens + (thinks ? THINKING_ROOM[effort || jsonEffort(DEFAULT_REASONING[tier], model) || 'medium'] || 8000 : 0);
      for (let pass = 0; pass < 2; pass++) {
        let text = ''; let finish = 'stop'; let out = 0;
        if (provider.kind === 'anthropic') {
          const r = await anthropicStream({ provider, model, system: [{ text: system }], messages: [{ role: 'user', content: prompt }], maxTokens: room, effort, onText: (d) => { text += d; } });
          finish = r.finish; out = r.usage.out;
          console.log('[json]', JSON.stringify({ model, tier, in: r.usage.in, out, cacheRead: r.usage.cacheRead, finish, effort, room }));
        } else {
          const body: Record<string, unknown> = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
          const temp = temperatureFor(model, 0.4); if (temp !== undefined) body.temperature = temp;
          if (effort) body.reasoning_effort = effort;
          if (noThinking) body.thinking = { type: 'disabled' };
          if (provider.id === 'moonshot') body.response_format = { type: 'json_object' };
          const j = await chatOnce(provider, body, room, jsonTimeout(tier));
          text = j.choices?.[0]?.message?.content || ''; finish = j.choices?.[0]?.finish_reason || 'stop'; out = j.usage?.completion_tokens || 0;
          console.log('[json]', JSON.stringify({ model, tier, in: j.usage?.prompt_tokens, out, finish, effort, thinking: noThinking ? 'off' : 'on', room }));
        }
        markModelSeen(provider, model);
        const parsed = parseJsonLoosely<T>(text);
        if (parsed !== null) return parsed;
        // Cut off by the budget (or thought the whole budget away): once more with twice the room and the least thinking.
        const cut = finish === 'length' || (!text.trim() && out >= room - 16);
        if (!cut || pass === 1) { console.warn('[json] no JSON in the reply', JSON.stringify({ model, tier, finish, chars: text.length, out })); break; }
        effort = effort ? 'low' : null; room = room * 2;
      }
    } catch (e) {
      const p = describeProviderError(e);
      console.warn('[provider] quickJson failed', JSON.stringify({ model, provider: provider.id, tier, code: p.code, status: p.status, type: p.type, message: p.message }));
      if (p.code === 'provider_auth' || p.code === 'provider_billing') markProviderDown(provider, p.message);
      // A model the provider does not know, or one that will not answer in time, is set aside; the next candidate takes the call (an unknown id costs no attempt).
      if (p.status === 404) { answers--; setModelAside(provider, model, p.message, ASIDE_NOT_FOUND_MS); continue; }
      if (isTimeout(e)) { setModelAside(provider, model, 'ran past the time limit on a structured call', ASIDE_SLOW_MS); continue; }
      // A prompt no model can take is final. Any other refusal of the request (a key the account cannot use for
      // this model, a parameter it will not take) sets the pair aside for a while and hands the call on.
      if (p.code === 'prompt_too_large') return null;
      if (p.code === 'invalid_request') setModelAside(provider, model, p.message, ASIDE_SLOW_MS);
    }
  }
  return null;
}

/**
 * One unstreamed chat completion, with the parameter names this model takes: newer OpenAI models want
 * `max_completion_tokens` and no temperature; older ones and most other providers want `max_tokens`.
 */
async function chatOnce(provider: Provider, body: Record<string, unknown>, maxTokens: number, timeoutMs = 120_000): Promise<{ choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  let tokensParam = 'max_tokens';
  let budget = maxTokens;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ ...body, [tokensParam]: budget }), signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return await res.json();
    const err = await providerError(res);
    if (err.status === 400 && tokensParam === 'max_tokens' && /max_completion_tokens/i.test(err.message)) { tokensParam = 'max_completion_tokens'; continue; }
    // A budget past what the model allows (a thinking model given room for its reasoning): try again with half.
    if (err.status === 400 && budget > 2048 && /max_tokens|max_completion_tokens|maximum.{0,40}tokens|too (?:large|long|many)/i.test(err.message)) { budget = Math.floor(budget / 2); continue; }
    if (err.status === 400 && body.temperature !== undefined && /temperature/i.test(err.message)) { delete body.temperature; continue; }
    if (err.status === 400 && body.reasoning_effort && /reasoning/i.test(err.message)) { delete body.reasoning_effort; continue; }
    if (err.status === 400 && body.thinking && /thinking/i.test(err.message)) { delete body.thinking; continue; }
    if (err.status === 400 && body.response_format && /response_format|json_object|json/i.test(err.message)) { delete body.response_format; continue; }
    throw err;
  }
  throw new ProviderRequestError(400, 'The request could not be shaped for this model');
}

/** The first JSON array or object in a reply, fences and prose around it ignored. */
export function parseJsonLoosely<T>(text: string): T | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']'); const oa = t.indexOf('{'), ob = t.lastIndexOf('}');
  const slice = a >= 0 && (oa < 0 || a < oa) ? t.slice(a, b + 1) : t.slice(oa, ob + 1);
  try { return JSON.parse(slice) as T; } catch { return null; }
}

async function mockStream(opts: { system?: SystemBlock[]; messages: Msg[]; search?: SearchOpts | null; mcp?: McpServerSpec[] | null; local?: LocalToolSet[] | null; onText: (d: string) => void; onSources?: (s: Source[]) => void; onStatus?: (t: string) => void; onTool?: (call: ToolCall) => void; onToolResult?: (call: ToolCall, result: { text: string; isError: boolean; structured: unknown; args: Record<string, unknown> }) => string | void; signal?: AbortSignal }, model: string): Promise<StreamResult> {
  if (opts.system?.[0]?.text.startsWith("You are Ricorsa's builder")) return mockBuild(opts, model);
  const q = opts.messages[opts.messages.length - 1]?.content.split('Question:').pop()?.trim().split('\n')[0].trim().slice(0, 80) || 'your question';
  const sources: Source[] = opts.search ? mockSources(q) : [];
  if (opts.search) { opts.onStatus?.(`Searching: ${q.slice(0, 60)}`); await new Promise(r => setTimeout(r, 300)); opts.onSources?.(sources); }
  // With the browser offered, the stub works a site the way the model would: open the address in the question, follow the
  // first link, scroll, look something up, and report the pages it saw. Exercises the pane, the steps and the metering locally.
  const browser = (opts.local || []).find(l => l.name === 'browser');
  if (browser) {
    const full = opts.messages[opts.messages.length - 1]?.content || '';
    const m = full.match(/https?:\/\/[^\s)>\]]+/i) || full.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/\S*)?/i);
    const url = m ? m[0].replace(/[.,;:!?]+$/, '') : 'https://example.com/';
    const toolCalls: ToolCall[] = []; const seen: string[] = []; const notes: string[] = [];
    const run = async (name: string, args: Record<string, unknown>) => {
      const call: ToolCall = { server: 'browser', name }; toolCalls.push(call); opts.onTool?.(call);
      opts.onStatus?.(browser.status?.(name, args) || `Using the browser: ${name}`);
      let r: ToolOutcome; try { r = await browser.call(name, args, opts.signal); } catch (e) { if (opts.signal?.aborted) throw e; r = { text: String((e as Error)?.message || e), isError: true }; }
      call.error = r.isError; opts.onTool?.(call);
      if (r.isError) notes.push(r.text.slice(0, 160));
      const page = r.text.match(/Page: "([^"]*)" (\S+)(?: · cite this page as \[(\d+)\])?/);
      if (page && !seen.some(x => x.startsWith(page[2] + ' ') || x === page[2])) seen.push(page[2] + (page[3] ? ` [${page[3]}]` : ''));
      return r;
    };
    const first = await run('browser_open', { url });
    if (!first.isError) {
      const link = first.text.match(/\[(\d+)\|link "([^"]{2,60})"/);
      if (link) await run('browser_click', { ref: Number(link[1]), why: `Following "${link[2]}"` });
      await run('browser_scroll', { to: 'down' });
      const word = q.split(/\s+/).filter(w => w.length > 5 && !/^https?:/.test(w))[0];
      if (word) await run('browser_find', { text: word.replace(/[^a-z0-9]/gi, '') || word });
      const field = first.text.match(/\[(\d+)\|input (?:search|text) "([^"]*)"/);
      if (field) await run('browser_type', { ref: Number(field[1]), text: 'ricorsa', submit: false });
    }
    const cites = seen.map(s => (s.match(/\[(\d+)\]$/) || [])[1]).filter(Boolean);
    const text = `<answer>
This is the development stub's report after working the site in Ricorsa's browser${cites[0] ? `[${cites[0]}]` : ''}.

## What was done
${seen.length ? seen.map((s, i) => `- Page ${i + 1}: ${s.replace(/ \[\d+\]$/, '')}${cites[i] ? `[${cites[i]}]` : ''}`).join('\n') : '- The site could not be opened.'}
${notes.length ? `\n## What did not work\n${notes.map(n => `- ${n.replace(/</g, '&lt;')}`).join('\n')}\n` : ''}
In production the model reads each page and decides the next step itself; the steps and screenshots on the right are real.
</answer>
<related>
What else is on that site?
Can you fill in the contact form with my details?
Where is the pricing page?
Which pages did you open?
Can you compare it with a competitor's site?
</related>
<learned>
{"intent":"You are trying out Ricorsa's browser on a site","topics":["website automation"],"entities":[],"goals":[],"expertise":[],"style":[],"places":[]}
</learned>`;
    for (let i = 0; i < text.length; i += 32) {
      if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      await new Promise(r => setTimeout(r, 8));
      opts.onText(text.slice(i, i + 32));
    }
    return { text, truncated: false, model, sources, usage: { in: 2400, out: 400, cacheRead: 0, cacheWrite: 0, searches: sources.length ? 1 : 0 }, tools: toolCalls };
  }
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
  // A place named in the question ("... in Pearland, Texas") is learned as a place, so the map view can be exercised locally.
  const placeMatch = q.match(/\b(?:in|at|near|around) ((?:[A-Z][\w'.-]+)(?: [A-Z][\w'.-]+)*(?:, [A-Z][a-z]+)?)/);
  const places = placeMatch ? [placeMatch[1].replace(/[?.!,]+$/, '')] : [];
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
${/connector|console|my apps|what can i|set ?up/i.test(q) ? `
A console, as the model would add when the answer is about your own setup:

\`\`\`console
{"title":"Your Ricorsa setup","subtitle":"Mock console from the development stub","items":[{"title":"GitHub","detail":"Repositories, issues, pull requests and code search.","status":"available","actions":[{"label":"Add","do":"connector.add","id":"github"}]},{"title":"Discover","detail":"Ideas to build from your identity graph.","actions":[{"label":"Open","do":"open","to":"#/discover"}]},{"title":"Keep going","detail":"Ask what else you could connect.","actions":[{"label":"Ask","do":"ask","text":"What else could I connect to Ricorsa?"}]}],"footer":"Buttons act on your account; nothing happens until you press one."}
\`\`\`
` : ''}</answer>
<related>
How does prompt caching lower the cost per answer?
What happens when a subscription lapses mid-month?
How is the identity graph kept private to one person?
Can Research mode run more than one search?
Where do exported files go?
</related>
<learned>
{"intent":"You are checking that the Ricorsa pipeline works end to end before wiring real keys","topics":["${q.replace(/"/g, '')}","developer testing"],"entities":["Ricorsa"],"goals":["ship the SaaS build"],"expertise":[{"area":"web development","level":"intermediate"}],"style":["wants a table"],"places":${JSON.stringify(places)}}
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
  // A change to an existing version comes back as edits, the way production answers a local change; findings from a check too.
  const isRepair = /A real browser opened this version|A review of this version found/.test(request);
  if (request && /Here is the current version of the app/.test(last)) {
    const anchor = '<p>A mock build from the development stub. Add a few items below.</p>';
    const full = `<plan>\n- ${isRepair ? 'Fixed what the check found' : request.replace(/</g, '&lt;').slice(0, 80)}\n</plan>\n<edits>\n<edit>\n<find>\n${anchor}\n</find>\n<replace>\n${anchor}${note}\n</replace>\n</edit>\n</edits>\n<next>\nAdd a due date to each item\nAdd a filter for done and open items\nAdd export to CSV\nMake it work well on a phone\n</next>`;
    for (let i = 0; i < full.length; i += 40) {
      if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      await new Promise(r => setTimeout(r, 12));
      opts.onText(full.slice(i, i + 40));
    }
    return { text: full, truncated: false, model, sources: [], usage: { in: 900, out: 200, cacheRead: 0, cacheWrite: 0, searches: 0 }, tools: [] };
  }
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
<ul id="l"></ul><p id="c"></p>
<section id="askbox"><h2 style="font-size:16px;margin:24px 0 6px">Ask</h2><form id="af"><input id="aq" placeholder="Ask the model something" aria-label="Question"><button type="submit" id="ab">Ask</button></form><p id="aa" aria-live="polite"></p><p id="an" style="font-size:12px;color:#8a939c"></p></section>
<footer>Built by Ricorsa from your identity graph</footer></main>
<script>
var items=[];try{items=JSON.parse(localStorage.getItem('mock-items')||'[]')}catch(e){}
(function(){var f=document.getElementById('af'),q=document.getElementById('aq'),a=document.getElementById('aa'),n=document.getElementById('an'),b=document.getElementById('ab');
if(!(window.ricorsa&&window.ricorsa.available)){n.textContent='Live answers work when this app is opened from Ricorsa.';}
f.addEventListener('submit',function(e){e.preventDefault();var t=q.value.trim();if(!t)return;if(!(window.ricorsa&&window.ricorsa.available)){a.textContent='Sample answer (offline): '+t;return;}
b.disabled=true;a.textContent='';window.ricorsa.ask(t,{system:'Answer in one short paragraph.',onText:function(d,full){a.textContent=full;}}).then(function(r){a.textContent=r.text;n.textContent='Answered by Ricorsa';}).catch(function(err){a.textContent=err.message;}).then(function(){b.disabled=false;});});})();
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
