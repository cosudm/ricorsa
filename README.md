# Ricorsa

An answer engine that learns you. Live web citations, a recursive learning loop that makes the identity graph smarter instead of the model, and a subscription business wrapped around it: Auth0 sign-in, PayPal billing, metered plans, Cloudflare D1 for storage, and a push-to-deploy pipeline onto Cloudflare Workers.

## What is in the box

| Area | Where | Notes |
|---|---|---|
| Landing, pricing, account, legal pages | `src/app/*` | Server-rendered React, same visual system as the app |
| The app (Home, threads, Discover, Spaces, Library, Graph) | `src/app/app/page.tsx` + `public/app/assets/` | Vanilla JS client talking to `/api/*` over JSON and server-sent events |
| Answer pipeline | `src/app/api/ask/route.ts` | Search, prompt, stream, parse, learn, meter |
| Retrieval | `src/lib/search.ts`, `src/lib/llm.ts` | Brave Search runs before the model call; results become numbered sources the model cites with `[n]` markers |
| Prompting and parsing | `src/lib/prompt.ts`, `src/lib/parse.ts` | Cached instruction prefix, tagged output blocks |
| Identity graph | `src/lib/graph.ts` | Merge, decay, prune, prompt block, forget, reset |
| Plans and quotas | `src/lib/plans.ts`, `src/lib/usage.ts` | Edit prices and limits here |
| PayPal | `src/lib/paypal.ts`, `src/lib/billing.ts`, `src/app/api/billing/paypal/*`, `scripts/paypal-*.ts` | Subscriptions API, signature-verified webhooks |
| Auth | `src/lib/auth0.ts`, `src/proxy.ts`, `src/lib/session.ts` | Auth0 Next.js SDK v4; users are upserted on first request |
| Database | `src/lib/db/schema.ts`, `drizzle/` | Drizzle ORM on Cloudflare D1 (SQLite); the same binding serves `next dev` through a local miniflare |
| Deploy | `wrangler.jsonc` | Cloudflare Workers Builds from GitHub: migrate, build with OpenNext, deploy |

## Run it locally in five minutes (no external services)

```bash
npm install
cp .env.example .env.local
npm run db:migrate:local
```

Edit `.env.local` and set these three lines, leaving everything else empty for now:

```
DEV_FAKE_USER=1
DEV_MOCK_LLM=1
AUTH0_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Then:

```bash
npm run dev
```

Open http://localhost:3000/app. You are signed in as a fixed development user, answers stream from a canned stub, and a local D1 database lives in `.wrangler/state`. The whole loop works: ask, see sources, watch the answer stream, see what was learned, open the Graph page. The two `DEV_` flags are ignored in production builds.

To use real models and live web search locally, add `ANTHROPIC_API_KEY` and remove `DEV_MOCK_LLM`.

## Production setup, in order

Everything runs in one Cloudflare account plus four outside services: Auth0 (sign-in), Moonshot AI (Kimi models), Brave Search (live web results) and PayPal (billing).

### 1. Cloudflare

Create a D1 database called `ricorsa` (dashboard: Storage & Databases, D1) and put its id in `wrangler.jsonc` under `d1_databases`. Create a user API token with the "Edit Cloudflare Workers" template plus Account: D1: Edit, Zone: DNS: Edit, Zone: SSL and Certificates: Edit and Zone: Zone: Read, scoped to the account and to all zones (or just ricorsa.com). Use the Workers Paid plan: answers stream for 20 to 90 seconds and the Free plan's 10 ms CPU limit is too small.

### 2. Sign-in (Auth0)

Create a Regular Web Application in Auth0. Set:

- Allowed Callback URLs: `https://ricorsa.com/auth/callback` (and `http://localhost:3000/auth/callback` for local use)
- Allowed Logout URLs: `https://ricorsa.com` (and `http://localhost:3000`)

You need `AUTH0_DOMAIN` (no `https://`), `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` (`openssl rand -hex 32`) and `APP_BASE_URL=https://ricorsa.com`. Turn on the social connections you want (Google, Microsoft) in the Auth0 dashboard; the app links to `/auth/login?screen_hint=signup` for sign-up and `/auth/login` for sign-in. Until these are set, the marketing pages work and the app pages answer with a short "being set up" notice.

### 3. Models (Kimi) and search (Brave)

`KIMI_API_KEY` from platform.moonshot.ai (API keys) and `BRAVE_API_KEY` from brave.com/search/api. Model ids default to `kimi-k3` for every tier, with thinking effort low for Fast, medium for Best and max for Reasoning (`REASONING_QUICK`, `REASONING_DEFAULT`, `REASONING_COMPLEX`); override the ids with `MODEL_DEFAULT`, `MODEL_QUICK`, `MODEL_COMPLEX`. The Build studio writes whole apps on `MODEL_BUILD` (default `kimi-k2.7-code-highspeed`, several times faster than K3 with thinking; `REASONING_BUILD` defaults to low). Ricorsa checks the account's model list and falls back to the best available Kimi model when a configured id is missing. Point `KIMI_BASE_URL` elsewhere for any OpenAI-compatible endpoint. Searches are metered per answer and priced into the cost estimate (`WEB_SEARCH_USD` in `src/lib/plans.ts`). Files attached to a question (`/api/files`, `src/lib/files.ts`) are read into text once: text and code directly, everything else through Moonshot's Files API (purpose `file-extract`, the upload is deleted right after); the text is stored on the thread and handed to the model ahead of the question, and the web is skipped for that question unless it asks for it. Per-plan limits live in `caps.files`.

