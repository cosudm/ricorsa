import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { createOrder, captureOrder, paypalConfigured } from '@/lib/paypal';
import { creditGas, gasState } from '@/lib/usage';
import { RECHARGE, PAYG, gasForUsd, validRechargeUsd, gas as gasWord } from '@/lib/plans';
import { recordAgreement } from '@/lib/recharge';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), amountUsd: z.number().int().min(RECHARGE.minUsd).max(RECHARGE.maxUsd).optional(), blocks: z.number().int().min(1).max(10).optional(), agree: z.literal(true).optional() }),
  z.object({ op: z.literal('capture'), orderId: z.string().min(3).max(64) }),
]);

/**
 * POST /api/billing/paypal/gas — a recharge through PayPal, as a one-time order (the second way to pay, behind the card).
 *   create: the server makes the order for the dollar amount chosen (older clients send $100 blocks) with this account's
 *           id on it; the browser gets the id to approve.
 *   capture: after approval, the server captures the order, checks it is this account's, completed, in US dollars and for
 *            a whole dollar amount in range, and credits the gas once (a second capture of the same order credits nothing).
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!paypalConfigured()) return fail(503, 'Checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  if (b.data.op === 'create') {
    const usd = b.data.amountUsd ?? (b.data.blocks ? b.data.blocks * PAYG.usd : RECHARGE.minUsd);
    if (!validRechargeUsd(usd)) return fail(400, `Choose an amount between $${RECHARGE.minUsd} and $${RECHARGE.maxUsd.toLocaleString('en-US')}.`, 'invalid_request');
    if (b.data.agree) await recordAgreement(user.id);
    const order = await createOrder(usd, user.id, `Ricorsa recharge: ${gasWord(gasForUsd(usd))}`);
    return json({ orderId: order.id, usd, gas: gasForUsd(usd) });
  }
  const order = await captureOrder(b.data.orderId);
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find(c => c.status === 'COMPLETED') || unit?.payments?.captures?.[0];
  if (unit?.custom_id && unit.custom_id !== user.id) return fail(403, 'That payment belongs to another account', 'forbidden');
  if (!capture || capture.status !== 'COMPLETED') return fail(409, capture?.status === 'PENDING' ? 'PayPal is still confirming the payment. Your gas is credited as soon as it clears.' : 'The payment did not complete. Nothing was charged.', 'payment_incomplete');
  const amount = capture.amount || unit?.amount;
  const usd = Number(amount?.value);
  if (!amount || amount.currency_code !== 'USD' || !Number.isFinite(usd) || !validRechargeUsd(Math.round(usd)) || Math.abs(usd - Math.round(usd)) > 1e-6) return fail(409, 'The payment amount did not match a recharge. Contact support and we will put it right.', 'amount_mismatch');
  const whole = Math.round(usd); const gas = gasForUsd(whole);
  const credited = await creditGas(user.id, order.id, whole * 100, gas, 'paypal', 'recharge', RECHARGE.agreementVersion);
  const st = await gasState({ ...user, gasBalance: credited ?? user.gasBalance });
  console.log('[recharge] paypal', JSON.stringify({ user: user.id, usd: whole, gas, order: order.id, credited: credited !== null }));
  return json({ ok: true, credited: credited !== null, gas, usd: whole, balance: st.balance, remaining: st.unlimited ? null : st.remaining });
});
