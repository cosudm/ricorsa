/**
 * The models Ricorsa offers by name, the way Perplexity does: Auto (Ricorsa picks the model for each question) and a
 * short list of named models, each resolved to the id its maker serves today and offered only while it answers.
 * Ricorsa supplies every model: the keys are the company's (environment or Model accounts), customers add none.
 *
 * Each catalog entry names the model's home provider and how to find it on that provider's list (ids drift as new
 * versions ship; the newest match wins), the same model on OpenRouter as the backstop when the home provider is
 * refusing or set aside, the role it plays (fast, balanced, deep, code), its price class (standard, one gas a
 * question; premium, three) and the tier whose thinking effort suits it. A health loop probes every entry at most
 * every ten minutes (from the gauge refresh, the health endpoint and the admin screen), sets a failing pair aside so
 * routing skips it, and records how long each model has been down so an outage is visible on the admin screen and
 * on /api/health/models before a customer meets it.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { loadProviders, providersNow, providerUsable, providerSetAside, listProviderModels, probeProvider, type Provider } from './providers';
import { setModelAside, modelAsideFor, markModelSeen, mockMode } from './llm';
import { GAS } from './plans';

/** The answer tiers a named model or Auto can use (the build and ideas tiers are the studio's and Discover's own). */
export type AnswerTier = 'quick' | 'default' | 'complex';
export type ModelClass = 'standard' | 'premium';
export type ModelRole = 'fast' | 'balanced' | 'deep' | 'code';
export type CatalogEntry = {
  id: string; maker: string; provider: string;
  /** How the model appears on its home provider's list; a capture group is the version, and the newest wins. */
  match: RegExp;
  /** The id to try when the provider gives no list. */
  fallbackId: string;
  /** The same model on OpenRouter, for the backstop; omitted when OpenRouter does not carry it. */
  openrouter?: RegExp;
  role: ModelRole; class: ModelClass; tier: AnswerTier; blurb: string;
  /** The display name; a function when the version is read from the id. */
  name: string | ((id: string) => string);
};

const version = (id: string, re: RegExp) => { const m = re.exec(id); return m ? m.slice(1).filter(Boolean).join('.') : ''; };

