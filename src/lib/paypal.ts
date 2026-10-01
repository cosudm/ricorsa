/**
 * PayPal Subscriptions (REST v1 billing). Uses the same Business app credentials as the
 * existing PayPal Checkout; the pricing page passes PAYPAL_CLIENT_ID to the browser to render the buttons.
 */
export function paypalConfigured(): boolean { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET); }

export function paypalBase(): string {
  // PAYPAL_BASE_URL points the app at a stand-in during tests; otherwise live or sandbox by PAYPAL_ENV.
  if (process.env.PAYPAL_BASE_URL && process.env.NODE_ENV !== 'production') return process.env.PAYPAL_BASE_URL.replace(/\/+$/, '');
  return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

let tokenCache: { token: string; exp: number } | null = null;
export async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set');
  const res = await fetch(paypalBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${id}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal token failed: ' + res.status + ' ' + (await res.text()));
  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(paypalBase() + path, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${init.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export type PaypalSubscription = {
  id: string; status: string; plan_id: string; custom_id?: string; start_time?: string; create_time?: string; update_time?: string;
  subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  billing_info?: { next_billing_time?: string; last_payment?: { time?: string; amount?: { value: string; currency_code: string } }; failed_payments_count?: number };
};

export function getSubscription(id: string) { return api<PaypalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`); }

export async function cancelSubscription(id: string, reason = 'Canceled by customer') {
  await api(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function createProduct(name: string, description: string) {
  return api<{ id: string }>('/v1/catalogs/products', { method: 'POST', body: JSON.stringify({ name, description, type: 'SERVICE', category: 'SOFTWARE' }) });
}

/** A monthly (or yearly) plan, with a free trial of `trialDays` first when given: PayPal charges nothing until the trial cycle ends. */
export async function createPlan(productId: string, name: string, description: string, priceUsd: number, trialDays = 0, interval: 'MONTH' | 'YEAR' = 'MONTH') {
  const cycles: Array<Record<string, unknown>> = [];
  if (trialDays > 0) cycles.push({ frequency: { interval_unit: 'DAY', interval_count: trialDays }, tenure_type: 'TRIAL', sequence: 1, total_cycles: 1 });
  cycles.push({ frequency: { interval_unit: interval, interval_count: 1 }, tenure_type: 'REGULAR', sequence: cycles.length + 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: priceUsd.toFixed(2), currency_code: 'USD' } } });
  // PayPal caps a plan's name and description at 127 characters; a longer blurb is cut at the last clause that fits, so the plan is created rather than refused.
  const cut = (v: string, n: number) => {
    if (v.length <= n) return v;
    const head = v.slice(0, n - 1);
    const at = Math.max(head.lastIndexOf('. '), head.lastIndexOf(': '), head.lastIndexOf('; '), head.lastIndexOf(', '));
    return (at > n / 2 ? head.slice(0, at) : head.replace(/\s+\S*$/, '')).replace(/[\s,;:]+$/, '') + '.';
  };
  return api<{ id: string }>('/v1/billing/plans', { method: 'POST', body: JSON.stringify({
    product_id: productId, name: cut(name, 127), description: cut(description, 127), status: 'ACTIVE',
    billing_cycles: cycles,
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 2 },
  }) });
}

/** A one-time order (PayPal Orders v2): what Pay-As-You-Go gas is bought with. */
export type PaypalOrder = {
  id: string; status: string; create_time?: string; update_time?: string;
  purchase_units?: Array<{ reference_id?: string; custom_id?: string; description?: string; amount?: { value: string; currency_code: string }; payments?: { captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string }; custom_id?: string }> } }>;
  payer?: { email_address?: string };
};

/** Create an order for a fixed amount; the browser only ever learns its id, and the amount is confirmed again at capture. */
export async function createOrder(amountUsd: number, customId: string, description: string, referenceId = 'gas'): Promise<PaypalOrder> {
  return api<PaypalOrder>('/v2/checkout/orders', { method: 'POST', body: JSON.stringify({
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: referenceId, custom_id: customId, description: description.slice(0, 127), amount: { currency_code: 'USD', value: amountUsd.toFixed(2) } }],
    payment_source: { paypal: { experience_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', brand_name: 'Ricorsa' } } },
  }) });
}
export function getOrder(id: string) { return api<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(id)}`); }
/** Capture an approved order. PayPal answers 422 ORDER_ALREADY_CAPTURED on a second try; the caller reads the order then. */
export async function captureOrder(id: string): Promise<PaypalOrder> {
  try { return await api<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: 'POST', body: '{}' }); }
  catch (e) { if (/ORDER_ALREADY_CAPTURED/.test(String((e as Error)?.message || e))) return getOrder(id); throw e; }
}

export async function createWebhook(url: string) {
  // Idempotent: PayPal refuses a second webhook on the same URL, so reuse one if it is already registered.
  const existing = await api<{ webhooks?: Array<{ id: string; url: string }> }>('/v1/notifications/webhooks', { method: 'GET' });
  const hit = (existing.webhooks || []).find(w => w.url === url);
  if (hit) return { id: hit.id };
  return api<{ id: string }>('/v1/notifications/webhooks', { method: 'POST', body: JSON.stringify({ url, event_types: [
    { name: 'BILLING.SUBSCRIPTION.ACTIVATED' }, { name: 'BILLING.SUBSCRIPTION.UPDATED' }, { name: 'BILLING.SUBSCRIPTION.CANCELLED' },
    { name: 'BILLING.SUBSCRIPTION.SUSPENDED' }, { name: 'BILLING.SUBSCRIPTION.EXPIRED' }, { name: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' },
    { name: 'PAYMENT.SALE.COMPLETED' },
  ] }) });
}

/** Ask PayPal to confirm a webhook delivery really came from them. */
export async function verifyWebhookSignature(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
  if (!webhookId) throw new Error('PayPal webhook id is not known yet');
  const body = {
    auth_algo: headers.get('paypal-auth-algo'), cert_url: headers.get('paypal-cert-url'), transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'), transmission_time: headers.get('paypal-transmission-time'),
    webhook_id: webhookId, webhook_event: JSON.parse(rawBody),
  };
  const res = await api<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', { method: 'POST', body: JSON.stringify(body) });
  return res.verification_status === 'SUCCESS';
}
