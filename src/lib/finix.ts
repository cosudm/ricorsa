/**
 * Finix (cards). The second way to pay, beside PayPal, since October 2026: the pricing page collects the card with
 * Finix.js (the number never touches our servers; the browser gets a short-lived token), and this module does the
 * rest over Finix's REST API with the account's API credentials: a buyer identity per person, a payment instrument
 * from the token, a subscription from one of the merchant's subscription plans (or priced directly when the person's
 * one trial is behind them), a transfer for Pay-As-You-Go gas, and the webhook that keeps subscriptions in step.
 *
 * Configuration is two secrets on the Worker, FINIX_USERNAME and FINIX_PASSWORD (the API key pair), plus FINIX_ENV
 * when it is not live. Everything else (the merchant, the application, the plan ids) is read from Finix itself by
 * finix-setup.ts. Customers never see Finix's name or its error text: the routes turn failures into plain messages.
 */
export const FINIX_VERSION = '2022-02-01';

export function finixConfigured(): boolean { return Boolean(process.env.FINIX_USERNAME && process.env.FINIX_PASSWORD); }
export function finixEnv(): 'live' | 'sandbox' { return process.env.FINIX_ENV === 'sandbox' ? 'sandbox' : 'live'; }
export function finixBase(): string {
  // FINIX_BASE_URL points the module at a stand-in during tests; otherwise live or sandbox by FINIX_ENV.
  if (process.env.FINIX_BASE_URL && process.env.NODE_ENV !== 'production') return process.env.FINIX_BASE_URL.replace(/\/+$/, '');
  return finixEnv() === 'live' ? 'https://finix.live-payments-api.com' : 'https://finix.sandbox-payments-api.com';
}
/** The script the pricing page loads for the card fields; never self-hosted (that would put the page in PCI scope). */
export const FINIX_JS = 'https://js.finix.com/v/2/finix.js';

/** A failure from Finix's API: the status and the message Finix gave, for logs; the routes never pass it to customers. */
export class FinixError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

type ListPage<T> = { _embedded?: Record<string, T[]>; page?: { limit?: number; next_cursor?: string | null; offset?: number; count?: number }; _links?: { next?: { href?: string } } };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = process.env.FINIX_USERNAME, pass = process.env.FINIX_PASSWORD;
  if (!user || !pass) throw new FinixError(503, 'FINIX_USERNAME / FINIX_PASSWORD are not set', 'unconfigured');
  const url = /^https?:/.test(path) ? path : finixBase() + path;
  const res = await fetch(url, { ...init, headers: { Authorization: 'Basic ' + btoa(`${user}:${pass}`), 'Content-Type': 'application/json', 'Finix-Version': FINIX_VERSION, ...(init.headers || {}) }, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 600); let code: string | undefined;
    try { const j = JSON.parse(text) as { _embedded?: { errors?: Array<{ message?: string; code?: string; field?: string }> }; message?: string; code?: string }; const e = j._embedded?.errors?.[0]; message = e?.message || j.message || message; code = e?.code || j.code; } catch { /* keep the raw text */ }
    throw new FinixError(res.status, `Finix ${init.method || 'GET'} ${path} failed: ${res.status} ${message}`, code);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Walk a paginated list (cursor or next link), up to `maxPages` pages. */
async function listAll<T>(path: string, key: string, maxPages = 5): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  for (let i = 0; i < maxPages && next; i++) {
    const page: ListPage<T> = await api<ListPage<T>>(next);
    const items = page._embedded?.[key] || Object.values(page._embedded || {})[0] || [];
    out.push(...items);
    const cursor = page.page?.next_cursor;
    next = cursor ? `${path}${path.includes('?') ? '&' : '?'}after_cursor=${encodeURIComponent(cursor)}` : (page._links?.next?.href && page._links.next.href !== next ? page._links.next.href : null);
    if (!items.length) break;
  }
  return out;
}

// ---------- Objects ----------
export type FinixPlan = {
  id: string; plan_name: string; nickname?: string | null; description?: string | null; amount: number; currency: string; billing_interval: string;
  linked_to: string; linked_type: string; application_id?: string; state: string; duration_type?: string | null;
  trial_defaults?: { interval_type: string; interval_count: number } | null; billing_defaults?: { collection_method?: string; send_invoice?: boolean; send_receipt?: boolean } | null;
  tags?: Record<string, string> | null; created_at?: string; updated_at?: string;
};
export type FinixMerchant = { id: string; identity?: string; application?: string; onboarding_state?: string; processing_enabled?: boolean; settlement_enabled?: boolean; verification?: string; created_at?: string };
export type FinixIdentity = { id: string; entity?: { first_name?: string; last_name?: string; email?: string }; tags?: Record<string, string>; created_at?: string };
export type FinixInstrument = { id: string; type?: string; brand?: string; last_four?: string; expiration_month?: number; expiration_year?: number; identity?: string; fingerprint?: string; created_at?: string };
export type FinixSubscription = {
  id: string; state: string; subscription_phase?: string | null; subscription_plan_id?: string | null; amount?: number; currency?: string; billing_interval?: string;
  buyer_details?: { identity_id?: string; instrument_id?: string }; nickname?: string | null; tags?: Record<string, string> | null;
  linked_to?: string; linked_type?: string; first_charge_at?: string | null; next_billing_date?: { year?: number; month?: number; day?: number } | string | null;
  trial_details?: { interval_type?: string; interval_count?: number } | null; created_at?: string; updated_at?: string;
};
export type FinixTransfer = {
  id: string; state: string; amount: number; currency?: string; type?: string; subtype?: string; source?: string; merchant?: string; merchant_identity?: string;
  failure_code?: string | null; failure_message?: string | null; idempotency_id?: string | null; tags?: Record<string, string> | null; created_at?: string; updated_at?: string;
};
export type FinixWebhook = { id: string; url: string; enabled?: boolean; secret_signing_key?: string; application?: string; enabled_events?: Array<{ entity: string; types: string[] }>; created_at?: string };

