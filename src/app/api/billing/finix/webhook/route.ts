import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { finixProvisioned, finixWebhookSecrets } from '@/lib/finix-setup';
import { verifyWebhookSignature, getSubscription, getTransfer, finixConfigured } from '@/lib/finix';
import { applyFinixSubscription } from '@/lib/billing';
import { creditGas } from '@/lib/usage';
import { PAYG, RECHARGE, gasForUsd } from '@/lib/plans';

export const dynamic = 'force-dynamic';

type FinixEvent = { id?: string; type?: string; entity?: string; occurred_at?: string; _embedded?: Record<string, Array<{ id?: string; state?: string; tags?: Record<string, string> | null }>> };

/**
 * Finix webhook receiver. Every delivery must carry the bearer token the app registered the webhook with and, when the
 * signing key is on record, a valid Finix-Signature (HMAC-SHA256 over `timestamp:body`, five-minute window). Each event
 * is applied once (receipts in webhook_events) and answered 200 so Finix stops retrying once we have it. A
 * subscription event re-reads the subscription so the account reflects Finix's current view; a gas transfer that
 * succeeded is credited (once per transfer, however many times it is reported).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!finixConfigured()) return new Response('not configured', { status: 503 });
  let ok = false;
  try {
    const cfg = await finixProvisioned();
    if (!cfg?.webhookId) return new Response('webhook not provisioned', { status: 503 });
    const { signingKey, bearer } = await finixWebhookSecrets(cfg);
    const auth = req.headers.get('authorization') || '';
    const bearerOk = bearer ? auth === `Bearer ${bearer}` : false;
    const sigOk = signingKey ? await verifyWebhookSignature(req.headers.get('finix-signature'), raw, signingKey) : false;
    // Both when both are known; a webhook adopted without its signing key is checked by the bearer token alone, and a
    // webhook that came back without a bearer (never ours) by the signature alone.
    ok = signingKey && bearer ? bearerOk && sigOk : signingKey ? sigOk : bearerOk;
  } catch (e) { console.error('[finix] webhook verify error', e); return new Response('verify failed', { status: 500 }); }
  if (!ok) return new Response('unauthorized', { status: 401 });

  let event: FinixEvent;
  try { event = JSON.parse(raw) as FinixEvent; } catch { return new Response('bad json', { status: 400 }); }
  const entity = String(event.entity || '').toLowerCase();
  const embedded = event._embedded || {};
  const items = (embedded[entity] || embedded[entity + 's'] || Object.values(embedded)[0] || []) as Array<{ id?: string; state?: string; tags?: Record<string, string> | null }>;
  const eventId = event.id ? `finix:${event.id}` : `finix:${entity}:${items.map(i => i.id).join(',')}:${event.occurred_at || ''}`;

  const d = db();
  const seen = await d.insert(schema.webhookEvents).values({ id: eventId.slice(0, 200), eventType: `finix.${entity}.${event.type || 'event'}`, payload: event as unknown as Record<string, unknown> }).onConflictDoNothing().returning({ id: schema.webhookEvents.id });
  if (!seen.length) return new Response('duplicate', { status: 200 });

  try {
    for (const item of items) {
      if (!item?.id) continue;
      if (entity === 'subscription') {
        // Re-fetch so we act on Finix's current state, not the event's snapshot.
        await applyFinixSubscription(await getSubscription(item.id));
      } else if (entity === 'transfer') {
        const tags = item.tags || {};
        if (tags.kind !== 'gas') continue;
        const transfer = await getTransfer(item.id);
        const t = transfer.tags || tags;
        if (String(transfer.state || '').toUpperCase() !== 'SUCCEEDED' || t.kind !== 'gas' || !t.ricorsa_user) continue;
        // The gas is on the transfer's tags (a recharge or an automatic one); older transfers carried $100 blocks.
        const blocks = Math.max(1, Math.min(10, Number(t.blocks) || 1));
        const usdCents = transfer.amount || (t.usd ? Number(t.usd) * 100 : PAYG.usd * 100 * blocks);
        const amount = Number(t.gas) || gasForUsd(Math.round(usdCents / 100));
        const kind = t.recharge === 'auto' ? 'auto' : 'recharge';
        const credited = await creditGas(t.ricorsa_user, `finix:${transfer.id}`, usdCents, amount, 'finix', kind, RECHARGE.agreementVersion);
        if (credited !== null) console.log('[finix] gas credited by webhook', JSON.stringify({ user: t.ricorsa_user, transfer: transfer.id, kind, gas: amount }));
      }
    }
  } catch (e) {
    console.error('[finix] webhook apply failed', entity, event.type, e);
    // Undo the receipt so Finix's retry can be applied later.
    await d.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, eventId.slice(0, 200)));
    return new Response('apply failed', { status: 500 });
  }
  return new Response('ok', { status: 200 });
}
