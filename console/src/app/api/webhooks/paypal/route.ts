import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { verifyWebhookSignature } from '@/lib/paypal';
import { syncFromPaypal } from '@/lib/invoice-ops';

export const dynamic = 'force-dynamic';

/** PayPal calls this when an invoice is paid, cancelled or refunded. Each event is verified with PayPal and applied once. */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: { id?: string; event_type?: string; resource?: { invoice?: { id?: string }; id?: string } } = {};
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const pp = await getSetting('paypal');
  if (!pp.webhookId) return new Response('webhook not registered', { status: 202 });
  try { if (!(await verifyWebhookSignature(req.headers, raw, pp.webhookId))) return new Response('bad signature', { status: 400 }); }
  catch (e) { console.warn('[webhook] verification failed', String((e as Error)?.message || e)); return new Response('verification failed', { status: 400 }); }
  const d = db();
  if (event.id) {
    const seen = (await d.select({ id: schema.webhookEvents.id }).from(schema.webhookEvents).where(eq(schema.webhookEvents.id, event.id)).limit(1))[0];
    if (seen) return new Response('ok', { status: 200 });
    await d.insert(schema.webhookEvents).values({ id: event.id, eventType: event.event_type || '', payload: event as Record<string, unknown> }).onConflictDoNothing();
  }
  const ppId = event.resource?.invoice?.id || event.resource?.id;
  if (ppId && String(event.event_type || '').startsWith('INVOICING.')) {
    const row = (await d.select().from(schema.invoices).where(eq(schema.invoices.paypalInvoiceId, ppId)).limit(1))[0];
    if (row) { try { await syncFromPaypal(row, null); } catch (e) { console.warn('[webhook] sync failed', String((e as Error)?.message || e)); } }
  }
  return new Response('ok', { status: 200 });
}
