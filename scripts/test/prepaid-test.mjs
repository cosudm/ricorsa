#!/usr/bin/env node
/**
 * The prepaid model, end to end against the dev server and the payment stand-in (scripts/test/mock-finix.mjs):
 * welcome gas once, the recharge amounts and their bounds, the agreement, the card on file and one-click recharges,
 * declines and pending payments settled by webhook, auto-recharge (once a day, off after three failures), the PayPal
 * path, the retired plans, the pages' copy, and the messages a customer sees when gas runs out.
 *
 * Run the stand-in, then the dev server with DEV_FAKE_USER=1 and the FINIX and PAYPAL variables the stand-in's header
 * lists, then `node scripts/test/prepaid-test.mjs`. The local D1 file is read and reset directly (node:sqlite).
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://127.0.0.1:3000';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:3993';
const USER = 'dev|local';
const D1_DIR = path.resolve(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const dbFile = path.join(D1_DIR, readdirSync(D1_DIR).find(f => /^[0-9a-f]{64}\.sqlite$/.test(f)));

let pass = 0, failed = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) pass++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sql(query, params = []) {
  const db = new DatabaseSync(dbFile);
  try { const st = db.prepare(query); return /^\s*select/i.test(query) ? st.all(...params) : st.run(...params); }
  finally { db.close(); }
}
const userRow = () => sql('select * from users where id = ?', [USER])[0];
const purchases = () => sql('select * from gas_purchases where user_id = ? order by created_at desc, rowid desc', [USER]);

/** Back to a fresh prepaid account: nothing bought, no card, auto-recharge off, agreement not yet given; the welcome gas stays. */
function resetAccount({ balance = 500, welcome = true } = {}) {
  sql('delete from gas_purchases where user_id = ?', [USER]);
  sql("delete from webhook_events where id like 'finix:%'");
  sql('delete from usage where user_id = ?', [USER]);
  sql(`update users set gas_balance = ?, welcome_gas_at = ?, finix_identity_id = null, finix_instrument_id = null, card_brand = null, card_last_four = null,
       auto_recharge = 0, auto_recharge_threshold = 200, auto_recharge_usd = 20, auto_recharge_failures = 0, auto_recharge_last_at = null,
       recharge_agreed_at = null, recharge_agreement_version = null, plan = 'free', subscription_status = null, paypal_subscription_id = null where id = ?`, [balance, welcome ? Date.now() : null, USER]);
}

