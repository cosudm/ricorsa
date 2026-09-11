/**
 * PayPal Invoicing (REST v2) with the same Business app credentials the product uses for subscriptions.
 * An invoice created here is sent by PayPal to the customer, who pays online; its status flows back through
 * the webhook (INVOICING.INVOICE.*) or a manual refresh.
 */
import type { Address, InvoiceItem } from './db/schema';

export function paypalConfigured(): boolean { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET); }
export function paypalBase(): string { return process.env.PAYPAL_BASE_URL || (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'); }
export function paypalInvoiceUrl(id: string): string { return `${process.env.PAYPAL_ENV === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com'}/invoice/p/#${id}`; }

let tokenCache: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set');
  const res = await fetch(paypalBase() + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${id}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!res.ok) throw new Error('PayPal token failed: ' + res.status + ' ' + (await res.text()));
  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(paypalBase() + path, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${init.method || 'GET'} ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

const money = (cents: number, currency: string) => ({ currency_code: currency, value: (cents / 100).toFixed(2) });
const addr = (a?: Address | null) => a && (a.line1 || a.city || a.country) ? { address_line_1: a.line1 || undefined, address_line_2: a.line2 || undefined, admin_area_2: a.city || undefined, admin_area_1: a.region || undefined, postal_code: a.postal || undefined, country_code: (a.country || 'US').slice(0, 2).toUpperCase() } : undefined;
const day = (d: Date) => d.toISOString().slice(0, 10);

export type PaypalInvoice = {
  id: string; status: string;
  detail?: { invoice_number?: string; invoice_date?: string; currency_code?: string; metadata?: { recipient_view_url?: string; invoicer_view_url?: string } };
  amount?: { currency_code: string; value: string }; due_amount?: { currency_code: string; value: string };
  payments?: { paid_amount?: { currency_code: string; value: string }; transactions?: Array<{ payment_id?: string; payment_date?: string; method?: string; amount?: { value: string; currency_code: string } }> };
  links?: Array<{ href: string; rel: string; method: string }>;
};

/** Create a PayPal invoice (draft) for ours and return PayPal's id. */
export async function createPaypalInvoice(inv: { number: string; currency: string; items: InvoiceItem[]; issuedAt: Date; dueAt: Date | null; notes: string; terms: string; billTo: { name?: string; company?: string; email?: string; address?: Address } }, company: { name: string; email?: string; website?: string; phone?: string; address?: Address }): Promise<{ id: string; url: string }> {
  const name = (inv.billTo.name || inv.billTo.company || 'Customer').trim();
  const parts = name.split(/\s+/); const given = parts[0] || name, surname = parts.slice(1).join(' ') || '';
  const body = {
    detail: {
      invoice_number: inv.number, currency_code: inv.currency, invoice_date: day(inv.issuedAt),
      payment_term: inv.dueAt ? { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: day(inv.dueAt) } : { term_type: 'DUE_ON_RECEIPT' },
      note: inv.notes || undefined, terms_and_conditions: inv.terms || undefined,
    },
    invoicer: { business_name: company.name.slice(0, 300), email_address: company.email || undefined, website: company.website || undefined, phones: company.phone ? [{ country_code: '1', national_number: company.phone.replace(/\D/g, '').slice(-10), phone_type: 'OTHER' }] : undefined, address: addr(company.address) },
    primary_recipients: [{ billing_info: { name: { given_name: given, surname: surname || undefined }, business_name: inv.billTo.company || undefined, email_address: inv.billTo.email || undefined, address: addr(inv.billTo.address) } }],
    items: inv.items.map(it => ({ name: it.description.slice(0, 200), quantity: String(it.qty), unit_amount: money(it.unitCents, inv.currency), unit_of_measure: 'QUANTITY', ...(it.taxRate ? { tax: { name: 'Tax', percent: String(it.taxRate) } } : {}) })),
    configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false, partial_payment: { allow_partial_payment: false } },
  };
  const created = await api<PaypalInvoice & { href?: string }>('/v2/invoicing/invoices', { method: 'POST', body: JSON.stringify(body) });
  const id = created.id || String(created.href || '').split('/').pop() || '';
  if (!id) throw new Error('PayPal did not return an invoice id');
  return { id, url: created.detail?.metadata?.recipient_view_url || paypalInvoiceUrl(id) };
}

/** Ask PayPal to email the invoice to the recipient. */
export async function sendPaypalInvoice(id: string): Promise<void> {
  await api(`/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, { method: 'POST', body: JSON.stringify({ send_to_recipient: true, send_to_invoicer: false }) });
}
export async function getPaypalInvoice(id: string): Promise<PaypalInvoice> { return api<PaypalInvoice>(`/v2/invoicing/invoices/${encodeURIComponent(id)}`, { method: 'GET' }); }
export async function cancelPaypalInvoice(id: string, note = 'Cancelled'): Promise<void> {
  await api(`/v2/invoicing/invoices/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ subject: 'Invoice cancelled', note, send_to_recipient: true, send_to_invoicer: false }) });
}
export async function deletePaypalDraft(id: string): Promise<void> {
  await api(`/v2/invoicing/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
/** Record a payment received outside PayPal against the PayPal invoice, so both sides agree. */
export async function recordPaypalPayment(id: string, amountCents: number, currency: string, method: string, note: string): Promise<void> {
  const m = ({ bank: 'BANK_TRANSFER', cash: 'CASH', card: 'CREDIT_CARD', check: 'CHECK', other: 'OTHER' } as Record<string, string>)[method] || 'OTHER';
  await api(`/v2/invoicing/invoices/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify({ method: m, payment_date: day(new Date()), note, amount: money(amountCents, currency) }) });
}

/** Map PayPal's invoice status onto ours. */
export function statusFromPaypal(s: string | undefined): 'draft' | 'sent' | 'paid' | 'void' | null {
  switch ((s || '').toUpperCase()) {
    case 'DRAFT': return 'draft';
    case 'SENT': case 'SCHEDULED': case 'UNPAID': case 'PAYMENT_PENDING': case 'PARTIALLY_PAID': return 'sent';
    case 'PAID': case 'MARKED_AS_PAID': return 'paid';
    case 'CANCELLED': case 'REFUNDED': case 'MARKED_AS_REFUNDED': return 'void';
    default: return null;
  }
}

/** Register (once) the webhook that tells the console when an invoice is paid or cancelled. */
export async function ensureInvoiceWebhook(url: string): Promise<string> {
  const existing = await api<{ webhooks?: Array<{ id: string; url: string }> }>('/v1/notifications/webhooks', { method: 'GET' });
  const hit = (existing.webhooks || []).find(w => w.url === url);
  if (hit) return hit.id;
  const created = await api<{ id: string }>('/v1/notifications/webhooks', { method: 'POST', body: JSON.stringify({ url, event_types: [
    { name: 'INVOICING.INVOICE.PAID' }, { name: 'INVOICING.INVOICE.CANCELLED' }, { name: 'INVOICING.INVOICE.REFUNDED' }, { name: 'INVOICING.INVOICE.UPDATED' }, { name: 'INVOICING.INVOICE.SCHEDULED' },
  ] }) });
  return created.id;
}

export async function verifyWebhookSignature(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
  const body = {
    auth_algo: headers.get('paypal-auth-algo'), cert_url: headers.get('paypal-cert-url'), transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'), transmission_time: headers.get('paypal-transmission-time'), webhook_id: webhookId, webhook_event: JSON.parse(rawBody),
  };
  const res = await api<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', { method: 'POST', body: JSON.stringify(body) });
  return res.verification_status === 'SUCCESS';
}
