import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Schema for Cloudflare D1 (SQLite). JSON documents live in `text` columns with json mode and
 * timestamps are integer milliseconds, so every row round-trips as plain objects and Dates.
 */
const now = () => new Date();
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const tsNow = (name: string) => ts(name).notNull().default(sql`(strftime('%s','now') * 1000)`).$defaultFn(now);

/** Per-account allowances the console may set above the plan's, with who set them and why (operator information). */
/** A gas allowance the Manager Console set above the plan's own (an Enterprise contract, a pilot); the older per-kind keys are ignored. */
export type Allowance = { gasPerMonth?: number; note?: string; setBy?: string; setAt?: number };

/** One row per signed-in person. `id` is the Auth0 subject (`sub`). */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  picture: text('picture'),
  plan: text('plan').notNull().default('free'), // free | essentials | professional | enterprise (pro | team on rows from before September 2026)
  /** The current subscription's id at its provider (PayPal's I-XXXX, or Finix's subscription id since October 2026). */
  paypalSubscriptionId: text('paypal_subscription_id'),
  /** Which provider bills the current subscription: paypal (the default, and every row from before October 2026) or finix (cards). */
  subscriptionProvider: text('subscription_provider').$type<'paypal' | 'finix'>(),
  /** The buyer identity Finix holds for this person, reused for every card payment they make. */
  finixIdentityId: text('finix_identity_id'),
  subscriptionStatus: text('subscription_status'), // ACTIVE | SUSPENDED | CANCELLED | EXPIRED | APPROVAL_PENDING
  planRenewsAt: ts('plan_renews_at'),
  /** How the current subscription bills: monthly or annual (null for the free state and for console grants that did not say). */
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>(),
  /**
   * Monthly allowances set by hand from the Manager Console, above the plan's own (an annual account that bought
   * more app versions mid-year, a pilot). Only the keys given are overridden; null means the plan's numbers apply.
   */
  allowance: text('allowance', { mode: 'json' }).$type<Allowance | null>(),
  /** Pay-As-You-Go gas bought and not yet spent; it never expires and is burned after the plan's monthly allowance. */
  gasBalance: integer('gas_balance').notNull().default(0),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})).default(sql`'{}'`),
  createdAt: tsNow('created_at'),
  lastSeenAt: tsNow('last_seen_at'),
});

/** Gas bought outright (one PayPal order or one Finix card payment each), for the receipts on the Account page and the console. */
export const gasPurchases = sqliteTable('gas_purchases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** The payment's id at its provider (PayPal's order id, or `finix:` and the transfer id); one credit per payment however many times it is reported. */
  orderId: text('order_id').notNull().unique(),
  /** Who took the payment: paypal or finix. */
  provider: text('provider').$type<'paypal' | 'finix'>().notNull().default('paypal'),
  usdCents: integer('usd_cents').notNull(),
  gas: integer('gas').notNull(),
  status: text('status').notNull().default('completed'),
  createdAt: tsNow('created_at'),
}, (t) => [index('gas_purchases_user_idx').on(t.userId, t.createdAt)]);

/** Subscriptions we have seen, keyed by the provider's subscription id (PayPal's I-XXXX, or Finix's). */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull(), // essentials | professional | enterprise (pro | team on rows from before September 2026)
  /** The provider's plan id (PayPal's P-XXXX, Finix's subscription_plan_..., or `finix:direct` for a Finix subscription priced directly). */
  paypalPlanId: text('paypal_plan_id').notNull(),
  /** Who bills it: paypal or finix. */
  provider: text('provider').$type<'paypal' | 'finix'>().notNull().default('paypal'),
  /** How the subscription bills: monthly, or annual (one payment a year, two months free). */
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>(),
  status: text('status').notNull(),
  startedAt: ts('started_at'),
  nextBillingAt: ts('next_billing_at'),
  cancelledAt: ts('cancelled_at'),
  raw: text('raw', { mode: 'json' }).$type<Record<string, unknown>>(),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('subscriptions_user_idx').on(t.userId)]);

/** One thing the browser did: the action, what it acted on, where it was afterwards, and the screenshot taken then. */
export type BrowseStep = { n: number; action: 'open' | 'click' | 'type' | 'select' | 'scroll' | 'back' | 'read' | 'find' | 'person' | 'handback'; detail: string; url: string; title: string; shot: boolean; at: number; error?: string };
export type BrowseRecord = {
  steps: BrowseStep[]; actions: number; pages: number;
  /** Why the browser stopped before the model was done, when it did. */
  stopped?: 'actions' | 'time' | 'aborted';
  /** The page is still open after the answer, for the person to take over, until this time (milliseconds). */
  live?: { until: number };
  /** A follow-up that carried on from the page an earlier turn left open. */
  resumedFrom?: string;
};

