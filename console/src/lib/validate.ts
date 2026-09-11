import { z } from 'zod';
import { HttpError } from './http';

/** Parse a request body against a schema; a mismatch is a 400 that names the first problem. */
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, `${issue?.path?.length ? issue.path.join('.') + ': ' : ''}${issue?.message || 'Invalid request'}`, 'invalid_request');
  }
  return r.data;
}

export const zId = z.string().min(1).max(60);
export const zEmail = z.string().trim().toLowerCase().email().max(200);
export const zOptEmail = z.union([zEmail, z.literal(''), z.null()]).optional().transform(v => (v ? v : null));
export const zText = (max: number) => z.string().trim().max(max);
export const zOptText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional().transform(v => (v === undefined ? undefined : v ? v : null));
export const zMs = z.number().int().min(0).max(4102444800000); // epoch ms, until 2100
export const zOptMs = z.union([zMs, z.null()]).optional();
export const zCents = z.number().int().min(0).max(1e11);
export const zAddress = z.object({ line1: zText(200).optional(), line2: zText(200).optional(), city: zText(120).optional(), region: zText(120).optional(), postal: zText(40).optional(), country: zText(60).optional() }).partial();
export const zTags = z.array(zText(40)).max(30);
export const zPlan = z.enum(['free', 'pro', 'team', 'custom']);
export const zCustomerStatus = z.enum(['lead', 'trial', 'active', 'past_due', 'churned']);
export const zInvoiceItem = z.object({ description: zText(400).min(1), qty: z.number().min(0).max(1e6), unitCents: z.number().int().min(-1e9).max(1e9), taxRate: z.number().min(0).max(100).optional() });
