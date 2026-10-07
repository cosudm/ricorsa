import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * The parts of the product database (Ricorsa, binding RICORSA) the console reads, and the one table it writes:
 * `users`, to grant a plan, a trial or a license, or to raise an allowance. The definitions mirror ricorsa/src/lib/db/schema.ts; keep them in step.
 */
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const rUsers = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  picture: text('picture'),
  plan: text('plan').notNull().default('free'),
  /** The current subscription's id, PayPal's or the card processor's. */
  paypalSubscriptionId: text('paypal_subscription_id'),
  /** Who bills it: 'paypal' or 'finix' (card); null before October 2026 means PayPal. */
  subscriptionProvider: text('subscription_provider').$type<'paypal' | 'finix'>(),
  subscriptionStatus: text('subscription_status'),
  planRenewsAt: ts('plan_renews_at'),
  /** How the current subscription bills: monthly or annual; null for the free state and for grants that did not say. */
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>(),
  /** A monthly gas allowance the console set above the plan's own; null means the plan's number. */
  allowance: text('allowance', { mode: 'json' }).$type<RAllowance | null>(),
  /** Gas bought (or granted at signup) and not yet spent; it never expires and is used after any monthly allowance. */
  gasBalance: integer('gas_balance').notNull().default(0),
  // The card on file and the auto-recharge settings (welcome_gas_at, finix_instrument_id, card_*, auto_recharge_*, recharge_agree*) are
  // the product's alone; the console does not read them, so they are left out of this mirror on purpose.
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: ts('created_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull(),
});
export type RAllowance = { gasPerMonth?: number; note?: string; setBy?: string; setAt?: number };

export const rSubscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  planKey: text('plan_key').notNull(),
  paypalPlanId: text('paypal_plan_id').notNull(),
  provider: text('provider').$type<'paypal' | 'finix'>().notNull().default('paypal'),
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>(),
  status: text('status').notNull(),
  startedAt: ts('started_at'),
  nextBillingAt: ts('next_billing_at'),
  cancelledAt: ts('cancelled_at'),
  updatedAt: ts('updated_at').notNull(),
});

export const rUsage = sqliteTable('usage', {
  userId: text('user_id').notNull(),
  period: text('period').notNull(),
  questions: integer('questions').notNull().default(0),
  research: integer('research').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  searches: integer('searches').notNull().default(0),
  costMicros: integer('cost_micros').notNull().default(0),
  builds: integer('builds').notNull().default(0),
  ideas: integer('ideas').notNull().default(0),
  browserActions: integer('browser_actions').notNull().default(0),
  /** Gas spent in the period: the one figure the plan's allowance is measured against. */
  gas: integer('gas').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.period] })]);

/** Gas credits, one row each: a recharge (a captured PayPal order or a succeeded card payment), an automatic recharge, or the welcome gas. */
export const rGasPurchases = sqliteTable('gas_purchases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** PayPal's order id, `finix:<transfer id>` for a card payment, or `welcome:<user id>` for the signup grant. */
  orderId: text('order_id').notNull(),
  provider: text('provider').$type<'paypal' | 'finix' | 'ricorsa'>().notNull().default('paypal'),
  /** What kind of credit: a recharge the person made, an automatic one, or the welcome gas. */
  kind: text('kind').$type<'recharge' | 'auto' | 'welcome'>().notNull().default('recharge'),
  /** The Recharge Agreement version in force when it was bought; null for the welcome gas. */
  agreementVersion: text('agreement_version'),
  usdCents: integer('usd_cents').notNull(),
  gas: integer('gas').notNull(),
  status: text('status').notNull().default('completed'),
  createdAt: ts('created_at').notNull(),
});

export const rThreads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  turnCount: integer('turn_count').notNull().default(0),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const rBuilds = sqliteTable('builds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
});

export const rSpaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
});