// ---------- Plans and merchants ----------
export function listPlans(): Promise<FinixPlan[]> { return listAll<FinixPlan>('/subscription_plans?limit=100', 'subscription_plans'); }
export function listMerchants(): Promise<FinixMerchant[]> { return listAll<FinixMerchant>('/merchants?limit=20', 'merchants', 2); }
/** A monthly, evergreen plan for a tier, with its trial, the way the merchant's existing plans are shaped. */
export function createPlan(o: { merchantId: string; name: string; amountCents: number; trialDays: number; description: string }): Promise<FinixPlan> {
  return api<FinixPlan>('/subscription_plans', { method: 'POST', body: JSON.stringify({
    plan_name: o.name, description: o.description.slice(0, 200), amount: o.amountCents, currency: 'USD', billing_interval: 'MONTHLY',
    linked_to: o.merchantId, linked_type: 'MERCHANT', duration_type: 'EVERGREEN',
    trial_defaults: o.trialDays > 0 ? { interval_type: 'DAY', interval_count: o.trialDays } : null,
    billing_defaults: { collection_method: 'BILL_AUTOMATICALLY', send_invoice: false, send_receipt: false },
    tags: { ricorsa: 'plan' },
  }) });
}
/** The trial a plan carries, in days (Finix stores it as an interval; weeks and months are turned into days). */
export function planTrialDays(p: FinixPlan): number {
  const t = p.trial_defaults; if (!t || !t.interval_count) return 0;
  const unit = String(t.interval_type || 'DAY').toUpperCase();
  return t.interval_count * (unit === 'WEEK' ? 7 : unit === 'MONTH' ? 30 : unit === 'YEAR' ? 365 : 1);
}

// ---------- Buyers and cards ----------
/** A buyer identity for a person: their name and email, and our account id in the tags so a webhook can find them. */
export function createIdentity(o: { firstName: string; lastName: string; email: string | null; userId: string }): Promise<FinixIdentity> {
  const cut = (v: string, n: number) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  return api<FinixIdentity>('/identities', { method: 'POST', body: JSON.stringify({
    type: 'PERSONAL', identity_roles: ['BUYER'],
    entity: { first_name: cut(o.firstName, 20) || 'Ricorsa', last_name: cut(o.lastName, 20) || 'Customer', ...(o.email ? { email: cut(o.email, 100) } : {}) },
    tags: { ricorsa_user: o.userId },
  }) });
}
/** The card behind a Finix.js token, saved to the buyer's identity. */
export function createInstrumentFromToken(token: string, identityId: string): Promise<FinixInstrument> {
  return api<FinixInstrument>('/payment_instruments', { method: 'POST', body: JSON.stringify({ type: 'TOKEN', token, identity: identityId }) });
}

// ---------- Subscriptions ----------
/**
 * A subscription for a buyer: from one of the merchant's plans (the plan's price and trial apply; `trial_details` cannot
 * override a plan's), or priced directly with no trial for a person whose one trial is behind them.
 */
