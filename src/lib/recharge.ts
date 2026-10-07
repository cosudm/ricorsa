/**
 * Recharges and the card on file. A recharge is one card payment for a dollar amount the person chose, credited as
 * gas at RECHARGE.gasPerUsd. The card used is kept on the person's Finix buyer identity as the card on file, so a
 * later recharge is one click and auto-recharge can charge it when the balance runs low: at most once a day, only
 * with the Recharge Agreement on record, and off by itself after three failed charges. Customers never see the
 * processor's name or its error text; the routes turn failures into plain sentences.
 */
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db, schema } from './db';
import { RECHARGE, gasForUsd, validRechargeUsd } from './plans';
import { finixConfigured, createInstrumentFromToken, createTransfer, isFinixError, type FinixInstrument, type FinixTransfer } from './finix';
import { finixProvisioned } from './finix-setup';
import { buyerIdentity } from './finix-buyer';
import { creditGas, gasState } from './usage';
import type { CurrentUser } from './session';

export type CardOnFile = { brand: string | null; lastFour: string | null } | null;
export function cardOnFile(user: Pick<CurrentUser, 'finixInstrumentId' | 'cardBrand' | 'cardLastFour'>): CardOnFile {
  return user.finixInstrumentId ? { brand: user.cardBrand || null, lastFour: user.cardLastFour || null } : null;
}

/** Save the card behind a Finix.js token as the account's card on file (a payment instrument on its buyer identity). */
export async function saveCard(user: CurrentUser, token: string): Promise<FinixInstrument> {
  const identityId = await buyerIdentity(user);
  const instrument = await createInstrumentFromToken(token, identityId);
  await db().update(schema.users).set({ finixInstrumentId: instrument.id, cardBrand: instrument.brand || null, cardLastFour: instrument.last_four || null, autoRechargeFailures: 0 }).where(eq(schema.users.id, user.id));
  return instrument;
}

/** Record the person's agreement to the Recharge Agreement in force (kept with the account; each purchase row carries the version too). */
export async function recordAgreement(userId: string): Promise<void> {
  await db().update(schema.users).set({ rechargeAgreedAt: new Date(), rechargeAgreementVersion: RECHARGE.agreementVersion }).where(eq(schema.users.id, userId));
}

export type RechargeOutcome = { transfer: FinixTransfer; usd: number; gas: number; credited: number | null; pending: boolean };

/**
 * Charge the card on file (or a just-saved card) for `usd` and credit the gas. A payment that succeeds at once is
 * credited here; one still clearing is credited when the webhook reports it (the transfer's tags carry the account
 * and the gas). `idempotencyId` keeps a retried request from charging twice.
 */
export async function chargeCard(user: CurrentUser, instrumentId: string, usd: number, kind: 'recharge' | 'auto', idempotencyId: string): Promise<RechargeOutcome> {
  if (!validRechargeUsd(usd)) throw new Error('amount out of range');
  const cfg = await finixProvisioned();
  if (!cfg?.merchantId) throw new Error('card checkout is not provisioned');
  const gas = gasForUsd(usd);
  const transfer = await createTransfer({ merchantId: cfg.merchantId, instrumentId, amountCents: usd * 100, idempotencyId, tags: { ricorsa_user: user.id, kind: 'gas', recharge: kind, usd: String(usd), gas: String(gas) } });
  const state = String(transfer.state || '').toUpperCase();
  if (state === 'SUCCEEDED') {
    const credited = await creditGas(user.id, `finix:${transfer.id}`, usd * 100, gas, 'finix', kind, RECHARGE.agreementVersion);
    return { transfer, usd, gas, credited, pending: false };
  }
  if (state === 'PENDING' || state === 'UNKNOWN') return { transfer, usd, gas, credited: null, pending: true };
  throw Object.assign(new Error(`${transfer.failure_code || ''} ${transfer.failure_message || 'declined'}`.trim()), { declined: true, transfer });
}

export type AutoRechargeState = { on: boolean; thresholdGas: number; usd: number; failures: number; lastAt: number | null; off: boolean; card: CardOnFile; agreed: boolean };
export function autoRechargeState(user: CurrentUser): AutoRechargeState {
  return {
    on: !!user.autoRecharge, thresholdGas: user.autoRechargeThreshold || RECHARGE.autoThresholdGas, usd: user.autoRechargeUsd || RECHARGE.autoUsdDefault,
    failures: user.autoRechargeFailures || 0, lastAt: user.autoRechargeLastAt ? new Date(user.autoRechargeLastAt).getTime() : null,
    /** Switched off by failures, not by the person: the Account page says so until the card is updated. */
    off: !user.autoRecharge && (user.autoRechargeFailures || 0) >= RECHARGE.autoFailuresOff,
    card: cardOnFile(user), agreed: !!user.rechargeAgreedAt,
  };
}

export type AutoRechargeResult = { ran: false; why: string } | { ran: true; charged: boolean; pending: boolean; gas: number; usd: number; failures: number; off: boolean };

/**
 * Charge the card on file when the balance has fallen below the person's threshold. Called after a charge lands and
 * from the gauge's refresh. Conditions: auto-recharge on, a card on file, the agreement on record, fewer than three
 * failures in a row, nothing charged in the last day. The day's slot is claimed on the row before the charge, so two
 * requests arriving together make one payment, and the claim's time is the payment's idempotency id. A failed charge
 * counts; the third switches auto-recharge off.
 */
