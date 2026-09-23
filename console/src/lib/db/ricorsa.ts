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
  paypalSubscriptionId: text('paypal_subscription_id'),
  subscriptionStatus: text('subscription_status'),
  planRenewsAt: ts('plan_renews_at'),
  /** How the current subscription bills: monthly or annual; null for the free state and for grants that did not say. */
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>(),
  /** Monthly allowances the console set above the plan's own (only the keys given override); null means the plan's numbers. */
  allowance: text('allowance', { mode: 'json' }).$type<RAllowance | null>(),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: ts('created_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull(),
});
export type RAllowance = { buildsPerMonth?: number; ideaSetsPerMonth?: number; questionsPerMonth?: number; questionsPerDay?: number; researchPerMonth?: number; note?: string; setBy?: string; setAt?: number };

export const rSubscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  planKey: text('plan_key').notNull(),
  paypalPlanId: text('paypal_plan_id').notNull(),
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
}, (t) => [primaryKey({ columns: [t.userId, t.period] })]);

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
