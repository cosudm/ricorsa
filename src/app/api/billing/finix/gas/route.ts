import { handle, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/finix/gas — the Pay-As-You-Go endpoint from before the prepaid model (October 7, 2026), kept so a
 * page left open from then gets a plain answer instead of a 404. Gas is bought on the Recharge page now, through
 * /api/billing/finix/recharge; nothing is charged here.
 */
export const POST = handle(async () => fail(410, 'Gas is bought on the Recharge page now. Nothing was charged; open ricorsa.com/pricing to recharge.', 'moved'));