export async function autoRechargeIfNeeded(user: CurrentUser): Promise<AutoRechargeResult> {
  if (user.admin) return { ran: false, why: 'admin' };
  if (!finixConfigured()) return { ran: false, why: 'unconfigured' };
  const d = db();
  const row = (await d.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1))[0];
  if (!row) return { ran: false, why: 'no row' };
  if (!row.autoRecharge || !row.finixInstrumentId || !row.rechargeAgreedAt) return { ran: false, why: 'off' };
  if ((row.autoRechargeFailures || 0) >= RECHARGE.autoFailuresOff) return { ran: false, why: 'failures' };
  const st = await gasState({ ...user, ...row, admin: false });
  const threshold = row.autoRechargeThreshold || RECHARGE.autoThresholdGas;
  if (st.remaining >= threshold) return { ran: false, why: 'enough' };
  const usd = validRechargeUsd(row.autoRechargeUsd) ? row.autoRechargeUsd : RECHARGE.autoUsdDefault;
  // Claim today's slot: the row is updated only when nothing ran in the last day, so a second request finds it taken.
  const claimAt = new Date();
  const since = new Date(claimAt.getTime() - 24 * 3600e3);
  const claimed = await d.update(schema.users).set({ autoRechargeLastAt: claimAt })
    .where(and(eq(schema.users.id, user.id), or(isNull(schema.users.autoRechargeLastAt), lt(schema.users.autoRechargeLastAt, since)))).returning({ id: schema.users.id });
  if (!claimed.length) return { ran: false, why: 'today' };
  try {
    const out = await chargeCard({ ...user, ...row }, row.finixInstrumentId, usd, 'auto', `auto-${user.id.replace(/[^A-Za-z0-9]/g, '').slice(-24)}-${claimAt.getTime()}`);
    await d.update(schema.users).set({ autoRechargeFailures: 0 }).where(eq(schema.users.id, user.id));
    console.log('[recharge] auto', JSON.stringify({ user: user.id, usd, gas: out.gas, pending: out.pending, transfer: out.transfer.id }));
    return { ran: true, charged: !out.pending, pending: out.pending, gas: out.gas, usd, failures: 0, off: false };
  } catch (e) {
    const failures = (row.autoRechargeFailures || 0) + 1;
    const off = failures >= RECHARGE.autoFailuresOff;
    await d.update(schema.users).set({ autoRechargeFailures: failures, ...(off ? { autoRecharge: false } : {}) }).where(eq(schema.users.id, user.id));
    const err = e as { message?: string; status?: number; code?: string };
    console.warn('[recharge] auto failed', JSON.stringify({ user: user.id, usd, failures, off, status: isFinixError(e) ? e.status : null, code: isFinixError(e) ? e.code : err.code || null, message: String(err.message || e).slice(0, 200) }));
    return { ran: true, charged: false, pending: false, gas: 0, usd, failures, off };
  }
}

/** Settings a person may change on the Account page. */
export async function setAutoRecharge(userId: string, patch: { on?: boolean; thresholdGas?: number; usd?: number }): Promise<void> {
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (typeof patch.on === 'boolean') { set.autoRecharge = patch.on; if (patch.on) set.autoRechargeFailures = 0; }
  if (typeof patch.thresholdGas === 'number' && patch.thresholdGas >= 50 && patch.thresholdGas <= 100000) set.autoRechargeThreshold = Math.round(patch.thresholdGas);
  if (validRechargeUsd(patch.usd)) set.autoRechargeUsd = patch.usd;
  if (Object.keys(set).length) await db().update(schema.users).set(set).where(eq(schema.users.id, userId));
}

/** What each kind of credit is called on the Account page. */
export const purchaseKinds = { recharge: 'Recharge', auto: 'Auto-recharge', welcome: 'Welcome gas' } as const;

/** What the client hears when auto-recharge ran after a charge: the outcome and where the gauge stands now. */
export type TopUpNote = { auto: true; charged: boolean; pending: boolean; gas: number; usd: number; off: boolean; remaining: number | null };
/**
 * After a charge lands: when the receipt shows the balance under the person's threshold and auto-recharge is on, run
 * it and say what happened, so the gauge can move and the person can be told. Null when nothing needed doing.
 */
export async function topUpIfLow(user: CurrentUser, receipt: { remaining: number | null; unlimited?: boolean } | null | undefined): Promise<TopUpNote | null> {
  if (!receipt || receipt.unlimited || receipt.remaining === null || !user.autoRecharge || user.admin) return null;
  if (receipt.remaining >= (user.autoRechargeThreshold || RECHARGE.autoThresholdGas)) return null;
  const r = await autoRechargeIfNeeded(user);
  if (!r.ran) return null;
  // The balance as it stands now, from the row (the request's user object is from before the charge).
  const row = (await db().select({ gasBalance: schema.users.gasBalance }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1))[0];
  const st = await gasState({ ...user, gasBalance: row?.gasBalance ?? user.gasBalance });
  return { auto: true, charged: r.charged, pending: r.pending, gas: r.gas, usd: r.usd, off: r.off, remaining: st.unlimited ? null : st.remaining };
}
