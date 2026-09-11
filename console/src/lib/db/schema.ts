import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * The console's own database (Cloudflare D1, SQLite). Money is kept in integer cents, timestamps are
 * integer milliseconds, and JSON documents live in `text` columns with json mode.
 */
const now = () => new Date();
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const tsNow = (name: string) => ts(name).notNull().default(sql`(strftime('%s','now') * 1000)`).$defaultFn(now);
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export type StaffRole = 'owner' | 'manager' | 'viewer';
export type StaffStatus = 'invited' | 'active' | 'disabled' | 'requested';

/** People who may use the console. A row is created by an invitation, by an owner's first sign-in, or by an access request. */
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  picture: text('picture'),
  role: text('role').$type<StaffRole>().notNull().default('viewer'),
  status: text('status').$type<StaffStatus>().notNull().default('invited'),
  auth0Sub: text('auth0_sub'),
  invitedBy: text('invited_by'),
  invitedAt: ts('invited_at'),
  acceptedAt: ts('accepted_at'),
  lastSeenAt: ts('last_seen_at'),
  prefs: json<Record<string, unknown>>('prefs').notNull().$defaultFn(() => ({})).default(sql`'{}'`),
  createdAt: tsNow('created_at'),
}, (t) => [uniqueIndex('staff_email_idx').on(t.email)]);

export type CustomerStatus = 'lead' | 'trial' | 'active' | 'past_due' | 'churned';
export type Address = { line1?: string; line2?: string; city?: string; region?: string; postal?: string; country?: string };

/** A customer record: a person or a company that buys, trials or may buy Ricorsa. Linked to a Ricorsa account when one exists. */
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'person' | 'company'>().notNull().default('company'),
  name: text('name').notNull(),
  company: text('company'),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  address: json<Address>('address'),
  status: text('status').$type<CustomerStatus>().notNull().default('lead'),
  plan: text('plan').notNull().default('free'),          // free | pro | team | custom
  mrrCents: integer('mrr_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  source: text('source'),
  ownerId: text('owner_id'),                              // staff id
  tags: json<string[]>('tags').notNull().$defaultFn(() => []).default(sql`'[]'`),
  notes: text('notes').notNull().default(''),
  ricorsaUserId: text('ricorsa_user_id'),                 // users.id in the product database (Auth0 sub)
  custom: json<Record<string, unknown>>('custom').notNull().$defaultFn(() => ({})).default(sql`'{}'`),
  lastContactAt: ts('last_contact_at'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('customers_status_idx').on(t.status), index('customers_email_idx').on(t.email), index('customers_ricorsa_idx').on(t.ricorsaUserId), index('customers_updated_idx').on(t.updatedAt)]);

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  title: text('title'),
  primary: integer('primary', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes').notNull().default(''),
  createdAt: tsNow('created_at'),
}, (t) => [index('contacts_customer_idx').on(t.customerId)]);

export type LicenseStatus = 'active' | 'suspended' | 'expired' | 'revoked';

