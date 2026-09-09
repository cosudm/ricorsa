/**
 * PayPal Subscriptions (REST v1 billing). Uses the same Business app credentials as the
 * existing PayPal Checkout; the pricing page passes PAYPAL_CLIENT_ID to the browser to render the buttons.
 */
export function paypalConfigured(): boolean { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET); }

export function paypalBase(): string {
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

export async function cancelSubscription(id: string, reason = 'Cancelled by customer') {
  await api(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function createProduct(name: string, description: string) {
  return api<{ id: string }>('/v1/catalogs/products', { method: 'POST', body: JSON.stringify({ name, description, type: 'SERVICE', category: 'SOFTWARE' }) });
}

export async function createPlan(productId: string, name: string, description: string, priceUsd: number) {
  return api<{ id: string }>('/v1/billing/plans', { method: 'POST', body: JSON.stringify({
    product_id: productId, name, description, status: 'ACTIVE',
    billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: priceUsd.toFixed(2), currency_code: 'USD' } } }],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 2 },
  }) });
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
