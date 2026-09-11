import { z } from 'zod';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson } from '@/lib/http';
import { parse, zAddress, zText, zOptText } from '@/lib/validate';
import { getSettings, setSetting } from '@/lib/settings';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  company: z.object({ name: zText(200).min(1), legalName: zOptText(200), email: zOptText(200), phone: zOptText(60), website: zOptText(200), taxId: zOptText(80), address: zAddress.optional() }).partial().optional(),
  invoice: z.object({ prefix: zText(12), nextNumber: z.number().int().min(1).max(1e9), dueDays: z.number().int().min(0).max(365), taxRate: z.number().min(0).max(100), currency: zText(3), terms: zText(5000), footer: zText(500) }).partial().optional(),
  email: z.object({ from: zText(200), replyTo: zOptText(200), signature: zText(2000) }).partial().optional(),
  trial: z.object({ days: z.number().int().min(1).max(365), plan: z.enum(['pro', 'team']) }).partial().optional(),
});

export const GET = handle(async () => { await currentStaff(); return json({ settings: await getSettings() }); });

export const PATCH = handle(async (req: Request) => {
  const me = await currentStaff('owner');
  const b = parse(Patch, await readJson(req));
  for (const key of ['company', 'invoice', 'email', 'trial'] as const) {
    const v = b[key]; if (!v) continue;
    const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, x === null ? '' : x]));
    if (key === 'invoice' && typeof clean.currency === 'string') clean.currency = clean.currency.toUpperCase();
    await setSetting(key, clean as never);
  }
  await logActivity(me, 'settings.update', 'settings', null, `Updated ${Object.keys(b).join(', ')} settings`);
  return json({ settings: await getSettings() });
});