export type Turn = {
  id: string;
  q: string;
  mode: 'search' | 'research';
  tier: 'quick' | 'default' | 'complex';
  focus: 'web' | 'academic' | 'technical' | 'legal' | 'writing' | 'math' | 'code';
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
  /** What this answer cost in gas (the question plus any browser actions), as the gauge showed it. */
  gas?: number;
  /** Connector tools the model called while answering (server name, tool name, whether the call failed). */
  tools?: { server: string; name: string; error?: boolean }[];
  /** Whether the person asked Ricorsa to open the site and work it in its browser for this question. */
  browse?: boolean;
  /** What the browser did for this answer: every step with the page it was on and a screenshot after it. */
  browser?: BrowseRecord;
  /** Provenance hash for this turn: chained from the thread's origin and the previous turn. */
  lineage?: string;
  /** Files the person attached to this question (the extracted text lives in the attachments table). */
  attachments?: AttachmentMeta[];
};
/** `stored`: the file itself is in object storage and can be opened in the viewer (older turns may lack it). */
export type AttachmentMeta = { id: string; name: string; type: string; size: number; chars: number; stored?: boolean };

/** Where a thread came from. Discover-born threads carry the idea's hash id and the graph fingerprint it was drawn from. */
/** Where a thread began: a Discover idea, a node on the Graph page (Ask about this), or a question typed directly. */
export type ThreadOrigin = { kind: 'discover' | 'ask' | 'graph'; ideaId?: string; graphHash?: string; category?: string; title?: string; nodeId?: string; at: number; subject?: string };

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
/**
 * A node. `place` marks an entity the model named as a place (a city, county, region, address or site); the geocoder
 * then fills `geo` (a point), `geoName` (the place as the geocoder knows it), `geoKind` (city, county, state, road...)
 * and `geoBox` (its bounding box, [[west, south], [east, north]]), or `geoFailedAt` when it could not be found.
 */
export type GraphNode = { id: string; type: string; label: string; weight: number; count: number; firstSeen: number; lastSeen: number; level?: string; geo?: GeoAnchor; origin?: NodeOrigin; place?: boolean; geoName?: string; geoKind?: string; geoBox?: [[number, number], [number, number]]; geoFailedAt?: number };
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
  /** App versions the Build studio wrote (a question of the studio that only got a reply does not count). */
  builds: integer('builds').notNull().default(0),
  /** Discover idea sets generated from the graph (a cached set served again does not count). */
  ideas: integer('ideas').notNull().default(0),
  /** Actions Ricorsa's browser took on websites for the person (open, click, type, and so on). */
  browserActions: integer('browser_actions').notNull().default(0),
  /** Gas spent in the period, every kind together: the number the gauge counts down. */
  gas: integer('gas').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.period] })]);

/** Discover picks are generated once per category per day (per person when drawn from their graph). */
export const discoverCache = sqliteTable('discover_cache', {
  category: text('category').notNull(),
  day: text('day').notNull(),
  items: text('items', { mode: 'json' }).$type<Array<Record<string, unknown>>>().notNull(),
  createdAt: tsNow('created_at'),
}, (t) => [primaryKey({ columns: [t.category, t.day] })]);

/**
 * Plans granted by email before (or without) a subscription: a consultant, a partner, a pilot customer. Applied to
 * the person's row the first time they sign in with that address (or the next time, if they already have a
 * Free account), as a LICENSED or TRIAL status with an optional end date. Written by admins from Settings.
 */
export const grants = sqliteTable('grants', {
  email: text('email').primaryKey(),               // lower-cased
  plan: text('plan').notNull(),                     // pro | team
  status: text('status').notNull().default('LICENSED'), // LICENSED | TRIAL
  endsAt: ts('ends_at'),
  note: text('note'),
  createdBy: text('created_by'),
  appliedTo: text('applied_to'),                    // the user id it was applied to
  appliedAt: ts('applied_at'),
  createdAt: tsNow('created_at'),
});