async function api(method, p, body, headers = {}) {
  const res = await fetch(APP + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, json, text, headers: res.headers };
}
const mock = (p, body) => fetch(MOCK + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
const noProvider = (s) => !/finix|paypal|stripe/i.test(String(s || '').replace(/paypal account that paid/i, ''));
/** A rendered page as a reader sees it: scripts and React's SSR comment markers removed, so text split by an expression reads whole. */
const visible = (html) => String(html || '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const transfersNow = async () => ((await mock('/__state')).transfers || []).length;

async function main() {
  console.log(`app ${APP}, stand-in ${MOCK}, db ${path.basename(dbFile)}\n`);
  await mock('/__reset', {});

  // ---- Welcome gas, once ----
  sql('delete from gas_purchases where user_id = ?', [USER]);
  sql('delete from users where id = ?', [USER]);
  let me = await api('GET', '/api/me');
  check('a new account starts with 500 gas', me.json?.gas?.remaining === 500 && me.json?.gas?.balance === 500 && me.json?.gas?.allowance === 0, JSON.stringify(me.json?.gas));
  check('the welcome gas is one purchase row of kind welcome from ricorsa', purchases().length === 1 && purchases()[0].kind === 'welcome' && purchases()[0].provider === 'ricorsa' && purchases()[0].usd_cents === 0 && purchases()[0].gas === 500, JSON.stringify(purchases()));
  me = await api('GET', '/api/me');
  check('a second visit does not grant it again', me.json?.gas?.remaining === 500 && purchases().length === 1);
  check('every feature is on for a prepaid account', me.json?.plan?.key === 'professional' && me.json?.plan?.caps?.discover === 'full' && me.json?.plan?.caps?.browser === 'full' && me.json?.plan?.caps?.graph === 'full', JSON.stringify(me.json?.plan));
  check('/api/me carries the recharge rate and the auto-recharge state', me.json?.gas?.recharge?.gasPerUsd === 40 && me.json?.gas?.recharge?.minUsd === 20 && me.json?.gas?.recharge?.maxUsd === 5000 && me.json?.gas?.auto?.on === false && me.json?.gas?.auto?.thresholdGas === 200, JSON.stringify(me.json?.gas?.recharge));

  // An account from before prepaid (no welcome stamp) gets the gas on its next visit.
  sql('update users set welcome_gas_at = null, gas_balance = 40 where id = ?', [USER]); sql('delete from gas_purchases where user_id = ?', [USER]);
  me = await api('GET', '/api/me');
  check('an older account receives the welcome gas on its next visit, added to what it had', me.json?.gas?.remaining === 540 && purchases().length === 1 && purchases()[0].kind === 'welcome', JSON.stringify(me.json?.gas));

  // ---- The Recharge page's data ----
  resetAccount();
  const info = await api('GET', '/api/billing/finix/recharge');
  check('GET recharge: 40 gas per dollar, $20 to $5,000, seven tiles, no card, not yet agreed', info.json?.gasPerUsd === 40 && info.json?.minUsd === 20 && info.json?.maxUsd === 5000 && info.json?.tiles?.length === 7 && info.json?.tiles?.[0]?.usd === 20 && info.json?.tiles?.[0]?.gas === 800 && info.json?.card === null && info.json?.agreed === false && info.json?.available === true, JSON.stringify(info.json));

  // ---- Bounds and the agreement ----
  let r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20, token: 'TKvisa4242' });
  check('a recharge without the agreement is refused (400 agreement_required)', r.status === 400 && r.json?.code === 'agreement_required' && /Recharge Agreement/.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 10, token: 'TKvisa4242', agree: true });
  check('$10 is below the minimum (400)', r.status === 400 && r.json?.code === 'invalid_request' && /\$20/.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 5001, token: 'TKvisa4242', agree: true });
  check('$5,001 is above the maximum (400)', r.status === 400 && r.json?.code === 'invalid_request', `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20.5, token: 'TKvisa4242', agree: true });
  check('a fraction of a dollar is refused (400)', r.status === 400, `${r.status}`);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20, agree: true });
  check('without a card on file and without a token: 400 card_required', r.status === 400 && r.json?.code === 'card_required', `${r.status} ${r.text.slice(0, 200)}`);
  check('nothing was charged by the refused requests', ((await mock('/__state')).transfers || []).length === 0);

  // ---- First recharge with a new card ----
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20, token: 'TKvisa4242', agree: true, autoRecharge: false });
  check('$20 by a new card: 800 gas credited at once', r.status === 200 && r.json?.ok === true && r.json?.credited === true && r.json?.pending === false && r.json?.gas === 800 && r.json?.usd === 20 && r.json?.balance === 1300 && r.json?.remaining === 1300, `${r.status} ${r.text.slice(0, 300)}`);
  check('the response names the card now on file', r.json?.card?.brand === 'VISA' && r.json?.card?.lastFour === '4242' && r.json?.autoRecharge === false, JSON.stringify(r.json?.card));
  let u = userRow();
  check('the account keeps the card reference, brand and last four, and the agreement with its version', !!u.finix_instrument_id && u.card_brand === 'VISA' && u.card_last_four === '4242' && !!u.recharge_agreed_at && u.recharge_agreement_version === '2026-10-07', JSON.stringify({ i: u.finix_instrument_id, b: u.card_brand, l: u.card_last_four, a: u.recharge_agreed_at, v: u.recharge_agreement_version }));
  let p = purchases();
  check('the purchase row: kind recharge, provider finix, $20, 800 gas, agreement version', p[0]?.kind === 'recharge' && p[0]?.provider === 'finix' && p[0]?.usd_cents === 2000 && p[0]?.gas === 800 && p[0]?.agreement_version === '2026-10-07' && /^finix:TR/.test(p[0]?.order_id || ''), JSON.stringify(p[0]));
  let st = await mock('/__state');
  let t = st.transfers[st.transfers.length - 1];
  check('the transfer carried the account, the kind, the dollars and the gas in its tags, and an idempotency id', t?.amount === 2000 && t?.tags?.ricorsa_user === USER && t?.tags?.kind === 'gas' && t?.tags?.recharge === 'recharge' && t?.tags?.usd === '20' && t?.tags?.gas === '800' && /^rc-/.test(t?.idempotency_id || ''), JSON.stringify(t));
  check('the buyer identity carries the account id and the person\'s name', st.identities.length === 1 && st.identities[0].tags?.ricorsa_user === USER && st.identities[0].entity?.first_name === 'Dev', JSON.stringify(st.identities[0]));
  const firstCard = u.finix_instrument_id;

  // ---- One click with the card on file, a tile and a custom amount ----
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 50, agree: true });
  check('$50 one click with the card on file: 2,000 gas', r.status === 200 && r.json?.gas === 2000 && r.json?.balance === 3300 && r.json?.card?.lastFour === '4242', `${r.status} ${r.text.slice(0, 300)}`);
  st = await mock('/__state'); t = st.transfers[st.transfers.length - 1];
  check('the one-click charge went to the same card, with no new identity or instrument', t?.source === firstCard && st.identities.length === 1 && st.instruments.length === 1);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 123, agree: true });
  check('a custom $123: 4,920 gas', r.status === 200 && r.json?.gas === 4920 && r.json?.balance === 8220, `${r.status} ${r.text.slice(0, 300)}`);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 5000, agree: true });
  check('the top tile, $5,000: 200,000 gas', r.status === 200 && r.json?.gas === 200000, `${r.status} ${r.text.slice(0, 300)}`);
  me = await api('GET', '/api/me');
  check('the gauge shows every credit', me.json?.gas?.remaining === 208220 && me.json?.gas?.balance === 208220, JSON.stringify(me.json?.gas));

  // ---- Declines: a token the processor refuses, and a card whose charge fails ----
  resetAccount();
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20, token: 'TKdeclined', agree: true });
  check('a refused card: 402 card_declined with a plain sentence, no processor named', r.status === 402 && r.json?.code === 'card_declined' && noProvider(r.json?.error) && /declined|not accepted|another card/i.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 300)}`);
  check('a refused card leaves no card on file and no credit', !userRow().finix_instrument_id && userRow().gas_balance === 500);
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 20, token: 'TKfail-mc-5555', agree: true });
  check('a card whose charge fails: 402, plain sentence', r.status === 402 && r.json?.code === 'card_declined' && noProvider(r.json?.error), `${r.status} ${r.text.slice(0, 300)}`);
  u = userRow();
  check('the failing card is still kept on file (the person may fix it with the bank), nothing credited', !!u.finix_instrument_id && u.card_last_four === '5555' && u.gas_balance === 500 && purchases().filter(x => x.kind !== 'welcome').length === 0);

  // ---- A pending payment, settled by the webhook ----
  resetAccount();
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 100, token: 'TKpending-visa-1111', agree: true });
  check('a payment still clearing: 202 pending, nothing credited yet', r.status === 202 && r.json?.pending === true && r.json?.credited === false && r.json?.gas === 4000 && userRow().gas_balance === 500 && /confirmed|clears/.test(r.json?.message || ''), `${r.status} ${r.text.slice(0, 300)}`);
  st = await mock('/__state'); t = st.transfers[st.transfers.length - 1];
  const wh = await mock('/__webhook');
  check('the app registered its webhook with the stand-in (bearer and signing key)', !!wh.url && /\/api\/billing\/finix\/webhook$/.test(wh.url) && !!wh.bearer && !!wh.signingKey, JSON.stringify(wh));
  let d = await mock('/__settle', { transferId: t.id });
  check('the settlement webhook is accepted (200)', d.status === 200, JSON.stringify(d));
  await sleep(300);
  check('the webhook credited the 4,000 gas once it cleared', userRow().gas_balance === 4500 && purchases()[0]?.kind === 'recharge' && purchases()[0]?.gas === 4000 && purchases()[0]?.provider === 'finix', JSON.stringify({ bal: userRow().gas_balance, p: purchases()[0] }));
  d = await mock('/__deliver', { transferId: t.id });
  await sleep(300);
  check('the same transfer reported again (a retry) is not credited twice', d.status === 200 && userRow().gas_balance === 4500 && purchases().filter(x => x.kind === 'recharge').length === 1, JSON.stringify(d));
  // A delivery with the wrong bearer is refused.
  const bad = await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: JSON.stringify({ id: 'EVbad', type: 'updated', entity: 'transfer', _embedded: { transfers: [{ id: t.id, state: 'SUCCEEDED', tags: t.tags }] } }) });
  check('a delivery without the right bearer and signature is refused (401)', bad.status === 401, String(bad.status));

  // ---- Auto-recharge settings ----
  resetAccount();
  r = await api('PUT', '/api/billing/auto-recharge', { on: true });
  check('auto-recharge cannot be turned on without a card (400 card_required)', r.status === 400 && r.json?.code === 'card_required', `${r.status} ${r.text.slice(0, 200)}`);
  let count = await transfersNow();
  r = await api('POST', '/api/billing/finix/card', { token: 'TKvisa4242' });
  check('a card can be added on its own (no charge)', r.status === 200 && r.json?.card?.lastFour === '4242' && userRow().gas_balance === 500 && (await transfersNow()) === count, `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('PUT', '/api/billing/auto-recharge', { on: true });
  check('turning it on without the agreement on record needs agree (400 agreement_required)', r.status === 400 && r.json?.code === 'agreement_required', `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('PUT', '/api/billing/auto-recharge', { on: true, agree: true });
  check('on, with the agreement: threshold 200, $20 by default', r.status === 200 && r.json?.on === true && r.json?.thresholdGas === 200 && r.json?.usd === 20 && r.json?.agreed === true && userRow().auto_recharge === 1 && !!userRow().recharge_agreed_at, `${r.status} ${r.text.slice(0, 300)}`);
  r = await api('PUT', '/api/billing/auto-recharge', { thresholdGas: 500, usd: 100 });
  check('the threshold and the amount can be changed', r.status === 200 && r.json?.thresholdGas === 500 && r.json?.usd === 100 && userRow().auto_recharge_threshold === 500 && userRow().auto_recharge_usd === 100, `${r.status} ${r.text.slice(0, 300)}`);
  r = await api('PUT', '/api/billing/auto-recharge', { thresholdGas: 10 });
  check('a threshold below 50 is refused', r.status === 400, `${r.status}`);
  r = await api('PUT', '/api/billing/auto-recharge', { usd: 7 });
  check('an auto-recharge amount under $20 is refused', r.status === 400, `${r.status}`);
  r = await api('GET', '/api/billing/auto-recharge');
  check('GET reports the state', r.json?.on === true && r.json?.thresholdGas === 500 && r.json?.usd === 100 && r.json?.card?.lastFour === '4242', r.text.slice(0, 300));
  r = await api('PUT', '/api/billing/auto-recharge', { on: false });
  check('and it can be turned off', r.status === 200 && r.json?.on === false && userRow().auto_recharge === 0);

  // A recharge with the auto-recharge box ticked turns it on for that amount.
  r = await api('POST', '/api/billing/finix/recharge', { amountUsd: 50, agree: true, autoRecharge: true });
  check('a recharge with auto-recharge ticked turns it on for the same amount', r.status === 200 && r.json?.autoRecharge === true && userRow().auto_recharge === 1 && userRow().auto_recharge_usd === 50, `${r.status} ${r.text.slice(0, 300)}`);

  // ---- Auto-recharge fires once a day when the balance is low ----
  resetAccount({ balance: 100 });
  await api('POST', '/api/billing/finix/card', { token: 'TKvisa4242' });
  await api('PUT', '/api/billing/auto-recharge', { on: true, agree: true, usd: 20, thresholdGas: 200 });
  let before = ((await mock('/__state')).transfers || []).length;
  me = await api('GET', '/api/me');
  await sleep(1500);
  u = userRow(); st = await mock('/__state');
  check('below the threshold, the gauge refresh triggers one automatic $20 charge: 800 gas added', st.transfers.length === before + 1 && u.gas_balance === 900 && !!u.auto_recharge_last_at && u.auto_recharge_failures === 0, JSON.stringify({ transfers: st.transfers.length - before, bal: u.gas_balance, last: u.auto_recharge_last_at }));
  t = st.transfers[st.transfers.length - 1];
  check('the automatic transfer is tagged as auto with an idempotency id for the claim', t?.tags?.recharge === 'auto' && t?.tags?.gas === '800' && /^auto-.*-\d{13}$/.test(t?.idempotency_id || ''), JSON.stringify(t));
  check('its purchase row is of kind auto', purchases()[0]?.kind === 'auto' && purchases()[0]?.gas === 800 && purchases()[0]?.provider === 'finix', JSON.stringify(purchases()[0]));
  sql('update users set gas_balance = 100 where id = ?', [USER]);
  before = st.transfers.length;
  me = await api('GET', '/api/me');
  await sleep(1200);
  check('low again the same day: no second charge', ((await mock('/__state')).transfers || []).length === before && userRow().gas_balance === 100);
  sql('update users set auto_recharge_last_at = ? where id = ?', [Date.now() - 25 * 3600e3, USER]);
  me = await api('GET', '/api/me');
  await sleep(1500);
  check('a day later it charges again', ((await mock('/__state')).transfers || []).length === before + 1 && userRow().gas_balance === 900);
  // Above the threshold nothing happens.
  sql('update users set gas_balance = 5000, auto_recharge_last_at = null where id = ?', [USER]);
  before = ((await mock('/__state')).transfers || []).length;
  me = await api('GET', '/api/me');
  await sleep(800);
  check('above the threshold nothing is charged', ((await mock('/__state')).transfers || []).length === before && userRow().gas_balance === 5000);

  // The answer path: a question that takes the balance under the threshold is followed by a 'gas' event.
  sql('update users set gas_balance = 200, auto_recharge_last_at = null where id = ?', [USER]);
  const ask = await fetch(APP + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is prepaid gas?', mode: 'search', tier: 'quick' }) });
  const sse = await ask.text();
  const gasEvent = sse.split('\n\n').find(ch => /^event:\s*gas/m.test(ch));
  const gasData = gasEvent ? JSON.parse(gasEvent.split('\n').find(l => l.startsWith('data:')).slice(5)) : null;
  check('an answer that drops the balance below the threshold ends with a gas event: auto-recharge ran', ask.status === 200 && !!gasData && gasData.auto === true && gasData.charged === true && gasData.gas === 800 && gasData.remaining === 999, `${ask.status} ${gasData ? JSON.stringify(gasData) : sse.slice(-400)}`);

  // ---- Three failed charges switch it off; a new card lets it be turned back on ----
  resetAccount({ balance: 100 });
  r = await api('POST', '/api/billing/finix/card', { token: 'TKvisa4242' });
  await mock('/__card', { instrumentId: userRow().finix_instrument_id, mode: 'fail' });
  await api('PUT', '/api/billing/auto-recharge', { on: true, agree: true, usd: 20, thresholdGas: 200 });
  for (let i = 1; i <= 3; i++) {
    sql('update users set auto_recharge_last_at = null where id = ?', [USER]);
    me = await api('GET', '/api/me');
    await sleep(1200);
    u = userRow();
    check(`failed charge ${i}: failures ${i}, auto-recharge ${i < 3 ? 'still on' : 'switched off'}`, u.auto_recharge_failures === i && u.auto_recharge === (i < 3 ? 1 : 0) && u.gas_balance === 100, JSON.stringify({ f: u.auto_recharge_failures, on: u.auto_recharge }));
  }
  r = await api('GET', '/api/billing/auto-recharge');
  check('the state says off after failures', r.json?.on === false && r.json?.off === true && r.json?.failures === 3, r.text.slice(0, 300));
  me = await api('GET', '/api/me');
  check('/api/me says so too, for the app', me.json?.gas?.auto?.off === true && me.json?.gas?.auto?.on === false);
  sql('update users set auto_recharge_last_at = null where id = ?', [USER]);
  before = ((await mock('/__state')).transfers || []).length;
  me = await api('GET', '/api/me'); await sleep(800);
  check('while off nothing more is attempted', ((await mock('/__state')).transfers || []).length === before);
  r = await api('POST', '/api/billing/finix/card', { token: 'TKmc-5555' });
  check('a new card resets the failures', r.status === 200 && userRow().auto_recharge_failures === 0 && userRow().card_brand === 'MASTERCARD', `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('PUT', '/api/billing/auto-recharge', { on: true });
  check('and auto-recharge can be turned back on', r.status === 200 && r.json?.on === true && r.json?.off === false, `${r.status} ${r.text.slice(0, 300)}`);

  // ---- PayPal ----
  resetAccount();
  r = await api('POST', '/api/billing/paypal/gas', { op: 'create', amountUsd: 7, agree: true });
  check('PayPal: $7 is refused (400)', r.status === 400, `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('POST', '/api/billing/paypal/gas', { op: 'create', amountUsd: 40, agree: true });
  check('PayPal: an order for $40 (1,600 gas) is created', r.status === 200 && !!r.json?.orderId && r.json?.usd === 40 && r.json?.gas === 1600, `${r.status} ${r.text.slice(0, 200)}`);
  check('the agreement sent with the order is recorded', !!userRow().recharge_agreed_at);
  const orderId = r.json?.orderId;
  r = await api('POST', '/api/billing/paypal/gas', { op: 'capture', orderId });
  check('PayPal: the capture credits 1,600 gas', r.status === 200 && r.json?.credited === true && r.json?.gas === 1600 && r.json?.balance === 2100, `${r.status} ${r.text.slice(0, 300)}`);
  check('its purchase row is a recharge from paypal with the agreement version', purchases()[0]?.provider === 'paypal' && purchases()[0]?.kind === 'recharge' && purchases()[0]?.usd_cents === 4000 && purchases()[0]?.agreement_version === '2026-10-07', JSON.stringify(purchases()[0]));
  r = await api('POST', '/api/billing/paypal/gas', { op: 'capture', orderId });
  check('capturing the same order again credits nothing', r.status === 200 && r.json?.credited === false && userRow().gas_balance === 2100, `${r.status} ${r.text.slice(0, 300)}`);
  r = await api('POST', '/api/billing/paypal/gas', { op: 'create', blocks: 1 });
  check('an older client sending blocks still gets a $100 order', r.status === 200 && r.json?.usd === 100 && r.json?.gas === 4000, `${r.status} ${r.text.slice(0, 200)}`);

  // ---- Retired plans ----
  r = await api('POST', '/api/billing/finix/subscribe', { plan: 'professional', token: 'TKvisa4242' });
  check('subscribing to Professional by card answers 410 plans_retired, nothing charged', r.status === 410 && r.json?.code === 'plans_retired' && noProvider(r.json?.error), `${r.status} ${r.text.slice(0, 200)}`);
  r = await api('POST', '/api/billing/finix/subscribe', { plan: 'essentials', token: 'TKvisa4242' });
  check('and Essentials too', r.status === 410 && r.json?.code === 'plans_retired', `${r.status}`);
  r = await api('POST', '/api/billing/finix/gas', { token: 'TKvisa4242', blocks: 1 });
  check('the old Pay-As-You-Go endpoint answers 410 and points at the Recharge page', r.status === 410 && r.json?.code === 'moved' && /Recharge page/.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 200)}`);

  // ---- Out of gas: what the person is told ----
  resetAccount({ balance: 0 });
  const dry = await fetch(APP + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Anything', mode: 'search', tier: 'quick' }) });
  const dryText = await dry.text(); let dryJson = null; try { dryJson = JSON.parse(dryText); } catch { /* sse */ }
  const dryMsg = dryJson?.error || (dryText.match(/"message":"([^"]+)"/) || [])[1] || '';
  check('with no gas a question is refused with a recharge sentence that names the price, not a provider or a plan', (dry.status === 429 || /gas_limit/.test(dryText)) && /out of gas/i.test(dryMsg) && /\$20 buys 800 gas/.test(dryMsg) && noProvider(dryMsg) && !/plan|trial|Essentials|Professional/i.test(dryMsg), `${dry.status} ${dryMsg || dryText.slice(0, 300)}`);
  sql('update users set gas_balance = 5 where id = ?', [USER]);
  const low = await fetch(APP + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'A report, please', mode: 'research' }) });
  const lowText = await low.text(); let lowJson = null; try { lowJson = JSON.parse(lowText); } catch { /* sse */ }
  const lowMsg = lowJson?.error || (lowText.match(/"message":"([^"]+)"/) || [])[1] || '';
  check('with 5 gas, a 10-gas Research report is refused: what it costs, what is left, how to recharge', /costs 10 gas and you have 5 gas left/i.test(lowMsg) && /recharge/i.test(lowMsg) && noProvider(lowMsg), `${low.status} ${lowMsg || lowText.slice(0, 300)}`);

  // ---- The pages ----
  // A fresh account with its welcome gas on record, so the Account page has a row to list.
  resetAccount({ balance: 0, welcome: false }); await api('GET', '/api/me');
  let page = await api('GET', '/pricing'); let text = visible(page.text);
  check('/pricing is the Recharge page: tiles, Recommended, the agreement, Custom, Enterprise', page.status === 200 && /Recharge/.test(text) && /Recommended/.test(text) && /Recharge Agreement/.test(text) && /Custom/.test(text) && /\$5,000/.test(text) && /For organizations/.test(text) && /Order summary/.test(text), `${page.status}`);
  check('/pricing says nothing of trials, Essentials or Professional', !/free trial|14-day|Essentials|Professional plan|Pay-As-You-Go/.test(text), (text.match(/.{60}(free trial|14-day|Essentials|Professional plan|Pay-As-You-Go).{40}/) || [''])[0]);
  check('/pricing does not name the card processor in what a reader sees', !/Finix/i.test(text), (text.match(/.{60}Finix.{40}/i) || [''])[0]);
  page = await api('GET', '/recharge');
  check('/recharge sends people to /pricing', [301, 302, 307, 308].includes(page.status) && /\/pricing/.test(page.headers.get('location') || ''), `${page.status} ${page.headers.get('location')}`);
  page = await api('GET', '/recharge-agreement'); text = visible(page.text);
  check('/recharge-agreement renders with its version, refunds, card on file and auto-recharge', page.status === 200 && /Version 2026-10-07/.test(text) && /Refunds/.test(text) && /card on file/i.test(text) && /Auto-recharge/.test(text) && /at most once in any 24 hours/.test(text), `${page.status}`);
  page = await api('GET', '/account'); text = visible(page.text);
  check('/account shows gas, the card and auto-recharge controls, and the welcome gas in the list', page.status === 200 && /Card and auto-recharge/.test(text) && /Gas added/.test(text) && /Welcome gas/.test(text) && /Recharge/.test(text) && !/Start a free trial|Change plan|Buy gas/.test(text), `${page.status} ${['Card and auto-recharge', 'Gas added', 'Welcome gas'].filter(k => !text.includes(k)).join(', ') || 'copy present'}`);
  check('/account shows no Plan card for a prepaid account', !/<h3>Plan<\/h3>/.test(text));
  page = await api('GET', '/'); text = visible(page.text);
  check('the landing page fine print is prepaid', page.status === 200 && /500 gas/.test(text) && /no subscription/.test(text) && !/free trial/.test(text), `${page.status}`);
  page = await api('GET', '/terms'); text = visible(page.text);
  check('the terms describe prepaid gas', page.status === 200 && /Gas and billing/.test(text) && /October 7, 2026/.test(text), `${page.status}`);
  page = await api('GET', '/app');
  check('the app shell has the Recharge row and no Upgrade row', page.status === 200 && /id="upgradeRow"[^>]*data-tip="Recharge"/.test(page.text) && !/Upgrade to Pro/.test(page.text), `${page.status}`);
  const js = await api('GET', '/app/assets/app.js');
  check('the app script has no plan-era copy left', js.status === 200 && !/Pay-As-You-Go|free trial|See plans|Upgrade to \$\{/.test(js.text) && /applyTopUp/.test(js.text) && /Recharge/.test(js.text), `${js.status}`);

  // A legacy subscriber still sees a Plan card and keeps the allowance.
  sql("update users set plan = 'professional', subscription_status = 'ACTIVE', paypal_subscription_id = 'I-LEGACY' where id = ?", [USER]);
  me = await api('GET', '/api/me');
  check('a Professional subscriber from before keeps the 8,000 monthly allowance plus the welcome gas', me.json?.gas?.allowance === 8000 && me.json?.gas?.remaining === 8500 && me.json?.plan?.subscription === 'professional' && me.json?.plan?.name === 'Professional', JSON.stringify(me.json?.gas));
  page = await api('GET', '/account'); text = visible(page.text);
  check('their Account page shows the Plan card with the cancel button and the prepaid note', page.status === 200 && /<h3>Plan<\/h3>/.test(text) && /no longer sells subscriptions/.test(text), `${page.status}`);
  resetAccount();

  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('test run crashed', e); process.exit(2); });