/** A licence grants a plan to a customer for a period. Applying it sets the plan on the linked Ricorsa account. */
export const licenses = sqliteTable('licenses', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  product: text('product').notNull().default('ricorsa'),
  plan: text('plan').notNull().default('pro'),
  seats: integer('seats').notNull().default(1),
  status: text('status').$type<LicenseStatus>().notNull().default('active'),
  startsAt: tsNow('starts_at'),
  endsAt: ts('ends_at'),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes').notNull().default(''),
  createdBy: text('created_by'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [uniqueIndex('licenses_key_idx').on(t.key), index('licenses_customer_idx').on(t.customerId), index('licenses_status_idx').on(t.status)]);

export type TrialStatus = 'active' | 'converted' | 'expired' | 'cancelled';

export const trials = sqliteTable('trials', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull().default('pro'),
  status: text('status').$type<TrialStatus>().notNull().default('active'),
  startedAt: tsNow('started_at'),
  endsAt: ts('ends_at').notNull(),
  convertedAt: ts('converted_at'),
  notes: text('notes').notNull().default(''),
  createdBy: text('created_by'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('trials_customer_idx').on(t.customerId), index('trials_status_idx').on(t.status), index('trials_ends_idx').on(t.endsAt)]);

export type CommKind = 'email' | 'call' | 'meeting' | 'note' | 'sms';
export type CommStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'logged';

/** Everything said to or about a customer: emails the console sent, calls and meetings logged, internal notes. */
export const communications = sqliteTable('communications', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  contactId: text('contact_id'),
  kind: text('kind').$type<CommKind>().notNull().default('note'),
  direction: text('direction').$type<'in' | 'out'>().notNull().default('out'),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull().default(''),
  toEmail: text('to_email'),
  status: text('status').$type<CommStatus>().notNull().default('logged'),
  provider: text('provider'),
  providerId: text('provider_id'),
  error: text('error'),
  invoiceId: text('invoice_id'),
  byStaffId: text('by_staff_id'),
  at: tsNow('at'),
  createdAt: tsNow('created_at'),
}, (t) => [index('comms_customer_idx').on(t.customerId, t.at), index('comms_kind_idx').on(t.kind)]);

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type InvoiceItem = { description: string; qty: number; unitCents: number; taxRate?: number };

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  number: text('number').notNull(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  status: text('status').$type<InvoiceStatus>().notNull().default('draft'),
  currency: text('currency').notNull().default('USD'),
  items: json<InvoiceItem[]>('items').notNull().$defaultFn(() => []).default(sql`'[]'`),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  issuedAt: ts('issued_at'),
  dueAt: ts('due_at'),
  paidAt: ts('paid_at'),
  billTo: json<{ name?: string; company?: string; email?: string; address?: Address }>('bill_to'),
  notes: text('notes').notNull().default(''),
  terms: text('terms').notNull().default(''),
  paypalInvoiceId: text('paypal_invoice_id'),
  paypalStatus: text('paypal_status'),
  paypalLink: text('paypal_link'),
  sentTo: text('sent_to'),
  sentAt: ts('sent_at'),
  createdBy: text('created_by'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [uniqueIndex('invoices_number_idx').on(t.number), index('invoices_customer_idx').on(t.customerId), index('invoices_status_idx').on(t.status), index('invoices_due_idx').on(t.dueAt)]);

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  method: text('method').notNull().default('other'), // paypal | bank | card | cash | other
  reference: text('reference'),
  receivedAt: tsNow('received_at'),
  notes: text('notes').notNull().default(''),
  createdBy: text('created_by'),
  createdAt: tsNow('created_at'),
}, (t) => [index('payments_invoice_idx').on(t.invoiceId), index('payments_customer_idx').on(t.customerId)]);

/** Who did what, for the audit trail shown on records and in Settings. */
export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),          // customer.create, invoice.send, license.revoke, ...
  entityType: text('entity_type').notNull(), // customer | contact | license | trial | communication | invoice | payment | staff | settings | ricorsa
  entityId: text('entity_id'),
  customerId: text('customer_id'),
  summary: text('summary').notNull(),
  data: json<Record<string, unknown>>('data'),
  at: tsNow('at'),
}, (t) => [index('activity_at_idx').on(t.at), index('activity_customer_idx').on(t.customerId, t.at), index('activity_entity_idx').on(t.entityType, t.entityId)]);

/** Console-wide settings as a small key/value document store (company details for invoices, numbering, defaults). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: json<unknown>('value').notNull(),
  updatedAt: tsNow('updated_at'),
});

/** Saved grid views (filters, sort, visible columns), per person or shared. */
export const views = sqliteTable('views', {
  id: text('id').primaryKey(),
  staffId: text('staff_id'),
  entity: text('entity').notNull(),
  name: text('name').notNull(),
  shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
  config: json<Record<string, unknown>>('config').notNull(),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('views_entity_idx').on(t.entity)]);

/** Webhook receipts, so a redelivered PayPal event is applied once. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: tsNow('received_at'),
  payload: json<Record<string, unknown>>('payload'),
});
