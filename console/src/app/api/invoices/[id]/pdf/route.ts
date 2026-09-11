import { eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { renderInvoicePdf } from '@/lib/invoice-ops';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/invoices/:id/pdf — the invoice as a PDF, inline (add ?download=1 to save it). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  await currentStaff();
  const { id } = await ctx.params;
  const row = (await db().select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!row) return fail(404, 'No such invoice', 'not_found');
  const pdf = await renderInvoicePdf(row);
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(pdf as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${row.number}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'SAMEORIGIN' } });
});
