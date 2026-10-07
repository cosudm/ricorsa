#!/usr/bin/env node
/**
 * A stand-in for the two payment APIs, for running the app's billing against something that answers like them without
 * moving money: Finix (identities, payment instruments, transfers, webhooks, the merchant list) on one port and PayPal
 * (OAuth token, Orders v2 create and capture) on another. Point the dev server at it with
 *
 *   FINIX_USERNAME=test FINIX_PASSWORD=test FINIX_ENV=sandbox FINIX_BASE_URL=http://127.0.0.1:3993
 *   FINIX_WEBHOOK_URL=http://127.0.0.1:3000/api/billing/finix/webhook
 *   PAYPAL_CLIENT_ID=test PAYPAL_CLIENT_SECRET=test PAYPAL_BASE_URL=http://127.0.0.1:3992
 *
 * Card tokens decide what the card does: `TKdeclined` is refused when saved (422); a token containing `fail` makes a
 * card whose transfers FAIL; one containing `pending` makes a card whose transfers stay PENDING until /settle; anything
 * else succeeds at once. The brand is read from the token (visa, mc, amex) and the last four digits from its tail.
 *
 * Test endpoints on the Finix port: GET /__state (everything recorded), POST /__reset, POST /__card {instrumentId, mode}
 * (mode ok|fail|pending), POST /__settle {transferId} (mark SUCCEEDED and deliver the webhook), POST /__deliver
 * {transferId} (deliver the webhook again, as Finix retries do), GET /__webhook (the registered url, bearer and key).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FINIX_PORT = Number(process.env.MOCK_FINIX_PORT || 3993);
const PAYPAL_PORT = Number(process.env.MOCK_PAYPAL_PORT || 3992);
// The webhook the app registers (and the signing key it was given) outlive a restart of this process, as they would at Finix,
// so a dev server that already provisioned itself keeps working against a fresh stand-in.
const KEEP = path.join(os.tmpdir(), `mock-finix-${FINIX_PORT}.json`);
const kept = (() => { try { return JSON.parse(fs.readFileSync(KEEP, 'utf8')); } catch { return null; } })();
const SIGNING_KEY = kept?.signingKey || ('whsec_' + crypto.randomBytes(16).toString('hex'));
const keep = () => { try { fs.writeFileSync(KEEP, JSON.stringify({ signingKey: SIGNING_KEY, webhook: state.webhook })); } catch { /* best effort */ } };

const state = fresh();
if (kept?.webhook) state.webhook = kept.webhook;
function fresh() {
  return { identities: [], instruments: new Map(), transfers: [], byIdempotency: new Map(), webhook: null, deliveries: [], orders: new Map(), requests: [] };
}
const id = (p) => p + crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 16);
const now = () => new Date().toISOString();

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({ _raw: b }); } }); });
}
function send(res, status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(text);
}
function finixError(res, status, message, code) { send(res, status, { total: 1, _embedded: { errors: [{ message, code, logref: id('LR') }] } }); }

function cardFromToken(token) {
  const t = String(token);
  const brand = /amex/i.test(t) ? 'AMERICAN_EXPRESS' : /mc|master/i.test(t) ? 'MASTERCARD' : 'VISA';
  const digits = t.replace(/\D/g, '');
  const last = (digits.slice(-4) || '4242').padStart(4, '0');
  const mode = /fail/i.test(t) ? 'fail' : /pending/i.test(t) ? 'pending' : 'ok';
  return { brand, last_four: last, mode };
}

