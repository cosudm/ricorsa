import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { RECHARGE, gasForUsd, gas as gasWord } from '@/lib/plans';
import { finixConfigured, customerMessageFor, isFinixError, type FinixInstrument } from '@/lib/finix';
import { finixProvisioned } from '@/lib/finix-setup';
import { saveCard, chargeCard, recordAgreement, setAutoRecharge, cardOnFile } from '@/lib/recharge';
import { gasState } from '@/lib/usage';

export const dynamic = 'force-dynamic';
const Body = z.object({
  /** Whole dollars, within the offered range. */
  amountUsd: z.number().int().min(RECHARGE.minUsd).max(RECHARGE.maxUsd),
  /** A Finix.js token for a new card; without one the card on file is charged. */
  token: z.string().min(4).max(80).optional(),
  /** The person has read and agreed to the Recharge Agreement (required). */
  agree: z.literal(true),
  /** Turn auto-recharge on (or leave it) with this purchase; the amount bought becomes the amount it buys. */
  autoRecharge: z.boolean().optional(),
});

/**
 * POST /api/billing/finix/recharge — a recharge by card: the amount chosen on the Recharge page, paid with a new card
 * (the Finix.js token, which becomes the card on file) or with the card already on file, credited as gas at the
 * current rate. The agreement is recorded with the account and the purchase; auto-recharge, when asked for, is
 * switched on for the same amount. A payment still clearing is credited by the webhook.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!finixConfigured()) return fail(503, 'Card payments are being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req));
  if (!b.success) return fail(400, b.error.issues.some(i => i.path[0] === 'agree') ? 'Please read and agree to the Recharge Agreement first.' : `Choose an amount between $${RECHARGE.minUsd} and $${RECHARGE.maxUsd.toLocaleString('en-US')}.`, b.error.issues.some(i => i.path[0] === 'agree') ? 'agreement_required' : 'invalid_request');
  const cfg = await finixProvisioned();
  if (!cfg?.merchantId) return fail(503, 'Card payments are being set up. Please check back in a moment.', 'checkout_unavailable');
  const { amountUsd, token, autoRecharge } = b.data;
  try {
    let instrumentId = user.finixInstrumentId; let saved: FinixInstrument | null = null;
    if (token) { saved = await saveCard(user, token); instrumentId = saved.id; }
    if (!instrumentId) return fail(400, 'Enter a card to pay with.', 'card_required');
    await recordAgreement(user.id);
    const out = await chargeCard(user, instrumentId, amountUsd, 'recharge', `rc-${user.id.replace(/[^A-Za-z0-9]/g, '').slice(-24)}-${uid()}`);
    if (typeof autoRecharge === 'boolean') await setAutoRecharge(user.id, { on: autoRecharge, usd: amountUsd });
    const fresh = { ...user, gasBalance: out.credited ?? user.gasBalance };
    const st = await gasState(fresh);
    const card = saved ? { brand: saved.brand || null, lastFour: saved.last_four || null } : cardOnFile(user);
    console.log('[recharge] card', JSON.stringify({ user: user.id, usd: amountUsd, gas: out.gas, pending: out.pending, transfer: out.transfer.id, newCard: !!token, auto: autoRecharge ?? null }));
    if (out.pending) return json({ ok: true, credited: false, pending: true, usd: amountUsd, gas: out.gas, message: `The payment is being confirmed; ${gasWord(out.gas)} lands on your account as soon as it clears.` }, { status: 202 });
    return json({ ok: true, credited: out.credited !== null, pending: false, usd: amountUsd, gas: out.gas, balance: st.balance, remaining: st.unlimited ? null : st.remaining, card, autoRecharge: autoRecharge ?? !!user.autoRecharge });
  } catch (e) {
    if (isFinixError(e) || (e as { declined?: boolean })?.declined) {
      console.warn('[recharge] card failed', JSON.stringify({ user: user.id, usd: amountUsd, status: isFinixError(e) ? e.status : 402, message: String((e as Error).message || e).slice(0, 300) }));
      return fail(402, customerMessageFor(e), 'card_declined');
    }
    throw e;
  }
});

/** GET /api/billing/finix/recharge — what the Recharge page needs: the rate, the tiles and the card on file. */
export const GET = handle(async () => {
  const user = await currentUser();
  return json({ gasPerUsd: RECHARGE.gasPerUsd, minUsd: RECHARGE.minUsd, maxUsd: RECHARGE.maxUsd, tiles: RECHARGE.tiles.map(t => ({ ...t, gas: gasForUsd(t.usd) })), card: cardOnFile(user), agreed: !!user.rechargeAgreedAt, agreementVersion: RECHARGE.agreementVersion, available: finixConfigured() });
});
