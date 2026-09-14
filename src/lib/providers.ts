/**
 * Model providers: who serves which model, with which key. Two wire protocols cover every provider Ricorsa
 * talks to: Anthropic's Messages API, and the OpenAI-compatible chat completions API that OpenAI, Google Gemini,
 * xAI, Mistral, DeepSeek, Groq, Moonshot (Kimi), OpenRouter, Together and most others speak.
 *
 * A provider is configured by an API key from the environment (the secrets on the worker) or by a key an admin
 * pasted under Settings → Model accounts (kept sealed in the config table; an account key outranks the
 * environment). Its model list is fetched from the provider and cached, so any model the account can use can be
 * chosen as the active model for a tier. A provider that refuses (rejected key, no credit) is set aside for ten
 * minutes so answers and builds fall to the next one without waiting on it.
 */
import { eq, like } from 'drizzle-orm';
import { db, schema } from './db';
import { sealJson, openJson } from './secretbox';

export type ProviderKind = 'anthropic' | 'openai';
export type ProviderDef = { id: string; name: string; kind: ProviderKind; baseUrl: string; envKeys: string[]; envBase?: string; docs: string; keyHint: string; /** Which model ids this provider serves, for routing before its list is known. */ match: RegExp; aggregator?: boolean };

export const PROVIDER_CATALOG: ProviderDef[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', envKeys: ['ANTHROPIC_API_KEY'], envBase: 'ANTHROPIC_BASE_URL', docs: 'https://console.anthropic.com/settings/keys', keyHint: 'An API key from console.anthropic.com (starts with sk-ant-).', match: /^claude-/i },
  { id: 'moonshot', name: 'Moonshot (Kimi)', kind: 'openai', baseUrl: 'https://api.moonshot.ai/v1', envKeys: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'], envBase: 'KIMI_BASE_URL', docs: 'https://platform.moonshot.ai/console/api-keys', keyHint: 'An API key from platform.moonshot.ai.', match: /^(kimi-|moonshot-)/i },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', envKeys: ['OPENAI_API_KEY'], envBase: 'OPENAI_BASE_URL', docs: 'https://platform.openai.com/api-keys', keyHint: 'An API key from platform.openai.com (starts with sk-).', match: /^(gpt-|o[1-9](-|$)|chatgpt-)/i },
  { id: 'google', name: 'Google (Gemini)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], envBase: 'GEMINI_BASE_URL', docs: 'https://aistudio.google.com/apikey', keyHint: 'An API key from Google AI Studio.', match: /^(gemini-|gemma-)/i },
  { id: 'xai', name: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', envKeys: ['XAI_API_KEY'], envBase: 'XAI_BASE_URL', docs: 'https://console.x.ai', keyHint: 'An API key from console.x.ai.', match: /^grok-/i },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', envKeys: ['MISTRAL_API_KEY'], envBase: 'MISTRAL_BASE_URL', docs: 'https://console.mistral.ai/api-keys', keyHint: 'An API key from console.mistral.ai.', match: /^(mistral-|codestral|magistral|ministral|pixtral|devstral|open-mistral|open-mixtral)/i },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', envKeys: ['DEEPSEEK_API_KEY'], envBase: 'DEEPSEEK_BASE_URL', docs: 'https://platform.deepseek.com/api_keys', keyHint: 'An API key from platform.deepseek.com.', match: /^deepseek-/i },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', envKeys: ['GROQ_API_KEY'], envBase: 'GROQ_BASE_URL', docs: 'https://console.groq.com/keys', keyHint: 'An API key from console.groq.com.', match: /^(llama|meta-llama\/|mixtral|gemma2|qwen|compound|openai\/gpt-oss)/i },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', envKeys: ['OPENROUTER_API_KEY'], envBase: 'OPENROUTER_BASE_URL', docs: 'https://openrouter.ai/keys', keyHint: 'An API key from openrouter.ai; one key reaches hundreds of models.', match: /\//, aggregator: true },
  { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', envKeys: ['TOGETHER_API_KEY'], envBase: 'TOGETHER_BASE_URL', docs: 'https://api.together.ai/settings/api-keys', keyHint: 'An API key from api.together.ai.', match: /\//, aggregator: true },
];

export type Provider = { id: string; name: string; kind: ProviderKind; baseUrl: string; key: string | null; source: 'env' | 'account' | 'none'; custom: boolean; aggregator: boolean; /** Model ids the provider listed; empty until fetched or when it has no list. */ models: string[]; modelsAt: number; status?: 'ok' | 'refused' | 'unchecked'; error?: string | null; checkedAt?: number | null; /** The model id to test a custom endpoint with, when it does not list its models. */ probeModel?: string | null };
type AccountRow = { sealed?: string; baseUrl?: string; name?: string; kind?: ProviderKind; addedAt?: number; checkedAt?: number; status?: 'ok' | 'refused'; error?: string | null; models?: string[]; probeModel?: string };

const REGISTRY_TTL_MS = 30_000;
const MODELS_TTL_MS = 10 * 60_000;
const MAX_MODELS = 400;
/** An admin's account for a provider, as read from the config table with its key opened. */
type Account = { id: string; key: string | null } & Omit<AccountRow, 'sealed'>;
let accounts: { at: number; list: Account[] } | null = null;
const modelCache = new Map<string, { ids: string[]; at: number }>();
const down = new Map<string, { key: string; until: number; why: string }>();
/** The last probe's outcome per provider, so an environment key's status shows on the admin screen too. */
const lastProbe = new Map<string, { status: 'ok' | 'refused'; error: string | null; checkedAt: number }>();

function envKey(def: ProviderDef): string | null { for (const k of def.envKeys) { const v = process.env[k]; if (v) return v; } return null; }
function envBase(def: ProviderDef): string { return ((def.envBase && process.env[def.envBase]) || def.baseUrl).replace(/\/+$/, ''); }

/** The registry, built from the environment as it is right now and the account keys as last read. */
function build(): Provider[] {
  const list: Provider[] = PROVIDER_CATALOG.map(d => { const key = envKey(d); return { id: d.id, name: d.name, kind: d.kind, baseUrl: envBase(d), key, source: key ? 'env' : 'none', custom: false, aggregator: !!d.aggregator, models: modelCache.get(d.id)?.ids || [], modelsAt: modelCache.get(d.id)?.at || 0 }; });
  for (const a of accounts?.list || []) {
    const def = PROVIDER_CATALOG.find(d => d.id === a.id);
    const existing = list.find(p => p.id === a.id);
    if (existing) { if (a.key) { existing.key = a.key; existing.source = 'account'; } if (a.baseUrl) existing.baseUrl = a.baseUrl.replace(/\/+$/, ''); existing.status = a.status; existing.error = a.error ?? null; existing.checkedAt = a.checkedAt ?? null; existing.probeModel = a.probeModel || null; if (!existing.models.length && a.models?.length) { existing.models = a.models; existing.modelsAt = a.checkedAt || 0; } }
    else if (a.baseUrl) list.push({ id: a.id, name: a.name || a.id, kind: a.kind || 'openai', baseUrl: a.baseUrl.replace(/\/+$/, ''), key: a.key, source: a.key ? 'account' : 'none', custom: !def, aggregator: false, models: modelCache.get(a.id)?.ids || a.models || [], modelsAt: modelCache.get(a.id)?.at || a.checkedAt || 0, status: a.status, error: a.error ?? null, checkedAt: a.checkedAt ?? null, probeModel: a.probeModel || null });
  }
  for (const p of list) { const lp = lastProbe.get(p.id); if (lp && (!p.checkedAt || lp.checkedAt > p.checkedAt)) { p.status = lp.status; p.error = lp.error; p.checkedAt = lp.checkedAt; } }
  return list;
}

/** A provider as the admin screen shows it: everything but the key itself. */
export function providerForClient(p: Provider) {
  const def = PROVIDER_CATALOG.find(d => d.id === p.id);
  return {
    id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, source: p.source, custom: p.custom, aggregator: p.aggregator,
    configured: !!p.key, usable: providerUsable(p), setAside: providerSetAside(p), status: p.status || null, error: p.error || null, checkedAt: p.checkedAt || null,
    models: p.models, modelsAt: p.modelsAt || null, probeModel: p.probeModel || null, docs: def?.docs || null, keyHint: def?.keyHint || (p.custom ? 'The API key the endpoint expects as a bearer token.' : null), envKeys: def?.envKeys || [],
  };
}
export type ClientProvider = ReturnType<typeof providerForClient>;

/** Every provider Ricorsa knows about, with its key and source; the ones without a key have source 'none'. Account keys are re-read every thirty seconds. */
export async function loadProviders(force = false): Promise<Provider[]> {
  if (force || !accounts || Date.now() - accounts.at >= REGISTRY_TTL_MS) {
    const list: Account[] = [];
    try {
      const rows = await db().select().from(schema.config).where(like(schema.config.key, 'provider:%'));
      for (const row of rows) {
        const id = row.key.slice('provider:'.length); const { sealed, ...v } = row.value as AccountRow;
        const key = sealed ? (await openJson<{ apiKey?: string }>(sealed))?.apiKey || null : null;
        list.push({ id, key, ...v });
      }
    } catch (e) { console.warn('[providers] account keys unavailable', String((e as Error)?.message || e)); }
    accounts = { at: Date.now(), list };
  }
  return build();
}
/** The registry for synchronous callers: the environment as it is now plus the account keys as last read (none before the first load). */
export function providersNow(): Provider[] { return build(); }
export async function providerById(id: string): Promise<Provider | null> { return (await loadProviders()).find(p => p.id === id) || null; }
export function forgetProviders() { accounts = null; }

/** Whether the provider can be used right now: a key is set and it has not refused recently. */
export function providerUsable(p: Provider): boolean {
  if (!p.key) return false;
  const d = down.get(p.id);
  return !(d && d.key === p.key && Date.now() < d.until);
}
export function markProviderDown(p: Provider, why: string) { if (!p.key) return; down.set(p.id, { key: p.key, until: Date.now() + 600_000, why }); console.warn('[provider]', p.id, 'set aside for ten minutes:', why); }
export function clearProviderDown(p: Provider) { down.delete(p.id); }
export function providerSetAside(p: Provider): { until: string; why: string } | null { const d = down.get(p.id); return d && p.key && d.key === p.key && Date.now() < d.until ? { until: new Date(d.until).toISOString(), why: d.why } : null; }

/** The model ids a provider serves, from its own list; cached ten minutes. Empty when it cannot be fetched. */
export async function listProviderModels(p: Provider, force = false): Promise<string[]> {
  const c = modelCache.get(p.id);
  if (!force && c && Date.now() - c.at < MODELS_TTL_MS) return c.ids;
  if (!p.key) return c?.ids || [];
  try {
    const url = p.kind === 'anthropic' ? `${p.baseUrl}/v1/models?limit=100` : `${p.baseUrl}/models`;
    const headers: Record<string, string> = p.kind === 'anthropic' ? { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${p.key}` };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { console.warn('[providers] models list', p.id, res.status); return c?.ids || []; }
    const j = await res.json() as { data?: Array<{ id?: string; name?: string }> };
    const ids = (j.data || []).map(m => String(m.id || m.name || '')).map(id => id.replace(/^models\//, '')).filter(Boolean).slice(0, MAX_MODELS);
    modelCache.set(p.id, { ids, at: Date.now() });
    p.models = ids; p.modelsAt = Date.now();
    return ids;
  } catch (e) { console.warn('[providers] models list failed', p.id, String((e as Error)?.message || e)); return c?.ids || []; }
}

export type ProbeResult = { ok: boolean; status: number; message: string; model: string; models: number; ms: number };

/** Ask the provider for its model list and one one-token message, so the exact answer (bad key, no credit, unknown model) is on record. Success lifts a set-aside. */
export async function probeProvider(p: Provider, model?: string): Promise<ProbeResult> {
  const started = Date.now();
  if (!p.key) return { ok: false, status: 0, message: 'No API key for this provider', model: model || '', models: 0, ms: 0 };
  const ids = await listProviderModels(p, true);
  const m = model || p.probeModel || defaultProbeModel(p, ids);
  // A custom endpoint with no list and no model id to try: the list is all there is to go on.
  if (!m) return note(p, { ok: ids.length > 0, status: ids.length ? 200 : 0, message: ids.length ? `${p.name} listed ${ids.length} models` : 'No model list came back; give a model id to test with', model: '', models: ids.length, ms: Date.now() - started });
  try {
    let res: Response;
    if (p.kind === 'anthropic') {
      res = await fetch(`${p.baseUrl}/v1/messages`, { method: 'POST', headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: m, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }), signal: AbortSignal.timeout(20_000) });
    } else {
      res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${p.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: m, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }), signal: AbortSignal.timeout(20_000) });
    }
    const text = await res.text();
    if (res.ok) { clearProviderDown(p); return note(p, { ok: true, status: res.status, message: `${p.name} accepted a message on ${m}`, model: m, models: ids.length, ms: Date.now() - started }); }
    let message = text.slice(0, 300);
    try { const j = JSON.parse(text) as { error?: { type?: string; message?: string; code?: string } | string }; const e = typeof j.error === 'string' ? { message: j.error } : j.error; if (e?.message) message = `${e.type || e.code || 'error'}: ${e.message}`.slice(0, 300); } catch { /* not JSON */ }
    // A model this key cannot use is not a dead provider: the list is still good and another model may work.
    if (res.status === 404 && ids.length) return note(p, { ok: false, status: res.status, message, model: m, models: ids.length, ms: Date.now() - started });
    if (res.status === 401 || res.status === 402 || res.status === 403 || (res.status === 400 && /credit|billing|balance|quota/i.test(message))) markProviderDown(p, `HTTP ${res.status}: ${message.slice(0, 120)}`);
    return note(p, { ok: false, status: res.status, message, model: m, models: ids.length, ms: Date.now() - started });
  } catch (e) { return note(p, { ok: false, status: 0, message: String((e as Error)?.message || e).slice(0, 200), model: m, models: ids.length, ms: Date.now() - started }); }
}
function note(p: Provider, r: ProbeResult): ProbeResult {
  lastProbe.set(p.id, { status: r.ok ? 'ok' : 'refused', error: r.ok ? null : r.message, checkedAt: Date.now() });
  p.status = r.ok ? 'ok' : 'refused'; p.error = r.ok ? null : r.message; p.checkedAt = Date.now();
  return r;
}
function defaultProbeModel(p: Provider, ids: string[]): string {
  const pick = (re: RegExp) => ids.find(id => re.test(id));
  switch (p.id) {
    case 'anthropic': return pick(/^claude-fable/) || pick(/^claude-(sonnet|haiku)/) || ids[0] || 'claude-fable-5-1';
    case 'moonshot': return pick(/^kimi-k3$/) || pick(/^kimi-/) || ids[0] || 'kimi-k3';
    case 'openai': return pick(/^gpt-5(\.\d+)?-mini$/) || pick(/^gpt-4\.1-mini$/) || pick(/^gpt-4o-mini$/) || pick(/^gpt-/) || ids[0] || 'gpt-4.1-mini';
    case 'google': return pick(/^gemini-2\.5-flash$/) || pick(/^gemini-.*flash/) || pick(/^gemini-/) || ids[0] || 'gemini-2.5-flash';
    case 'xai': return pick(/^grok-.*mini/) || pick(/^grok-/) || ids[0] || 'grok-4';
    case 'mistral': return pick(/^mistral-small/) || pick(/^mistral-/) || ids[0] || 'mistral-small-latest';
    case 'deepseek': return pick(/^deepseek-chat/) || ids[0] || 'deepseek-chat';
    case 'groq': return pick(/llama-3\.[13]-8b/) || pick(/llama/) || ids[0] || 'llama-3.1-8b-instant';
    default: return ids.find(id => !/embed|whisper|tts|image|dall|moderation|audio|realtime/i.test(id)) || ids[0] || '';
  }
}

/** Which configured provider serves a model id. An explicit provider wins; then the one whose list has it; then the catalog's patterns; then the first usable OpenAI-compatible provider. */
export function providerForModel(model: string, hint?: string | null): Provider | null {
  const list = providersNow().filter(p => p.key);
  if (hint) { const h = list.find(p => p.id === hint); if (h) return h; }
  const listed = list.filter(p => p.models.includes(model));
  if (listed.length) return listed.find(p => !p.aggregator) || listed[0];
  for (const def of PROVIDER_CATALOG) { if (def.match.test(model)) { const p = list.find(x => x.id === def.id); if (p) return p; } }
  const def = PROVIDER_CATALOG.find(d => d.match.test(model));
  if (def) return null;   // a known family whose provider has no key: not reachable
  return list.find(p => p.kind === 'openai' && !p.aggregator) || list.find(p => p.kind === 'openai') || null;
}

/** Where the admin's account keys and choices live. */
export async function saveProviderAccount(id: string, patch: { apiKey?: string | null; baseUrl?: string | null; name?: string | null; kind?: ProviderKind; status?: 'ok' | 'refused'; error?: string | null; models?: string[]; probeModel?: string | null }): Promise<void> {
  const d = db(); const key = `provider:${id}`;
  const cur = ((await d.select().from(schema.config).where(eq(schema.config.key, key)).limit(1))[0]?.value || {}) as AccountRow;
  const next: AccountRow = { ...cur };
  if (patch.apiKey !== undefined) next.sealed = patch.apiKey ? await sealJson({ apiKey: patch.apiKey }) : undefined;
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl || undefined;
  if (patch.name !== undefined) next.name = patch.name || undefined;
  if (patch.kind) next.kind = patch.kind;
  if (patch.status) { next.status = patch.status; next.checkedAt = Date.now(); }
  if (patch.error !== undefined) next.error = patch.error;
  if (patch.models) next.models = patch.models.slice(0, MAX_MODELS);
  if (patch.probeModel !== undefined) next.probeModel = patch.probeModel || undefined;
  if (!next.addedAt) next.addedAt = Date.now();
  await d.insert(schema.config).values({ key, value: next as Record<string, unknown>, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.config.key, set: { value: next as Record<string, unknown>, updatedAt: new Date() } });
  forgetProviders();
}
export async function removeProviderAccount(id: string): Promise<void> {
  await db().delete(schema.config).where(eq(schema.config.key, `provider:${id}`));
  modelCache.delete(id); down.delete(id); lastProbe.delete(id); forgetProviders();
}

export type TierChoice = { provider: string; model: string };
export type ModelSettings = Partial<Record<'quick' | 'default' | 'complex' | 'build' | 'ideas', TierChoice>>;
let settingsCache: { at: number; value: ModelSettings } | null = null;
/** The active model per tier as chosen under Settings → Model accounts; empty entries fall back to the environment. */
export async function modelSettings(force = false): Promise<ModelSettings> {
  if (!force && settingsCache && Date.now() - settingsCache.at < REGISTRY_TTL_MS) return settingsCache.value;
  let value: ModelSettings = {};
  try { const row = (await db().select().from(schema.config).where(eq(schema.config.key, 'models')).limit(1))[0]; if (row) value = (row.value || {}) as ModelSettings; } catch { /* unset */ }
  settingsCache = { at: Date.now(), value };
  return value;
}
export function modelSettingsNow(): ModelSettings { return settingsCache?.value || {}; }
export async function saveModelSettings(next: ModelSettings): Promise<void> {
  await db().insert(schema.config).values({ key: 'models', value: next as Record<string, unknown>, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.config.key, set: { value: next as Record<string, unknown>, updatedAt: new Date() } });
  settingsCache = { at: Date.now(), value: next };
}
