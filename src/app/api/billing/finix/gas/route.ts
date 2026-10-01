import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { PAYG, gas as gasWord } from '@/lib/plans';
import { finixProvisioned } from '@/lib/finix-setup';
import { finixConfigured, createInstrumentFromToken, createTransfer, customerMessageFor, isFinixError } from '@/lib/finix';
import { buyerIdentity } from '@/lib/finix-buyer';
import { creditGas, gasState } from '@/lib/usage';

export const dynamic = 'force-dynamic';
const MAX_BLOCKS = 10;
const Body = z.object({ token: z.string().min(4).max(80), blocks: z.number().int().min(1).max(MAX_BLOCKS).default(1) });

/**
 * POST /api/billing/finix/gas — Pay-As-You-Go gas paid by card: the token from Finix.js becomes a payment instrument on
 * the person's buyer identity and is debited once for `blocks` x $100 (an idempotency id keeps a retried request from
 * charging twice). A payment that succeeds at once is credited here; one still pending is credited when the webhook
 * reports it. The gas is credited once per transfer however many times the transfer is reported.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!finixConfigured()) return fail(503, 'Card checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  const cfg = await finixProvisioned();
  if (!cfg?.merchantId) return fail(503, 'Card checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const blocks = b.data.blocks; const usdCents = PAYG.usd * 100 * blocks; const amount = PAYG.gas * blocks;
  try {
    const identityId = await buyerIdentity(user);
    const instrument = await createInstrumentFromToken(b.data.token, identityId);
    const transfer = await createTransfer({ merchantId: cfg.merchantId, instrumentId: instrument.id, amountCents: usdCents, idempotencyId: `gas-${user.id.replace(/[^A-Za-z0-9]/g, '').slice(-24)}-${uid()}`, tags: { ricorsa_user: user.id, kind: 'gas', blocks: String(blocks), gas: String(amount) } });
    const state = String(transfer.state || '').toUpperCase();
    if (state === 'SUCCEEDED') {
      const credited = await creditGas(user.id, `finix:${transfer.id}`, usdCents, amount, 'finix');
      const st = await gasState({ ...user, gasBalance: credited ?? user.gasBalance });
      console.log('[finix] gas bought', JSON.stringify({ user: user.id, transfer: transfer.id, blocks, usdCents }));
      return json({ ok: true, credited: credited !== null, gas: amount, usd: PAYG.usd * blocks, balance: st.balance, remaining: st.unlimited ? null : st.remaining, pending: false });
    }
    if (state === 'PENDING' || state === 'UNKNOWN') {
      console.log('[finix] gas payment pending', JSON.stringify({ user: user.id, transfer: transfer.id, blocks }));
      return json({ ok: true, credited: false, pending: true, gas: amount, usd: PAYG.usd * blocks, message: `The payment is being confirmed; ${gasWord(amount)} lands on your account as soon as it clears.` }, { status: 202 });
    }
    console.warn('[finix] gas payment failed', JSON.stringify({ user: user.id, transfer: transfer.id, state, code: transfer.failure_code, message: transfer.failure_message }));
    return fail(402, customerMessageFor(new Error(`${transfer.failure_code || ''} ${transfer.failure_message || 'declined'}`)), 'card_declined');
  } catch (e) {
    if (isFinixError(e)) {
      console.warn('[finix] gas purchase failed', JSON.stringify({ user: user.id, blocks, status: e.status, code: e.code, message: e.message.slice(0, 300) }));
      return fail(e.status === 422 || e.status === 402 || e.status === 400 ? 402 : 502, customerMessageFor(e), 'card_declined');
    }
    throw e;
  }
});
