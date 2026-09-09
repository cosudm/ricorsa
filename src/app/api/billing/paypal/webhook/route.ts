import { eq } from 'drizzle-orm';
import { verifyWebhookSignature, getSubscription } from '@/lib/paypal';
import { applySubscription } from '@/lib/billing';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * PayPal webhook receiver. Every delivery is signature-verified with PayPal, applied once
 * (receipts table), and always answered 200 so PayPal stops retrying once we have it.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let ok = false;
  try { ok = await verifyWebhookSignature(req.headers, raw); } catch (e) { console.error('webhook verify error', e); return new Response('verify failed', { status: 500 }); }
  if (!ok) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(raw) as { id: string; event_type: string; resource?: Record<string, unknown> };

  const d = db();
  const seen = await d.insert(schema.webhookEvents).values({ id: event.id, eventType: event.event_type, payload: event as unknown as Record<string, unknown> }).onConflictDoNothing().returning({ id: schema.webhookEvents.id });
  if (!seen.length) return new Response('duplicate', { status: 200 });

  try {
    const type = event.event_type;
    const resource = event.resource || {};
    if (type.startsWith('BILLING.SUBSCRIPTION.')) {
      // The resource is the subscription itself; re-fetch so we act on PayPal's current view, not a stale event
      const id = String(resource.id || '');
      if (id) await applySubscription(await getSubscription(id));
    } else if (type === 'PAYMENT.SALE.COMPLETED') {
      const subId = String(resource.billing_agreement_id || '');
      if (subId) await applySubscription(await getSubscription(subId));
    }
  } catch (e) {
    console.error('webhook apply failed', event.event_type, e);
    // Undo the receipt so PayPal's retry can be applied later
    await d.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, event.id));
    return new Response('apply failed', { status: 500 });
  }
  return new Response('ok', { status: 200 });
}