The stable instruction prefix is marked for prompt caching, and follow-ups cache the conversation prefix, which is where most of the input tokens are.

### 4. PayPal subscriptions

You need a PayPal Business account and a REST app (Developer Dashboard). Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_ENV` (`sandbox` while testing, `live` for real billing). The pricing page passes the client id to the browser to render the buttons.

That is all the configuration. The first time a signed-in person opens the pricing page, the app creates its catalog product, one billing plan per paid tier (prices from `src/lib/plans.ts`) and the webhook at `APP_BASE_URL/api/billing/paypal/webhook`, and keeps the ids in the `config` table (`src/lib/paypal-setup.ts`). If you would rather manage those by hand, set `PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_TEAM` and `PAYPAL_WEBHOOK_ID` and the app uses yours; `npm run paypal:setup` and `npm run paypal:webhook` are the same steps as scripts. PayPal plans are immutable, so a price change means new plans and new ids. Every webhook delivery is verified with PayPal's signature endpoint, recorded once, and applied by re-fetching the subscription so the account always reflects PayPal's current view.

How billing flows: the pricing page renders PayPal's subscription button for each paid plan with the user's id in `custom_id`. On approval the browser posts the subscription id to `/api/billing/paypal/subscribe`, the server fetches it from PayPal, checks the `custom_id`, and sets the plan. Webhooks keep it in sync afterwards (activated, suspended, cancelled, expired, payment failed). Cancel from the Account page calls PayPal's cancel endpoint and re-syncs.

### 5. Deploy (Cloudflare Workers Builds from GitHub)

Push this repository to GitHub. In the Cloudflare dashboard open Workers & Pages, Create, Continue with GitHub, pick the repository and use these settings:

- Build command: `npm run cf:migrate && npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

Every push to `main` then applies the D1 migrations, builds with the OpenNext Cloudflare adapter and deploys. `wrangler.jsonc` carries the non-secret configuration as `vars` (app URL, Auth0 domain and client id, PayPal client id, model ids) ; attach the custom domains `ricorsa.com` and `www.ricorsa.com` once in the Worker's Settings, Domains & Routes (the zone is on Cloudflare, so DNS and certificates are handled for you). Add the four secrets in the Worker's Settings, Variables and Secrets: `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `ANTHROPIC_API_KEY`, `PAYPAL_CLIENT_SECRET`. Deploys keep secrets; they only replace the plain `vars`.

To deploy from your own machine instead: `npx wrangler login`, then `npm run db:migrate:remote` and `npm run cf:deploy`, and set the four secrets with `npx wrangler secret put NAME`.

## Plans and metering

`src/lib/plans.ts` defines Free, Pro and Team: daily and monthly question caps, Research reports per month, which model tiers a plan may use, and how many Spaces. `assertQuota` runs before every answer and returns a 402 (upgrade) or 429 (limit) that the app turns into a friendly message with a link to pricing. Usage rows in the `usage` table carry token counts and an estimated cost so you can watch margin per user; the price constants near the bottom of `plans.ts` are the ones to update when list prices change.

## The identity graph

Each answer ends with a `<learned>` block the model writes about the person: intent, topics, entities, goals, expertise levels, style. `mergeLearned` folds it into a weighted graph: repetition strengthens a node, everything decays a little on each event, faded nodes are pruned, and nodes learned together are connected. `graphPromptBlock` renders the top of the graph into the system prompt for the next question. The person can pause learning, forget a node, export the graph, or reset it; all of that is real API and lives under `/api/graph`.

Nodes carry an optional `geo` anchor (a GeoJSON point, line or polygon) so the same graph can hold spatial identities. Nothing populates it yet; a geocoding step in `mergeLearned` for entity nodes is the natural place to start.

## Answers and citations

Each answer starts with retrieval: one Brave query for a normal question (none for Writing focus), four to six planned queries plus a read of the top pages in Research mode. The merged, numbered results are pushed to the browser before the model starts and handed to the model as context after the question; it cites them with `[n]` markers that the client renders as chips. Connectors are offered to the model as functions; when it calls one, Ricorsa calls the MCP server and returns the result, until the model answers. Answers that hit the output limit continue in partial mode. Earlier answers are fed back into follow-ups with the markers stripped.

## Provenance

Everything created from a graph carries a cryptographic id. When Discover generates ideas, each one is hashed (SHA-256) over a non-reversible subject id, the exact fingerprint of the graph it was drawn from (every node id, weight and count), the category, the idea text and the moment of generation. A thread started from an idea stores that id and fingerprint as its origin, every turn chains a new hash onto the previous one, and any node the thread adds to the graph records the turn and idea it came from. The thread menu has a Provenance view with the full chain, exports include it, and `src/lib/hash.ts` is the single place the hashing lives if you later want to anchor those ids somewhere external (a ledger, a timestamping service, a verifiable credential).

## Security notes

- The browser never talks to PayPal, Moonshot AI or Brave directly, and never holds a key.
- Subscriptions are only ever applied from PayPal's own subscription object, never from what the browser claims.
- Every API route resolves the signed-in user first; threads, Spaces and graphs are always filtered by owner.
- Security headers are set in `next.config.ts`. Put Cloudflare's WAF and Turnstile in front of `/auth/login` if free-tier abuse shows up.

## Before launch

Have the Privacy and Terms pages (`src/app/privacy`, `src/app/terms`) reviewed; they are starting points. The identity graph is profiling of a named person, so keep the pause, export and delete paths working and mention them in the privacy policy. Add a support inbox, and decide who receives the enterprise inquiries that the landing page sends to `enterprise@ricorsa.com`.
