import { z } from 'zod';
import { zId, zOptEmail, zOptText, zText, zOptMs, zMs, zInvoiceItem, zAddress } from './validate';

export const ContactInput = z.object({ customerId: zId, name: zText(200).min(1), email: zOptEmail, phone: zOptText(60), title: zOptText(120), primary: z.boolean().optional(), notes: zText(5000).optional() });

export const LicenseInput = z.object({
  customerId: zId, plan: z.enum(['pro', 'team']), seats: z.number().int().min(1).max(10000).optional(), startsAt: zOptMs, endsAt: zOptMs, autoRenew: z.boolean().optional(), notes: zText(5000).optional(),
  /** Also set the plan on the linked Ricorsa account (default true). */
  apply: z.boolean().optional(),
});
export const LicensePatch = z.object({
  plan: z.enum(['pro', 'team']).optional(), seats: z.number().int().min(1).max(10000).optional(), startsAt: zMs.optional(), endsAt: zOptMs, autoRenew: z.boolean().optional(), notes: zText(5000).optional(),
  action: z.enum(['suspend', 'revoke', 'reactivate', 'renew']).optional(), months: z.number().int().min(1).max(60).optional(), apply: z.boolean().optional(),
});

export const TrialInput = z.object({ customerId: zId, plan: z.enum(['pro', 'team']).optional(), days: z.number().int().min(1).max(365).optional(), endsAt: zMs.optional(), notes: zText(5000).optional(), apply: z.boolean().optional() });
export const TrialPatch = z.object({ action: z.enum(['extend', 'convert', 'cancel', 'expire']).optional(), days: z.number().int().min(1).max(365).optional(), plan: z.enum(['pro', 'team']).optional(), notes: zText(5000).optional(), apply: z.boolean().optional() });

export const CommInput = z.object({
  customerId: zId, contactId: zOptText(60), kind: z.enum(['email', 'call', 'meeting', 'note', 'sms']).optional(), direction: z.enum(['in', 'out']).optional(),
  subject: zText(300).optional(), body: zText(50000).optional(), toEmail: zOptEmail, at: zMs.optional(),
  /** For kind 'email': actually send it through the email service (default false: log only). */
  send: z.boolean().optional(),
});

export const InvoiceInput = z.object({
  customerId: zId, currency: zText(3).optional(), items: z.array(zInvoiceItem).min(1).max(200), issuedAt: zMs.optional(), dueAt: zOptMs, notes: zText(5000).optional(), terms: zText(5000).optional(),
  billTo: z.object({ name: zOptText(200), company: zOptText(200), email: zOptEmail, address: zAddress.optional() }).optional(),
});
export const InvoicePatch = InvoiceInput.omit({ customerId: true }).partial().extend({ status: z.enum(['void']).optional(), voidReason: zText(500).optional() });
export const InvoiceSend = z.object({ via: z.enum(['paypal', 'email', 'both']).optional(), to: zOptEmail, message: zText(5000).optional() });
export const PaymentInput = z.object({ amountCents: z.number().int().min(1).max(1e11), method: z.enum(['paypal', 'bank', 'card', 'cash', 'check', 'other']).optional(), reference: zOptText(200), receivedAt: zMs.optional(), notes: zText(2000).optional(), syncPaypal: z.boolean().optional() });

export const StaffInvite = z.object({ email: z.string().trim().toLowerCase().email().max(200), name: zOptText(200), role: z.enum(['owner', 'manager', 'viewer']).optional(), sendEmail: z.boolean().optional() });
export const StaffPatch = z.object({ role: z.enum(['owner', 'manager', 'viewer']).optional(), status: z.enum(['active', 'disabled', 'invited']).optional(), name: zOptText(200) });

export const PlanGrant = z.object({ plan: z.enum(['free', 'pro', 'team']), kind: z.enum(['license', 'trial', 'clear']).optional(), until: zOptMs });
