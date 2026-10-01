import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { createOrder, captureOrder, paypalConfigured } from '@/lib/paypal';
import { creditGas, gasState } from '@/lib/usage';
import { PAYG, gas as gasWord } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/** How many $100 blocks one purchase may hold. */
const MAX_BLOCKS = 10;
const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), blocks: z.number().int().min(1).max(MAX_BLOCKS).default(1) }),
  z.object({ op: z.literal('capture'), orderId: z.string().min(3).max(64) }),
]);

/**
 * POST /api/billing/paypal/gas — Pay-As-You-Go gas, bought as a one-time PayPal order.
 *   create: the server makes the order for `blocks` x $100 with this account's id on it; the browser gets the id to approve.
 *   capture: after approval, the server captures the order, checks it is this account's, completed, in US dollars and for
 *            a whole number of blocks, and credits the gas once (a second capture of the same order credits nothing).
 * Bought gas never expires, is spent after the month's allowance, and carries the Professional capabilities while it lasts.
 */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!paypalConfigured()) return fail(503, 'Checkout is being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  if (b.data.op === 'create') {
    const blocks = b.data.blocks;
    const order = await createOrder(PAYG.usd * blocks, user.id, `Ricorsa Pay-As-You-Go gas: ${gasWord(PAYG.gas * blocks)}`);
    return json({ orderId: order.id, usd: PAYG.usd * blocks, gas: PAYG.gas * blocks });
  }
  const order = await captureOrder(b.data.orderId);
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find(c => c.status === 'COMPLETED') || unit?.payments?.captures?.[0];
  if (unit?.custom_id && unit.custom_id !== user.id) return fail(403, 'That payment belongs to another account', 'forbidden');
  if (!capture || capture.status !== 'COMPLETED') return fail(409, capture?.status === 'PENDING' ? 'PayPal is still confirming the payment. Your gas is credited as soon as it clears.' : 'The payment did not complete. Nothing was charged.', 'payment_incomplete');
  const amount = capture.amount || unit?.amount;
  const usd = Number(amount?.value);
  if (!amount || amount.currency_code !== 'USD' || !Number.isFinite(usd) || usd < PAYG.usd || Math.abs(usd / PAYG.usd - Math.round(usd / PAYG.usd)) > 1e-6) return fail(409, 'The payment amount did not match a gas purchase. Contact support and we will put it right.', 'amount_mismatch');
  const blocks = Math.round(usd / PAYG.usd);
  const credited = await creditGas(user.id, order.id, Math.round(usd * 100), PAYG.gas * blocks);
  const st = await gasState({ ...user, gasBalance: credited ?? user.gasBalance });
  return json({ ok: true, credited: credited !== null, gas: PAYG.gas * blocks, usd, balance: st.balance, remaining: st.unlimited ? null : st.remaining });
});
