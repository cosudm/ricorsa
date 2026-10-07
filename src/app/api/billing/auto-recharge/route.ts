import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { RECHARGE } from '@/lib/plans';
import { autoRechargeState, setAutoRecharge, recordAgreement } from '@/lib/recharge';

export const dynamic = 'force-dynamic';
const Body = z.object({ on: z.boolean().optional(), thresholdGas: z.number().int().min(50).max(100000).optional(), usd: z.number().int().min(RECHARGE.minUsd).max(RECHARGE.maxUsd).optional(), agree: z.boolean().optional() });

/** GET /api/billing/auto-recharge — where auto-recharge stands for this account: on or off, threshold, amount, failures, the card on file. */
export const GET = handle(async () => {
  const user = await currentUser();
  return json(autoRechargeState(user));
});

/**
 * PUT /api/billing/auto-recharge — change it from the Account page. Turning it on needs a card on file and the
 * Recharge Agreement (sent as `agree: true` when the person has not agreed before).
 */
export const PUT = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  if (b.data.on) {
    if (!user.finixInstrumentId) return fail(400, 'Add a card first: make a recharge, or add a card on the Account page.', 'card_required');
    if (!user.rechargeAgreedAt && !b.data.agree) return fail(400, 'Please agree to the Recharge Agreement to turn auto-recharge on.', 'agreement_required');
    if (b.data.agree) await recordAgreement(user.id);
  }
  await setAutoRecharge(user.id, { on: b.data.on, thresholdGas: b.data.thresholdGas, usd: b.data.usd });
  const fresh = { ...user, autoRecharge: b.data.on ?? user.autoRecharge, autoRechargeThreshold: b.data.thresholdGas ?? user.autoRechargeThreshold, autoRechargeUsd: b.data.usd ?? user.autoRechargeUsd, autoRechargeFailures: b.data.on ? 0 : user.autoRechargeFailures, rechargeAgreedAt: b.data.agree ? new Date() : user.rechargeAgreedAt };
  console.log('[recharge] auto settings', JSON.stringify({ user: user.id, ...b.data }));
  return json({ ok: true, ...autoRechargeState(fresh) });
});