export const AUTO_ID = 'auto';
export const MODEL_CATALOG: CatalogEntry[] = [
  { id: 'kimi-k3', maker: 'Moonshot', provider: 'moonshot', match: /^kimi-k3$/i, fallbackId: 'kimi-k3', openrouter: /^moonshotai\/kimi-k3$/i, role: 'balanced', class: 'standard', tier: 'default', blurb: 'Strong all-round answers with sources', name: 'Kimi K3' },
  { id: 'kimi-k3-turbo', maker: 'Moonshot', provider: 'moonshot', match: /^kimi-k3-turbo$/i, fallbackId: 'kimi-k3-turbo', role: 'fast', class: 'standard', tier: 'quick', blurb: 'Snappy replies for simple questions', name: 'Kimi K3 Turbo' },
  { id: 'kimi-k2.6', maker: 'Moonshot', provider: 'moonshot', match: /^kimi-k2\.6$/i, fallbackId: 'kimi-k2.6', openrouter: /^moonshotai\/kimi-k2\.6$/i, role: 'balanced', class: 'standard', tier: 'default', blurb: 'Steady and thorough', name: 'Kimi K2.6' },
  { id: 'claude-fable', maker: 'Anthropic', provider: 'anthropic', match: /^claude-fable-(\d+)(?:-(\d+))?$/i, fallbackId: 'claude-fable-5-1', openrouter: /^anthropic\/claude-fable(?:-|\.)?(\d+(?:[.-]\d+)?)?$/i, role: 'deep', class: 'premium', tier: 'complex', blurb: 'Deepest reasoning; long, exacting work', name: id => `Claude Fable ${version(id, /fable-(\d+)(?:-(\d+))?/i) || version(id, /fable[-.]?(\d+(?:[.-]\d+)?)/i).replace('-', '.')}`.trim() },
  { id: 'claude-sonnet', maker: 'Anthropic', provider: 'anthropic', match: /^claude-sonnet-(\d+)(?:-(\d+))?$/i, fallbackId: 'claude-sonnet-5', openrouter: /^anthropic\/claude-sonnet(?:-|\.)?(\d+(?:[.-]\d+)?)?$/i, role: 'code', class: 'standard', tier: 'default', blurb: 'Quick, careful, good with code', name: id => `Claude Sonnet ${version(id, /sonnet-(\d+)(?:-(\d+))?/i) || version(id, /sonnet[-.]?(\d+(?:[.-]\d+)?)/i).replace('-', '.')}`.trim() },
  { id: 'gpt', maker: 'OpenAI', provider: 'openai', match: /^gpt-(\d+(?:\.\d+)?)$/i, fallbackId: 'gpt-5', openrouter: /^openai\/gpt-(\d+(?:\.\d+)?)$/i, role: 'deep', class: 'premium', tier: 'complex', blurb: 'Broad knowledge and careful reasoning', name: id => `GPT-${version(id, /gpt-(\d+(?:\.\d+)?)/i)}` },
  { id: 'gpt-mini', maker: 'OpenAI', provider: 'openai', match: /^gpt-(\d+(?:\.\d+)?)-mini$/i, fallbackId: 'gpt-5-mini', openrouter: /^openai\/gpt-(\d+(?:\.\d+)?)-mini$/i, role: 'fast', class: 'standard', tier: 'quick', blurb: 'Fast and inexpensive', name: id => `GPT-${version(id, /gpt-(\d+(?:\.\d+)?)/i)} mini` },
  { id: 'gemini-pro', maker: 'Google', provider: 'google', match: /^gemini-(\d+(?:\.\d+)?)-pro$/i, fallbackId: 'gemini-2.5-pro', openrouter: /^google\/gemini-(\d+(?:\.\d+)?)-pro$/i, role: 'deep', class: 'premium', tier: 'complex', blurb: 'Long documents and deep analysis', name: id => `Gemini ${version(id, /gemini-(\d+(?:\.\d+)?)/i)} Pro` },
  { id: 'gemini-flash', maker: 'Google', provider: 'google', match: /^gemini-(\d+(?:\.\d+)?)-flash$/i, fallbackId: 'gemini-2.5-flash', openrouter: /^google\/gemini-(\d+(?:\.\d+)?)-flash$/i, role: 'fast', class: 'standard', tier: 'quick', blurb: 'Quick answers over long inputs', name: id => `Gemini ${version(id, /gemini-(\d+(?:\.\d+)?)/i)} Flash` },
  { id: 'grok', maker: 'xAI', provider: 'xai', match: /^grok-(\d+(?:\.\d+)?)$/i, fallbackId: 'grok-4', openrouter: /^x-ai\/grok-(\d+(?:\.\d+)?)$/i, role: 'deep', class: 'premium', tier: 'complex', blurb: 'Reasoning with a current view of the web', name: id => `Grok ${version(id, /grok-(\d+(?:\.\d+)?)/i)}` },
  { id: 'deepseek-chat', maker: 'DeepSeek', provider: 'deepseek', match: /^deepseek-chat$/i, fallbackId: 'deepseek-chat', openrouter: /^deepseek\/deepseek-chat(?:-v\d+(?:\.\d+)?)?$/i, role: 'balanced', class: 'standard', tier: 'default', blurb: 'Capable and economical', name: 'DeepSeek' },
  { id: 'deepseek-reasoner', maker: 'DeepSeek', provider: 'deepseek', match: /^deepseek-reasoner$/i, fallbackId: 'deepseek-reasoner', openrouter: /^deepseek\/deepseek-r\d+(?:-\d+)?$/i, role: 'deep', class: 'standard', tier: 'complex', blurb: 'Shows its reasoning; takes its time', name: 'DeepSeek Reasoner' },
  { id: 'mistral-large', maker: 'Mistral', provider: 'mistral', match: /^mistral-large-latest$/i, fallbackId: 'mistral-large-latest', openrouter: /^mistralai\/mistral-large(?:-\d+)?$/i, role: 'balanced', class: 'standard', tier: 'default', blurb: 'European model, strong in several languages', name: 'Mistral Large' },
];