/**
 * Website connectors: a site the person pointed Ricorsa at. Its pages are read (rendered in a browser when the
 * page is an application), kept as text, and searched through the connector's own MCP endpoint
 * (/api/sites/mcp/<connector id>), so the model reaches them like any other connector and answers cite the pages.
 */
export const sites = sqliteTable('sites', {
  connectorId: text('connector_id').primaryKey(),
  userId: text('user_id').notNull(),
  rootUrl: text('root_url').notNull(),
  maxPages: integer('max_pages').notNull().default(40),
  pages: integer('pages').notNull().default(0),
  chars: integer('chars').notNull().default(0),
  rendered: integer('rendered').notNull().default(0),   // pages that needed the browser
  status: text('status').notNull().default('new'),      // new | reading | ready | error
  error: text('error'),
  crawledAt: ts('crawled_at'),
  createdAt: tsNow('created_at'),
});
export const sitePages = sqliteTable('site_pages', {
  id: text('id').primaryKey(),
  connectorId: text('connector_id').notNull(),
  userId: text('user_id').notNull(),
  ordinal: integer('ordinal').notNull().default(0),
  url: text('url').notNull(),
  title: text('title').notNull().default(''),
  text: text('text').notNull().default(''),
  chars: integer('chars').notNull().default(0),
  rendered: integer('rendered', { mode: 'boolean' }).notNull().default(false),
  fetchedAt: tsNow('fetched_at'),
}, (t) => [index('site_pages_connector').on(t.connectorId)]);

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

/**
 * Connectors: outside applications and MCP servers the person has linked. Enabled connectors are handed
 * to the model as tools while it answers. Credentials are stored encrypted (`secret`), never returned to the client.
 */
export type ConnectorAuth = 'none' | 'bearer' | 'oauth';
export type ConnectorStatus = 'new' | 'ok' | 'error' | 'needs_auth';
export type ConnectorTool = { name: string; description?: string; inputSchema?: Record<string, unknown> };
/** Encrypted at rest. Bearer: { token }. OAuth: tokens plus what is needed to refresh them. */
export type ConnectorSecret = { token?: string; accessToken?: string; refreshToken?: string; expiresAt?: number; tokenEndpoint?: string; clientId?: string; clientSecret?: string; scope?: string; resource?: string; /** VDRPros Vault: the connection the token belongs to, for revoking it when the connector is removed. */ vaultConnectionId?: string; vaultWorkspaces?: Array<{ id: string; name: string; tenant: string }>; vaultEmail?: string };
/** An OAuth sign-in that has started and not yet come back. */
export type ConnectorPending = { state: string; verifier: string; authEndpoint: string; tokenEndpoint: string; clientId: string; clientSecret?: string; redirectUri: string; resource?: string; scope?: string; startedAt: number };
export const connectors = sqliteTable('connectors', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  serverName: text('server_name').notNull(),   // the name the model sees; letters, digits, _ and - only
  preset: text('preset'),                        // catalog key, or null for a custom server
  url: text('url').notNull(),
  authType: text('auth_type').$type<ConnectorAuth>().notNull().default('none'),
  secret: text('secret'),                        // encrypted JSON (ConnectorSecret)
  pending: text('pending', { mode: 'json' }).$type<ConnectorPending>(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  allowedTools: text('allowed_tools', { mode: 'json' }).$type<string[]>(),
  /** Spaces this connector is limited to; null or empty means it is available everywhere. */
  spaceIds: text('space_ids', { mode: 'json' }).$type<string[]>(),
  tools: text('tools', { mode: 'json' }).$type<ConnectorTool[]>().notNull().$defaultFn(() => []).default(sql`'[]'`),
  status: text('status').$type<ConnectorStatus>().notNull().default('new'),
  lastError: text('last_error'),
  lastCheckedAt: ts('last_checked_at'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [index('connectors_user_idx').on(t.userId)]);

/** Apps and tools built from a Discover idea: a single self-contained HTML document, streamed in as it is written. */
export type BuildStatus = 'building' | 'done' | 'error';
/** One line of the build conversation, kept on the session's root row. */
/** A message in a build chat. A plan message may carry `next`: suggested next-step requests for that version. */
/** What the check of a version found: whether a real browser ran it, how much it pressed, and what was left. */
export type BuildCheck = { ran: boolean; clicked: number; controls: number; screens: number; seconds: number; left: number; rounds?: number };
export type BuildMessage = { id: string; role: 'user' | 'assistant'; text: string; kind?: 'request' | 'plan' | 'reply' | 'error'; buildId?: string | null; version?: number | null; next?: string[]; at: number; model?: string; /** The configured model could not be used and `model` wrote instead: which one was wanted and what it answered. */ fallback?: { wanted: string; why: string }; check?: BuildCheck; left?: string[] };
/**
 * Files attached to questions. The extracted text lives here (what the model reads); the file itself is kept
 * as uploaded in the FILES bucket under `r2Key` so it can be opened in the viewer (null when storage was
 * unavailable). Rows are tied to the thread they were used in; a row with no thread is a pending upload that expires.
 */
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id'),
  name: text('name').notNull(),
  type: text('type').notNull().default(''),
  size: integer('size').notNull().default(0),
  text: text('text').notNull().default(''),
  chars: integer('chars').notNull().default(0),
  via: text('via').notNull().default('direct'),
  r2Key: text('r2_key'),
  createdAt: tsNow('created_at'),
}, (t) => [index('attachments_user_idx').on(t.userId, t.createdAt), index('attachments_thread_idx').on(t.threadId)]);