export function createSubscription(o: { merchantId: string; identityId: string; instrumentId: string; planId?: string | null; amountCents?: number; nickname: string; tags: Record<string, string> }): Promise<FinixSubscription> {
  const body: Record<string, unknown> = {
    linked_to: o.merchantId, linked_type: 'MERCHANT', currency: 'USD',
    buyer_details: { identity_id: o.identityId, instrument_id: o.instrumentId },
    nickname: o.nickname.slice(0, 60), tags: o.tags,
  };
  if (o.planId) body.subscription_plan_id = o.planId;
  else { body.amount = o.amountCents; body.billing_interval = 'MONTHLY'; }
  return api<FinixSubscription>('/subscriptions', { method: 'POST', body: JSON.stringify(body) });
}
export function getSubscription(id: string): Promise<FinixSubscription> { return api<FinixSubscription>(`/subscriptions/${encodeURIComponent(id)}`); }
/** Cancel a subscription. Finix answers the canceled subscription; one already canceled reads as done. */
export async function cancelSubscription(id: string): Promise<FinixSubscription> {
  try { return await api<FinixSubscription>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ state: 'CANCELED' }) }); }
  catch (e) {
    const err = e as FinixError;
    if (err.status === 404 || err.status === 405 || /already|canceled|cancelled/i.test(err.message)) { try { return await getSubscription(id); } catch { /* fall through */ } }
    throw e;
  }
}
/** Move a subscription to a new card (the Account page's Update card). */
export function updateSubscriptionInstrument(id: string, instrumentId: string): Promise<FinixSubscription> {
  return api<FinixSubscription>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ buyer_details: { instrument_id: instrumentId } }) });
}
/** Finix's subscription states as the account records them (the PayPal words, which the rest of the product reads). */
export function subscriptionStatusOf(sub: Pick<FinixSubscription, 'state'>): string {
  switch (String(sub.state || '').toUpperCase()) {
    case 'ACTIVE': case 'NOT_STARTED': return 'ACTIVE';
    case 'PAST_DUE': case 'PAUSED': return 'SUSPENDED';
    case 'CANCELED': case 'CANCELLED': return 'CANCELLED';
    case 'EXPIRED': case 'COMPLETED': return 'EXPIRED';
    default: return String(sub.state || 'UNKNOWN').toUpperCase();
  }
}
/** The next billing date as a Date, from Finix's {year, month, day} (midnight UTC) or an ISO string. */
export function nextBillingDateOf(sub: Pick<FinixSubscription, 'next_billing_date'>): Date | null {
  const n = sub.next_billing_date; if (!n) return null;
  if (typeof n === 'string') { const d = new Date(n); return isNaN(d.getTime()) ? null : d; }
  if (typeof n.year === 'number' && typeof n.month === 'number' && typeof n.day === 'number') return new Date(Date.UTC(n.year, n.month - 1, n.day));
  return null;
}

// ---------- One-time payments (Pay-As-You-Go) ----------
/** Debit a saved card once. `idempotencyId` keeps a retried request from charging twice. */
export function createTransfer(o: { merchantId: string; instrumentId: string; amountCents: number; tags: Record<string, string>; idempotencyId: string }): Promise<FinixTransfer> {
  return api<FinixTransfer>('/transfers', { method: 'POST', body: JSON.stringify({ amount: o.amountCents, currency: 'USD', merchant: o.merchantId, source: o.instrumentId, tags: o.tags, idempotency_id: o.idempotencyId }) });
}
export function getTransfer(id: string): Promise<FinixTransfer> { return api<FinixTransfer>(`/transfers/${encodeURIComponent(id)}`); }

// ---------- Webhooks ----------
export function listWebhooks(): Promise<FinixWebhook[]> { return listAll<FinixWebhook>('/webhooks?limit=100', 'webhooks', 2); }
/** A webhook for subscriptions and transfers, authenticated with a bearer token of ours; the signing key comes back once, on creation. */
export function createWebhook(url: string, bearerToken: string): Promise<FinixWebhook> {
  return api<FinixWebhook>('/webhooks', { method: 'POST', body: JSON.stringify({
    url, enabled: true,
    authentication: { type: 'BEARER', bearer: { token: bearerToken } },
    enabled_events: [{ entity: 'subscription', types: ['created', 'updated'] }, { entity: 'transfer', types: ['created', 'updated'] }],
  }) });
}

/**
 * Verify a delivery: the Finix-Signature header is `timestamp=<epoch seconds>, sig=<hex>`, an HMAC-SHA256 of
 * `<timestamp>:<raw body>` under the webhook's signing key; a timestamp older than five minutes is refused.
 */
export async function verifyWebhookSignature(header: string | null, rawBody: string, signingKey: string): Promise<boolean> {
  if (!header || !signingKey) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=').map(s => s.trim()) as [string, string]));
  const ts = parts.timestamp || parts.t, sig = (parts.sig || parts.v1 || '').toLowerCase();
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}:${rawBody}`)));
  const hex = Array.from(mac).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** A plain sentence for a customer when a card payment does not go through, from Finix's failure without its words. */
export function customerMessageFor(e: unknown): string {
  const err = e as FinixError;
  const m = String(err?.message || '');
  if (/expired/i.test(m)) return 'That card has expired. Try another card.';
  if (/insufficient/i.test(m)) return 'The card was declined for insufficient funds. Try another card.';
  if (/security_code|cvv|cvc/i.test(m)) return 'The security code was not accepted. Check the card and try again.';
  if (/address|avs|postal/i.test(m)) return 'The billing address was not accepted. Check it and try again.';
  if (/declin|do not honor|do_not_honor|refused|invalid card|card number|422/i.test(m)) return 'The card was declined. Try another card.';
  if (/token.*(expired|invalid)|expired token/i.test(m)) return 'The card details timed out. Enter them again.';
  return 'The payment could not be completed. Try again or use another card.';
}

export function isFinixError(e: unknown): e is FinixError { return e instanceof FinixError; }