export type OfferedModel = { id: string; name: string; maker: string; role: ModelRole; class: ModelClass; gas: number; blurb: string; available: boolean; via: 'home' | 'openrouter' | null };
/** A named model resolved for a request: the provider to call and the exact id to ask for. */
export type NamedPick = { entry: CatalogEntry; provider: Provider; model: string; via: 'home' | 'openrouter'; name: string; /** The same model on OpenRouter, when the pick is at home and OpenRouter lists it. */ backstop: { provider: Provider; model: string } | null };

export function catalogEntry(id: string): CatalogEntry | null { return MODEL_CATALOG.find(e => e.id === id) || null; }
/** A display name for any model id Ricorsa may have answered with: the catalog's name when the id is one of its models (at home or on OpenRouter), else a tidy form of the id. */
export function nameForId(id: string): string {
  const bare = id.includes('/') ? id.split('/').pop() || id : id;
  for (const e of MODEL_CATALOG) { if (e.match.test(bare) || (e.openrouter && e.openrouter.test(id))) return displayName(e, bare); }
  if (/^kimi-k(\d[\d.]*)/i.test(bare)) return 'Kimi K' + bare.match(/^kimi-k(\d[\d.]*)/i)![1] + (/code/i.test(bare) ? ' code' : '') + (/thinking/i.test(bare) ? ' thinking' : '') + (/turbo/i.test(bare) ? ' turbo' : '');
  if (/^claude-(\w+)-(\d+)(?:-(\d+))?/i.test(bare)) { const m = bare.match(/^claude-(\w+)-(\d+)(?:-(\d+))?/i)!; return `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`; }
  return bare.replace(/-(\d{4}-\d{2}-\d{2}|\d{8}|preview|latest)$/i, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
export function displayName(entry: CatalogEntry, id: string): string { return typeof entry.name === 'function' ? entry.name(id) : entry.name; }
/** What a question on this model costs: the premium class is priced as the Reasoning model was. */
export function gasForClass(cls: ModelClass): number { return cls === 'premium' ? GAS.reasoning : GAS.question; }

/** The newest id on a list matching `re` (its first capture group is the version); ties go to the shorter id. */
function newest(ids: string[], re: RegExp): string | undefined {
  let best: { id: string; v: number } | null = null;
  for (const id of ids) { const m = re.exec(id); if (!m) continue; const v = parseFloat(String(m[1] || '0').replace('-', '.')) || 0; if (!best || v > best.v || (v === best.v && id.length < best.id.length)) best = { id, v }; }
  return best?.id;
}

/** The id a provider serves for an entry: the newest match on its list; the fallback id when the provider gave no list. */
async function servedId(p: Provider, re: RegExp, fallbackId: string | null, fetch: boolean): Promise<string | null> {
  const ids = p.models.length ? p.models : (fetch && p.key ? await listProviderModels(p) : []);
  if (!ids.length) return fallbackId;
  return newest(ids, re) || null;
}

/**
 * Where a named model can be served right now: its home provider (a key, not set aside, the id on the list and not set
 * aside itself), else the same model on OpenRouter, else nowhere. `fetch` allows a model-list fetch when none is cached.
 */
export async function resolveNamed(id: string, fetch = true): Promise<NamedPick | null> {
  const entry = catalogEntry(id); if (!entry) return null;
  const list = providersNow();
  const home = list.find(p => p.id === entry.provider);
  const or = list.find(p => p.id === 'openrouter');
  const viaOpenRouter = async (): Promise<{ provider: Provider; model: string } | null> => {
    if (!entry.openrouter || !or || !providerUsable(or)) return null;
    const m = await servedId(or, entry.openrouter, null, fetch);
    return m && !modelAsideFor(or, m) ? { provider: or, model: m } : null;
  };
  if (home && providerUsable(home)) {
    const m = await servedId(home, entry.match, entry.fallbackId, fetch);
    if (m && !modelAsideFor(home, m)) return { entry, provider: home, model: m, via: 'home', name: displayName(entry, m), backstop: await viaOpenRouter() };
  }
  const bs = await viaOpenRouter();
  if (bs) return { entry, provider: bs.provider, model: bs.model, via: 'openrouter', name: displayName(entry, bs.model.split('/').pop() || bs.model), backstop: null };
  return null;
}

/** Why a named model is not available, in words for the admin screen (customers see only that it is unavailable). */
export function whyUnavailable(entry: CatalogEntry): string {
  const home = providersNow().find(p => p.id === entry.provider);
  if (!home || !home.key) return `No ${entry.maker} key on the account`;
  const aside = providerSetAside(home); if (aside) return `${entry.maker} set aside: ${aside.why}`;
  const h = health.entries[entry.id];
  if (h && !h.ok && h.lastError) return h.lastError;
  if (home.models.length && !home.models.some(m => entry.match.test(m))) return `${entry.maker} does not list it for this account`;
  return 'Not answering right now';
}

/** The list the app shows: Auto, then every catalog entry with whether it can be used now. Unavailable ones are kept so the admin screen can show them; the app hides them. */
export async function offeredModels(fetch = false): Promise<OfferedModel[]> {
  await loadProviders();
  const out: OfferedModel[] = [];
  for (const e of MODEL_CATALOG) {
    const pick = await resolveNamed(e.id, fetch);
    out.push({ id: e.id, name: pick ? pick.name : displayName(e, e.fallbackId), maker: e.maker, role: e.role, class: e.class, gas: gasForClass(e.class), blurb: e.blurb, available: !!pick, via: pick ? pick.via : null });
  }
  return out;
}

/**
 * Auto's choice of tier for a question: Research has its own pipeline (default), a maths or code focus and long or
 * attached questions get the Best model, a short plain question the Fast one, and questions that ask for reasoning in
 * so many words get the Reasoning tier. Auto stays on standard models and costs one gas however it chooses.
 */
export function autoTier(question: string, mode: 'search' | 'research', focus: string, attachments: number): AnswerTier {
  if (mode === 'research') return 'default';
  const q = question.trim();
  if (focus === 'math') return 'complex';
  if (/\b(prove|derive|step by step|rigorous|formally|why exactly|trade-?offs?|weigh|reason through)\b/i.test(q) && q.length > 60) return 'complex';
  if (attachments > 0 || focus === 'code' || focus === 'legal' || focus === 'academic' || q.length > 600) return 'default';
  if (q.length < 90 && !/\b(compare|explain|how|why|analy[sz]e|plan|draft|write|design|evaluate)\b/i.test(q)) return 'quick';
  return 'default';
}

// ---------- Health ----------
export type ModelHealthEntry = { ok: boolean; via: 'home' | 'openrouter' | null; model: string | null; checkedAt: number; downSince: number | null; alertedAt: number | null; lastError: string | null; ms: number | null };
export type ModelHealth = { at: number; entries: Record<string, ModelHealthEntry> };
const HEALTH_KEY = 'models:health';
const HEALTH_TTL_MS = 10 * 60_000;
const ALERT_AFTER_MS = 30 * 60_000;
const PROBE_ASIDE_MS = 10 * 60_000;
let health: ModelHealth = { at: 0, entries: {} };
let loaded = false;
let inflight: Promise<ModelHealth> | null = null;

async function loadHealth(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try { const row = (await db().select().from(schema.config).where(eq(schema.config.key, HEALTH_KEY)).limit(1))[0]; if (row?.value) health = row.value as ModelHealth; } catch { /* first run */ }
}
export async function modelHealth(): Promise<ModelHealth> { await loadHealth(); return health; }
export function modelHealthStale(): boolean { return Date.now() - health.at > HEALTH_TTL_MS; }

/**
 * Probe every catalog entry where it would be served (one tiny message each), set a failing pair aside so routing skips
 * it for ten minutes, lift a set-aside when a model answers again, and keep the record (with how long each has been
 * down) in the config table so every isolate and the admin screen read the same state. Runs at most every ten minutes
 * unless forced.
 */
export async function refreshModelHealth(force = false): Promise<ModelHealth> {
  await loadHealth();
  if (!force && !modelHealthStale()) return health;
  if (inflight) return inflight;
  inflight = (async () => {
    await loadProviders(true);
    const entries: Record<string, ModelHealthEntry> = { ...health.entries };
    const now = Date.now();
    for (const e of MODEL_CATALOG) {
      const prev = entries[e.id] || { ok: false, via: null, model: null, checkedAt: 0, downSince: null, alertedAt: null, lastError: null, ms: null };
      const home = providersNow().find(p => p.id === e.provider);
      const or = providersNow().find(p => p.id === 'openrouter');
      let ok = false; let via: 'home' | 'openrouter' | null = null; let model: string | null = null; let lastError: string | null = null; let ms: number | null = null;
      // The home provider first: a key and a served id are needed before a probe is worth sending. Under the mock model (local development) a key counts as answering.
      if (home?.key && mockMode()) { ok = true; via = 'home'; model = e.fallbackId; }
      else if (home?.key) {
        const m = await servedId(home, e.match, e.fallbackId, true);
        if (m) {
          const r = await probeProvider(home, m).catch(err => ({ ok: false, status: 0, message: String((err as Error)?.message || err), model: m, models: 0, ms: 0 }));
          model = m; ms = r.ms;
          if (r.ok) { ok = true; via = 'home'; markModelSeen(home, m); }
          else { lastError = `${e.maker}: ${r.status ? `HTTP ${r.status} ` : ''}${r.message}`.slice(0, 200); setModelAside(home, m, `health probe: ${r.message}`, PROBE_ASIDE_MS); }
        } else lastError = `${e.maker} does not list it for this account`;
      } else lastError = `No ${e.maker} key on the account`;
      // The backstop: the same model on OpenRouter, when the home provider failed and OpenRouter carries it.
      const orModel = e.openrouter && or?.key ? await servedId(or, e.openrouter, null, true) : null;
      if (!ok && orModel) {
        const r = await probeProvider(or!, orModel).catch(err => ({ ok: false, status: 0, message: String((err as Error)?.message || err), model: orModel, models: 0, ms: 0 }));
        if (r.ok) { ok = true; via = 'openrouter'; model = orModel; ms = r.ms; markModelSeen(or!, orModel); }
        else setModelAside(or!, orModel, `health probe: ${r.message}`, PROBE_ASIDE_MS);
      }
      // A model nobody serves is not down, only not offered; down means its maker holds a key (or OpenRouter lists it) and it stopped answering.
      const keyed = !!home?.key || !!orModel;
      const downSince = ok || !keyed ? null : (prev.downSince || now);
      let alertedAt = ok || !keyed ? null : prev.alertedAt;
      // Down for half an hour and not yet called out: one line in the logs, where an operator's alerting reads it, and the admin screen shows it.
      if (!ok && downSince && now - downSince >= ALERT_AFTER_MS && !alertedAt) {
        alertedAt = now;
        console.error('[models] ALERT', JSON.stringify({ model: e.id, downFor: Math.round((now - downSince) / 60000) + ' min', why: lastError }));
      }
      if (ok && prev.downSince) console.log('[models] back', JSON.stringify({ model: e.id, via, downFor: Math.round((now - prev.downSince) / 60000) + ' min' }));
      entries[e.id] = { ok, via, model, checkedAt: now, downSince, alertedAt, lastError, ms };
    }
    health = { at: now, entries };
    try {
      const d = db();
      const existing = (await d.select({ key: schema.config.key }).from(schema.config).where(eq(schema.config.key, HEALTH_KEY)).limit(1))[0];
      if (existing) await d.update(schema.config).set({ value: health, updatedAt: new Date() }).where(eq(schema.config.key, HEALTH_KEY));
      else await d.insert(schema.config).values({ key: HEALTH_KEY, value: health }).onConflictDoNothing();
    } catch (err) { console.warn('[models] health not saved', String((err as Error)?.message || err).slice(0, 160)); }
    return health;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** The catalog as the admin screen shows it: each named model, where it is served, whether it answered, and for how long it has been down. */
export async function catalogForAdmin(): Promise<Array<OfferedModel & { provider: string; servedId: string | null; checkedAt: number | null; downSince: number | null; why: string | null; ms: number | null }>> {
  await loadHealth();
  const offered = await offeredModels(true);
  return offered.map(o => {
    const e = catalogEntry(o.id)!; const h = health.entries[o.id];
    return { ...o, provider: e.provider, servedId: h?.model || null, checkedAt: h?.checkedAt || null, downSince: h?.downSince || null, why: o.available ? null : whyUnavailable(e), ms: h?.ms ?? null };
  });
}