/**
 * Institutional memory: passages from the person's own earlier answers and attached files, kept so a later answer
 * can recall and cite them (src/lib/memory.ts). Lexical recall runs on this table alone; when a Vectorize index and
 * Workers AI are bound (VECTORS and AI in wrangler.jsonc) the same rows are also embedded and recalled by meaning.
 * Rows belong to one account and go when the thread or the file goes.
 */
export type MemoryKind = 'answer' | 'file';
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<MemoryKind>().notNull(),
  threadId: text('thread_id'),
  turnId: text('turn_id'),
  fileId: text('file_id'),
  title: text('title').notNull().default(''),
  text: text('text').notNull(),
  /** The passage's keywords, normalized and space-padded, for the lexical search. */
  terms: text('terms').notNull().default(''),
  ordinal: integer('ordinal').notNull().default(0),
  embedded: integer('embedded', { mode: 'boolean' }).notNull().default(false),
  createdAt: tsNow('created_at'),
}, (t) => [index('memories_user_idx').on(t.userId, t.createdAt), index('memories_thread_idx').on(t.threadId), index('memories_file_idx').on(t.fileId)]);

/**
 * A browser Ricorsa left open after a browsing answer so the person can take it over, or hand it back to the model in a
 * follow-up. `sessionId` is the browser session (never sent to the client); the row expires with the browser's own
 * keep-alive and is closed when the person is done. `mode` says who has the page: the model, the person, or nobody.
 */
export type BrowseMode = 'model' | 'person' | 'closed';
export const browseSessions = sqliteTable('browse_sessions', {
  turnId: text('turn_id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull(),
  sessionId: text('session_id').notNull(),
  mode: text('mode').$type<BrowseMode>().notNull().default('model'),
  url: text('url'),
  title: text('title'),
  /** Hosts the person visited while in control, so a sign-in there can be kept if they ask. */
  hosts: text('hosts', { mode: 'json' }).$type<string[]>(),
  /** Whether the person typed into a password field while in control (the cue to offer keeping the sign-in). */
  signInSeen: integer('sign_in_seen', { mode: 'boolean' }).notNull().default(false),
  personStartedAt: integer('person_started_at'),
  personLastAt: integer('person_last_at'),
  /** Minutes of the person's control already counted against the month (one action a minute). */
  personMinutes: integer('person_minutes').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('browse_sessions_user_idx').on(t.userId, t.expiresAt)]);

/** A sign-in the person chose to keep: the site's cookies, sealed, restored the next time Ricorsa opens that site for them. */
export const browseSites = sqliteTable('browse_sites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** The registrable domain, such as acme.com; cookies for it and its subdomains are kept together. */
  host: text('host').notNull(),
  label: text('label'),
  cookies: text('cookies').notNull(),
  cookieCount: integer('cookie_count').notNull().default(0),
  savedAt: integer('saved_at').notNull(),
  lastUsedAt: integer('last_used_at'),
}, (t) => [index('browse_sites_user_idx').on(t.userId, t.host)]);

export const builds = sqliteTable('builds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  /** The session this version belongs to (the first build's id); null on the root itself. */
  rootId: text('root_id'),
  version: integer('version').notNull().default(1),
  /** The conversation with the builder; only the root row carries it. */
  messages: text('messages', { mode: 'json' }).$type<BuildMessage[]>().notNull().$defaultFn(() => []).default(sql`'[]'`),
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
