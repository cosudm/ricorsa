import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Schema for Cloudflare D1 (SQLite). JSON documents live in `text` columns with json mode and
 * timestamps are integer milliseconds, so every row round-trips as plain objects and Dates.
 */
const now = () => new Date();
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const tsNow = (name: string) => ts(name).notNull().default(sql`(strftime('%s','now') * 1000)`).$defaultFn(now);

/** One row per signed-in person. `id` is the Auth0 subject (`sub`). */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  picture: text('picture'),
  plan: text('plan').notNull().default('free'), // free | pro | team
  paypalSubscriptionId: text('paypal_subscription_id'),
  subscriptionStatus: text('subscription_status'), // ACTIVE | SUSPENDED | CANCELLED | EXPIRED | APPROVAL_PENDING
  planRenewsAt: ts('plan_renews_at'),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})).default(sql`'{}'`),
  createdAt: tsNow('created_at'),
  lastSeenAt: tsNow('last_seen_at'),
});

/** PayPal subscriptions we have seen, keyed by PayPal's subscription id (I-XXXX). */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull(), // pro | team
  paypalPlanId: text('paypal_plan_id').notNull(),
  status: text('status').notNull(),
  startedAt: ts('started_at'),
  nextBillingAt: ts('next_billing_at'),
  cancelledAt: ts('cancelled_at'),
  raw: text('raw', { mode: 'json' }).$type<Record<string, unknown>>(),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('subscriptions_user_idx').on(t.userId)]);

export type Turn = {
  id: string;
  q: string;
  mode: 'search' | 'research';
  tier: 'quick' | 'default' | 'complex';
  focus: 'web' | 'academic' | 'writing' | 'math' | 'code';
  length: 'concise' | 'balanced' | 'detailed' | null;
  createdAt: number;
  status: 'pending' | 'running' | 'done' | 'stopped' | 'error';
  sources: { n: number; title: string; domain: string; url: string; snippet?: string }[];
  answer: string;
  related: string[];
  learned: Record<string, unknown> | null;
  learnedMerged: boolean;
  truncated: boolean;
  tierApplied: string | null;
  error: string | null;
  vote?: 'up' | 'down' | null;
  model?: string;
  usage?: { in: number; out: number; cacheRead?: number; searches?: number };
  /** Provenance hash for this turn: chained from the thread's origin and the previous turn. */
  lineage?: string;
};

/** Where a thread came from. Discover-born threads carry the idea's hash id and the graph fingerprint it was drawn from. */
export type ThreadOrigin = { kind: 'discover' | 'ask'; ideaId?: string; graphHash?: string; category?: string; title?: string; at: number; subject?: string };

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  spaceId: text('space_id'),
  title: text('title').notNull(),
  turns: text('turns', { mode: 'json' }).$type<Turn[]>().notNull().$defaultFn(() => []).default(sql`'[]'`),
  origin: text('origin', { mode: 'json' }).$type<ThreadOrigin>(),
  turnCount: integer('turn_count').notNull().default(0),
  snippet: text('snippet').notNull().default(''),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('threads_user_updated_idx').on(t.userId, t.updatedAt)]);

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull().default('🗂️'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  createdAt: tsNow('created_at'),
}, (t) => [index('spaces_user_idx').on(t.userId)]);

/** Optional geographic anchor for a node: GeoJSON-style point, line or polygon (WGS84 lon/lat). */
export type GeoAnchor = { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] } | { type: 'Polygon'; coordinates: [number, number][][] };
/** Where a node first entered the graph: the turn that produced it and, when that thread was born in Discover, the idea it traces to. */
export type NodeOrigin = { threadId: string; turnId: string; ideaId?: string; lineage?: string };
export type GraphNode = { id: string; type: string; label: string; weight: number; count: number; firstSeen: number; lastSeen: number; level?: string; geo?: GeoAnchor; origin?: NodeOrigin };
export type GraphEdge = { a: string; b: string; weight: number; lastSeen: number };
export type GraphIntent = { text: string; at: number; threadId: string; turnId: string };
export type GraphData = {
  v: number;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  intents: GraphIntent[];
  events: number;
  paused: boolean;
  votes: { up: number; down: number };
  updatedAt: number;
};

/** The identity graph: one document per person, same shape the client renders. */
export const graphs = sqliteTable('graphs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  data: text('data', { mode: 'json' }).$type<GraphData>().notNull(),
  updatedAt: tsNow('updated_at'),
});

/** Metered usage. `period` is `d:YYYY-MM-DD` for daily caps and `m:YYYY-MM` for monthly quotas. */
export const usage = sqliteTable('usage', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  questions: integer('questions').notNull().default(0),
  research: integer('research').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  searches: integer('searches').notNull().default(0),
  costMicros: integer('cost_micros').notNull().default(0), // estimated cost in millionths of a dollar
}, (t) => [primaryKey({ columns: [t.userId, t.period] })]);

/** Discover picks are generated once per category per day (per person when drawn from their graph). */
export const discoverCache = sqliteTable('discover_cache', {
  category: text('category').notNull(),
  day: text('day').notNull(),
  items: text('items', { mode: 'json' }).$type<Array<Record<string, unknown>>>().notNull(),
  createdAt: tsNow('created_at'),
}, (t) => [primaryKey({ columns: [t.category, t.day] })]);

/** Webhook receipts, so a redelivered PayPal event is applied once. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: tsNow('received_at'),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/** Small key/value store for things the app provisions for itself (PayPal product, plan and webhook ids). */
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: tsNow('updated_at'),
});

/** Apps and tools built from a Discover idea: a single self-contained HTML document, streamed in as it is written. */
export type BuildStatus = 'building' | 'done' | 'error';
export const builds = sqliteTable('builds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  ideaId: text('idea_id'),
  graphHash: text('graph_hash'),
  category: text('category'),
  kind: text('kind').notNull().default('App'),
  title: text('title').notNull(),
  spec: text('spec').notNull(),
  changes: text('changes'),
  status: text('status').$type<BuildStatus>().notNull().default('building'),
  plan: text('plan').notNull().default(''),
  html: text('html').notNull().default(''),
  summary: text('summary').notNull().default(''),
  error: text('error'),
  lineage: text('lineage'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('builds_user_idx').on(t.userId, t.updatedAt)]);
