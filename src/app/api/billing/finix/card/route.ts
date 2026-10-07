import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { finixConfigured, customerMessageFor, isFinixError } from '@/lib/finix';
import { saveCard } from '@/lib/recharge';

export const dynamic = 'force-dynamic';
const Body = z.object({ token: z.string().min(4).max(80) });

/** POST /api/billing/finix/card — replace the card on file with the card behind a Finix.js token (no charge is made). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!finixConfigured()) return fail(503, 'Card payments are being set up. Please check back in a moment.', 'checkout_unavailable');
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request', 'invalid_request');
  try {
    const instrument = await saveCard(user, b.data.token);
    console.log('[recharge] card updated', JSON.stringify({ user: user.id, brand: instrument.brand || null }));
    return json({ ok: true, card: { brand: instrument.brand || null, lastFour: instrument.last_four || null } });
  } catch (e) {
    if (isFinixError(e)) return fail(402, customerMessageFor(e), 'card_declined');
    throw e;
  }
});
