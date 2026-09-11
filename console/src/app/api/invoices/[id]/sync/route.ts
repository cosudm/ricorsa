import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { invoiceView } from '@/lib/views';
import { syncFromPaypal } from '@/lib/invoice-ops';
import { paypalConfigured } from '@/lib/paypal';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/invoices/:id/sync — refresh the invoice from PayPal (status, amount paid). */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await currentStaff('manager');
  const { id } = await ctx.params;
  const d = db();
  const row = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such invoice', 'not_found');
  if (!row.paypalInvoiceId) return fail(409, 'This invoice was not sent through PayPal', 'no_paypal');
  if (!paypalConfigured()) return fail(503, 'PayPal is not configured on the console', 'paypal_unconfigured');
  const r = await syncFromPaypal(row, me);
  const after = (await d.select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0];
  return json({ invoice: invoiceView(after), changed: r.changed });
});