/** Finix's webhook delivery: the event wrapped the way Finix sends it, with the bearer and the signature over `timestamp:body`. */
async function deliver(transfer, type = 'updated') {
  if (!state.webhook) return { skipped: 'no webhook' };
  const event = { id: id('EV'), type, entity: 'transfer', occurred_at: now(), _embedded: { transfers: [{ id: transfer.id, state: transfer.state, amount: transfer.amount, tags: transfer.tags }] } };
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SIGNING_KEY).update(`${ts}:${body}`).digest('hex');
  try {
    const res = await fetch(state.webhook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.webhook.bearer}`, 'Finix-Signature': `timestamp=${ts}, sig=${sig}` }, body });
    const text = await res.text();
    const rec = { eventId: event.id, transfer: transfer.id, status: res.status, text: text.slice(0, 200), at: now() };
    state.deliveries.push(rec);
    return rec;
  } catch (e) {
    const rec = { eventId: event.id, transfer: transfer.id, status: 0, text: String(e.message || e), at: now() };
    state.deliveries.push(rec);
    return rec;
  }
}

const finix = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
  state.requests.push({ method: req.method, path, at: now() });

  // Test controls.
  if (path === '/__state') return send(res, 200, { ...state, instruments: [...state.instruments.values()], byIdempotency: undefined, orders: [...state.orders.values()], signingKey: SIGNING_KEY });
  if (path === '/__reset') { const webhook = state.webhook; Object.assign(state, fresh(), { webhook }); return send(res, 200, { ok: true }); } // the app's webhook registration survives a reset, as it would at Finix
  if (path === '/__card') { const ins = state.instruments.get(body.instrumentId); if (!ins) return send(res, 404, { error: 'no such instrument' }); ins.mode = body.mode || 'ok'; return send(res, 200, ins); }
  if (path === '/__settle') { const t = state.transfers.find(x => x.id === body.transferId); if (!t) return send(res, 404, { error: 'no such transfer' }); t.state = 'SUCCEEDED'; t.updated_at = now(); return send(res, 200, await deliver(t, 'updated')); }
  if (path === '/__deliver') { const t = state.transfers.find(x => x.id === body.transferId); if (!t) return send(res, 404, { error: 'no such transfer' }); return send(res, 200, await deliver(t, body.type || 'updated')); }
  if (path === '/__webhook') return send(res, 200, { ...(state.webhook || {}), signingKey: SIGNING_KEY });

  // Finix proper. Every call carries Basic auth and the version header.
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return finixError(res, 401, 'Authentication required', 'UNAUTHORIZED');
  if (req.headers['finix-version'] !== '2022-02-01') return finixError(res, 400, 'Finix-Version header missing or unsupported', 'BAD_VERSION');

  if (req.method === 'GET' && path === '/subscription_plans') return send(res, 200, { _embedded: { subscription_plans: [] }, page: { limit: 100, next_cursor: null } });
  if (req.method === 'GET' && path === '/merchants') return send(res, 200, { _embedded: { merchants: [{ id: 'MUmocktestmerchant', application: 'APmocktestapplication', processing_enabled: true, settlement_enabled: true, onboarding_state: 'APPROVED' }] }, page: { limit: 20, next_cursor: null } });
  if (req.method === 'GET' && path === '/webhooks') return send(res, 200, { _embedded: { webhooks: state.webhook ? [{ id: state.webhook.id, url: state.webhook.url, enabled: true }] : [] }, page: { limit: 100, next_cursor: null } });
  if (req.method === 'POST' && path === '/webhooks') {
    const bearer = body?.authentication?.bearer?.token;
    if (!body.url || !bearer) return finixError(res, 400, 'url and authentication.bearer.token are required', 'INVALID_FIELD');
    state.webhook = { id: id('WH'), url: body.url, bearer, enabled_events: body.enabled_events || [] }; keep();
    return send(res, 201, { id: state.webhook.id, url: body.url, enabled: true, secret_signing_key: SIGNING_KEY, enabled_events: state.webhook.enabled_events, created_at: now() });
  }
  if (req.method === 'POST' && path === '/identities') {
    const ident = { id: id('ID'), entity: body.entity || {}, tags: body.tags || {}, created_at: now() };
    state.identities.push(ident);
    return send(res, 201, ident);
  }
  if (req.method === 'POST' && path === '/payment_instruments') {
    if (body.type !== 'TOKEN' || !body.token || !body.identity) return finixError(res, 400, 'type TOKEN, token and identity are required', 'INVALID_FIELD');
    if (!state.identities.some(i => i.id === body.identity)) return finixError(res, 404, 'Identity not found', 'NOT_FOUND');
    if (body.token === 'TKdeclined') return finixError(res, 422, 'The card was declined by the issuer', 'CARD_DECLINED');
    const card = cardFromToken(body.token);
    const ins = { id: id('PI'), type: 'PAYMENT_CARD', brand: card.brand, last_four: card.last_four, expiration_month: 12, expiration_year: 2030, identity: body.identity, fingerprint: 'FP' + card.last_four, created_at: now(), mode: card.mode, token: body.token };
    state.instruments.set(ins.id, ins);
    const { mode, token, ...pub } = ins; void mode; void token;
    return send(res, 201, pub);
  }
  if (req.method === 'POST' && path === '/transfers') {
    if (!body.idempotency_id) return finixError(res, 400, 'idempotency_id is required', 'INVALID_FIELD');
    const prior = state.byIdempotency.get(body.idempotency_id);
    if (prior) return send(res, 201, prior);
    const ins = state.instruments.get(body.source);
    if (!ins) return finixError(res, 404, 'Payment instrument not found', 'NOT_FOUND');
    if (body.merchant !== 'MUmocktestmerchant') return finixError(res, 400, 'Unknown merchant', 'INVALID_FIELD');
    if (!Number.isInteger(body.amount) || body.amount <= 0) return finixError(res, 400, 'amount must be a positive integer of cents', 'INVALID_FIELD');
    const t = { id: id('TR'), state: ins.mode === 'fail' ? 'FAILED' : ins.mode === 'pending' ? 'PENDING' : 'SUCCEEDED', amount: body.amount, currency: body.currency || 'USD', type: 'DEBIT', source: ins.id, merchant: body.merchant, tags: body.tags || {}, idempotency_id: body.idempotency_id, failure_code: ins.mode === 'fail' ? 'GENERIC_DECLINE' : null, failure_message: ins.mode === 'fail' ? 'Do not honor' : null, created_at: now(), updated_at: now() };
    state.transfers.push(t); state.byIdempotency.set(body.idempotency_id, t);
    return send(res, 201, t);
  }
  const tr = path.match(/^\/transfers\/([^/]+)$/);
  if (req.method === 'GET' && tr) { const t = state.transfers.find(x => x.id === decodeURIComponent(tr[1])); return t ? send(res, 200, t) : finixError(res, 404, 'Transfer not found', 'NOT_FOUND'); }
  finixError(res, 404, `No route for ${req.method} ${path}`, 'NOT_FOUND');
});

const paypal = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '');
  const body = req.method === 'POST' ? await readBody(req) : {};
  state.requests.push({ method: req.method, path: 'paypal' + path, at: now() });
  if (path === '/v1/oauth2/token') return send(res, 200, { access_token: 'A21.mock', token_type: 'Bearer', expires_in: 32400 });
  if (!(req.headers.authorization || '').startsWith('Bearer ')) return send(res, 401, { name: 'UNAUTHORIZED' });
  if (req.method === 'POST' && path === '/v2/checkout/orders') {
    const o = { id: id('O'), status: 'CREATED', intent: body.intent, purchase_units: body.purchase_units || [], create_time: now() };
    state.orders.set(o.id, o);
    return send(res, 201, o);
  }
  const cap = path.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
  if (req.method === 'POST' && cap) {
    const o = state.orders.get(cap[1]);
    if (!o) return send(res, 404, { name: 'RESOURCE_NOT_FOUND' });
    if (o.status === 'COMPLETED') return send(res, 422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
    o.status = 'COMPLETED';
    o.purchase_units = o.purchase_units.map(u => ({ ...u, payments: { captures: [{ id: id('C'), status: 'COMPLETED', amount: u.amount, custom_id: u.custom_id, create_time: now() }] } }));
    return send(res, 201, o);
  }
  const get = path.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
  if (req.method === 'GET' && get) { const o = state.orders.get(get[1]); return o ? send(res, 200, o) : send(res, 404, { name: 'RESOURCE_NOT_FOUND' }); }
  send(res, 404, { name: 'NOT_FOUND', message: `No route for ${req.method} ${path}` });
});

finix.listen(FINIX_PORT, '127.0.0.1', () => console.log(`[mock] finix on http://127.0.0.1:${FINIX_PORT}`));
paypal.listen(PAYPAL_PORT, '127.0.0.1', () => console.log(`[mock] paypal on http://127.0.0.1:${PAYPAL_PORT}`));
