import { eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';

export type CompanyProfile = { name: string; legalName?: string; email?: string; phone?: string; website?: string; taxId?: string; address?: { line1?: string; line2?: string; city?: string; region?: string; postal?: string; country?: string } };
export type InvoiceSettings = { prefix: string; nextNumber: number; dueDays: number; taxRate: number; currency: string; terms: string; footer: string };
export type EmailSettings = { from: string; replyTo?: string; signature: string };
export type TrialSettings = { days: number; plan: 'pro' | 'team' };

export const DEFAULTS = {
  company: { name: 'SMEPro Technologies', email: 'support@smeprotech.com', website: 'https://ricorsa.com' } as CompanyProfile,
  invoice: { prefix: 'RIC-', nextNumber: 1001, dueDays: 14, taxRate: 0, currency: 'USD', terms: 'Payment is due within 14 days of the invoice date.', footer: 'Thank you for choosing Ricorsa.' } as InvoiceSettings,
  email: { from: process.env.RESEND_FROM || 'Ricorsa <hello@ricorsa.com>', signature: 'The Ricorsa team\nhttps://ricorsa.com' } as EmailSettings,
  trial: { days: 14, plan: 'pro' } as TrialSettings,
  /** Filled in by the console itself: the PayPal webhook it registered for invoice events. */
  paypal: { webhookId: '' } as { webhookId: string },
};
export type SettingsKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingsKey>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = (await db().select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1))[0];
  return { ...DEFAULTS[key], ...((row?.value as object) || {}) } as (typeof DEFAULTS)[K];
}
export async function getSettings(): Promise<typeof DEFAULTS> {
  const rows = await db().select().from(schema.settings).where(inArray(schema.settings.key, Object.keys(DEFAULTS)));
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of Object.keys(DEFAULTS)) { const row = rows.find(r => r.key === k); out[k] = { ...(DEFAULTS as Record<string, object>)[k], ...((row?.value as object) || {}) }; }
  return out as typeof DEFAULTS;
}
export async function setSetting<K extends SettingsKey>(key: K, value: Partial<(typeof DEFAULTS)[K]>): Promise<(typeof DEFAULTS)[K]> {
  const merged = { ...(await getSetting(key)), ...value };
  await db().insert(schema.settings).values({ key, value: merged, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.settings.key, set: { value: merged, updatedAt: new Date() } });
  return merged;
}

/** Take the next invoice number (prefix + zero-padded counter), advancing the counter. */
export async function nextInvoiceNumber(): Promise<string> {
  const inv = await getSetting('invoice');
  const n = inv.nextNumber;
  await setSetting('invoice', { nextNumber: n + 1 });
  return `${inv.prefix}${String(n).padStart(4, '0')}`;
}
