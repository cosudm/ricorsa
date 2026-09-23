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
| Built apps | `src/lib/build.ts`, `src/lib/app-kit.ts`, `src/lib/app-kit/` | The builder's standard and the app kit (design system + `window.rk` runtime) inlined into every generated app; edit `kit.css`/`kit.js`, then `npm run kit:build` |
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

### 3. Models and search (Brave)

Every model provider Ricorsa talks to speaks one of two wire protocols, Anthropic's Messages API or the OpenAI-compatible chat completions API, and `src/lib/providers.ts` keeps the registry: Anthropic, Moonshot (Kimi), OpenAI, Google (Gemini), xAI (Grok), Mistral, DeepSeek, Groq, OpenRouter, Together and any custom OpenAI-compatible endpoint by base URL. A provider is configured by a key in the environment (`ANTHROPIC_API_KEY`, `KIMI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `TOGETHER_API_KEY`; `*_BASE_URL` to point one elsewhere) or by a key an admin pastes under Settings → Model accounts, which is sealed in the `config` table (`provider:<id>`) and outranks the environment. Adding a key fetches the provider's model list and sends one tiny message, so the exact reply (accepted, key rejected, no credit) is on record; from then on any model the account lists can be chosen as the active model for each part of the product (Fast, Best and Reasoning answers, the Build studio, Discover ideas), saved in the `models` config row and applied at once (`PUT /api/admin/models`, `PUT|POST|DELETE /api/admin/providers`). A provider that refuses is set aside for ten minutes and the tier falls to the next model that works, so the product keeps answering. `BRAVE_API_KEY` from brave.com/search/api powers web search. Model ids default to `kimi-k3` for every tier, with thinking effort low for Fast, medium for Best and max for Reasoning (`REASONING_QUICK`, `REASONING_DEFAULT`, `REASONING_COMPLEX`); override the ids with `MODEL_DEFAULT`, `MODEL_QUICK`, `MODEL_COMPLEX`. The Build studio writes whole apps on `MODEL_BUILD` and Discover ideas on `MODEL_IDEAS`, both `claude-fable-5-1` by default through the Anthropic Messages API (`ANTHROPIC_API_KEY`; adaptive thinking with `EFFORT_BUILD` and `EFFORT_IDEAS`, low to max, default high; the system prompt is cached). Any `claude-*` id routes to Anthropic and any other id to Kimi, so a tier can be moved between providers by changing its id. When Anthropic cannot serve (no key, key rejected, no credit, unknown model, overloaded) builds fall back to the fast Kimi code model (K2.7 code highspeed, then K2.7 code, then K3) and ideas to K3; the studio says so under the version, with what Anthropic answered, and Settings has an admin "Model accounts" check (`/api/admin/models`) that probes Anthropic with one tiny message and reports the exact reply. After the browser check the builder answers findings and local change requests with `<edits>` (find and replace blocks applied by `applyEdits` in `src/lib/build.ts`) rather than rewriting the whole document. Ricorsa checks the Kimi account's model list and falls back to the best available Kimi model when a configured id is missing. Every version the studio writes is opened in a real browser before it is called done (Cloudflare Browser Run, binding `BROWSER`, `src/lib/build-run.ts`): the exerciser in `src/lib/build-exerciser.ts` presses every control, opens every screen, records errors, dead controls, missing screens, dialogs, network requests, blank renders, reload failures and phone-width overflow, and the findings go back to the builder for up to two repair rounds; without the binding the static audit in `src/lib/build-audit.ts` runs instead. A built app has a live line to Ricorsa's model: inside the studio frame and on `/app/run#<version id>` (the Open button) the host page injects `window.ricorsa` (`public/app/assets/bridge.js`), and `window.ricorsa.ask(prompt, { system, onText, search, history })` is relayed with the person's session to `POST /api/apps/ask`, which searches the web when asked, hands the model the person's profile and the app's instructions, streams the answer back into the frame and counts one question against the plan; the builder is told to use it for anything a model should do and to say so when a downloaded copy has no line. The browser check stubs the line so those flows are pressed too. Admins can grant Essentials, Professional or Enterprise to an email address from Settings (`/api/admin/grants`, table `grants`); the plan lands on the account at the person's first sign-in with that address. Point `KIMI_BASE_URL` elsewhere for any OpenAI-compatible endpoint. Searches are metered per answer and priced into the cost estimate (`WEB_SEARCH_USD` in `src/lib/plans.ts`). Files attached to a question (`/api/files`, `src/lib/files.ts`) are read into text once: text and code directly, PDFs with pdf.js (`unpdf`) and Word/Excel/PowerPoint from their XML (`fflate`), and only scans, images and older binary formats through Moonshot's Files API (purpose `file-extract`, retried when busy, the upload deleted right after); the text is stored on the thread and handed to the model ahead of the question, and the web is skipped for that question unless it asks for it. The file itself is kept in R2 (binding `FILES`, bucket `ricorsa-vault`, US jurisdiction; `src/lib/storage.ts`) so it can be opened in the app's viewer: PDFs and images through the browser's own viewers at `/api/files/:id/content`, everything else drawn by the sandboxed renderer page `public/app/assets/viewer.html` (Word with docx-preview, Excel with SheetJS, PowerPoint with PPTXjs, plus Markdown, HTML, JSON, CSV and code), falling back to the extracted text. Stored files are deleted with their thread, with the account, and when a pending upload expires. Per-plan limits live in `caps.files`.

The stable instruction prefix is marked for prompt caching, and follow-ups cache the conversation prefix, which is where most of the input tokens are.

### 4. PayPal subscriptions

You need a PayPal Business account and a REST app (Developer Dashboard). Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_ENV` (`sandbox` while testing, `live` for real billing). The pricing page passes the client id to the browser to render the buttons.

That is all the configuration. The first time a signed-in person opens the pricing page, the app creates its catalog product, one billing plan per paid tier (prices from `src/lib/plans.ts`) and the webhook at `APP_BASE_URL/api/billing/paypal/webhook`, and keeps the ids in the `config` table (`src/lib/paypal-setup.ts`). If you would rather manage those by hand, set `PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_TEAM` and `PAYPAL_WEBHOOK_ID` and the app uses yours; `npm run paypal:setup` and `npm run paypal:webhook` are the same steps as scripts. PayPal plans are immutable, so a price change means new plans and new ids. Every webhook delivery is verified with PayPal's signature endpoint, recorded once, and applied by re-fetching the subscription so the account always reflects PayPal's current view.

Plans are reconciled with PayPal on every cold start (`src/lib/paypal-setup.ts`): a paid tier with no PayPal plan gets one, and a tier whose price changed gets a new one while the old id is kept as retired, so people subscribed at the old price keep their price and their access; the keys used before September 2026 (`pro`, `team`) resolve to Essentials and Professional in code and were rewritten in the database by migration 0010. How billing flows: the pricing page renders PayPal's subscription button for each paid plan with the user's id in `custom_id`. On approval the browser posts the subscription id to `/api/billing/paypal/subscribe`, the server fetches it from PayPal, checks the `custom_id`, and sets the plan. Webhooks keep it in sync afterwards (activated, suspended, cancelled, expired, payment failed). Cancel from the Account page calls PayPal's cancel endpoint and re-syncs.

### 5. Deploy (Cloudflare Workers Builds from GitHub)

Push this repository to GitHub. In the Cloudflare dashboard open Workers & Pages, Create, Continue with GitHub, pick the repository and use these settings:

- Build command: `npm run cf:migrate && npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

Every push to `main` then applies the D1 migrations, builds with the OpenNext Cloudflare adapter and deploys. `wrangler.jsonc` carries the non-secret configuration as `vars` (app URL, Auth0 domain and client id, PayPal client id, model ids) ; attach the custom domains `ricorsa.com` and `www.ricorsa.com` once in the Worker's Settings, Domains & Routes (the zone is on Cloudflare, so DNS and certificates are handled for you). Add the four secrets in the Worker's Settings, Variables and Secrets: `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `ANTHROPIC_API_KEY`, `PAYPAL_CLIENT_SECRET`. Deploys keep secrets; they only replace the plain `vars`.

To deploy from your own machine instead: `npx wrangler login`, then `npm run db:migrate:remote` and `npm run cf:deploy`, and set the four secrets with `npx wrangler secret put NAME`.

## Plans and metering

`src/lib/plans.ts` defines Essentials ($25), Professional ($55) and Enterprise ($85), each starting with a free trial of `TRIAL_DAYS` (14) through PayPal, plus the free state an account has with no subscription (not offered as a plan): daily and monthly question caps, Research reports per month, which model tiers a plan may use, and how many Spaces. `assertQuota` runs before every answer and returns a 402 (upgrade) or 429 (limit) that the app turns into a friendly message with a link to pricing. Usage rows in the `usage` table carry token counts and an estimated cost so you can watch margin per user; the price constants near the bottom of `plans.ts` are the ones to update when list prices change.

## The identity graph

Each answer ends with a `<learned>` block the model writes about the person: intent, topics, entities, goals, expertise levels, style. `mergeLearned` folds it into a weighted graph: repetition strengthens a node, everything decays a little on each event, faded nodes are pruned, and nodes learned together are connected. `graphPromptBlock` renders the top of the graph into the system prompt for the next question. The person can pause learning, forget a node, export the graph, or reset it; all of that is real API and lives under `/api/graph`.

The `<learned>` block also names up to three real places the work is about (a city, a county, a site, an address). They become entity nodes flagged `place`, and after the answer has been sent `src/lib/geo.ts` looks each one up and writes a GeoJSON point (plus the display name, the kind and a bounding box) onto the node. The geocoder speaks the Nominatim search API: OpenStreetMap's public instance by default (one request a second, an identifying User-Agent, attribution on the map, all honored), or any compatible endpoint set with `GEOCODER_URL` and `GEOCODER_KEY` (LocationIQ, a hosted or company Nominatim); `GEOCODING=off` turns it off. Lookups are cached in the `config` table (`geo:<slug>`, six months for a hit, a week for a miss). The Graph page's Map view (`public/app/assets/graphmap.js`) draws the anchored nodes on Natural Earth land, lakes and borders (`public/app/assets/world-110m.json`, with six 1:50m longitude bands fetched when the view is close enough) in the colors of their cortex, with the same time scrubber, search, labels, cortex focus and node panel as the brain.

The Graph page's lists are live: each chip carries its weight, marks what is new, strengthening, fading or a place, lights its node in the brain on hover and opens the node panel on click; the toolbar sorts and filters them, a pinned cortex narrows them to its types, and the time scrubber hides what had not been learned yet. The node panel opens Discover centered on the node (`POST /api/discover` with `anchor`), starts a thread about it (origin kind `graph`), shows it in the brain or on the map, and lists the Discover ideas that draw on it; Discover's idea chips link back to the node or the type in the graph (`#/graph?node=` and `#/graph?type=`).

## Memory

Every finished answer and every attached file is cut into passages and kept in the `memories` table for that account only (`src/lib/memory.ts`). When a new question comes in, the passages that bear on it are recalled (keywords over the table, scored in code by term overlap weighted by rarity, a verbatim phrase of the question, and recency; at most one source per turn and two per thread, never from the thread being answered) and numbered after the web sources under the labels "Your threads" and "Your files", so the model can cite "your earlier answer" or "your file" and the reader can open the source: the link goes to that thread, scrolled to that turn (`/app#/thread/<id>?turn=<turnId>`). The first answer on an account also fills the memory from its most recent hundred threads and their files, once. Deleting a thread deletes what was remembered from it; `MEMORY=off` turns the whole thing off. When the Worker also has a Vectorize index bound as `VECTORS` and Workers AI as `AI` (both added in `wrangler.jsonc`; create the index with `wrangler vectorize create ricorsa-memory --dimensions=768 --metric=cosine`), the same passages are embedded with `@cf/baai/bge-base-en-v1.5` and recalled by meaning as well; both bindings are detected at run time, so nothing else changes.

## Running it as a service

Customers never see which provider wrote an answer or a version, nor any provider error or billing state; that is operator information, shown to admins only (the studio's model and fallback lines, Settings → Model accounts). When a provider refuses, answers and builds fall back to the next model and the customer sees a normal result. `GET /api/health/models` (no sign-in) answers 200 when every configured model account responds and 503 when one refuses (no credit, rejected key, unknown model), with no details: point an uptime monitor at it (Cloudflare Health Checks, UptimeRobot, Better Stack) with an email or phone alert, and the operator hears before a customer does; the probe is cached for five minutes. Admins also get a banner in the app while an account is refusing. On the Anthropic side, turn on auto-reload with a spend limit in the Console so the balance never reaches zero; the key should live in a workspace of the same organization that holds the credit.

## Connectors and Spaces

A connector is available everywhere by default. It can instead be limited to one or more Spaces (Where on its card, or Add to this Space on the Space page, which creates it limited to that Space), and then only threads in those Spaces are given its tools; a thread outside any Space, or in another Space, never sees it. The scope is the `space_ids` column on `connectors`; `connectorsForModel` in `src/lib/connectors.ts` applies it per thread, the Space page lists what a thread there can use, and deleting a Space takes it out of every connector's scope (a connector left with no Space becomes available everywhere).

## Website connectors

Connectors → Add connector → Website takes any public address. Ricorsa walks the site from that page (same host, up to the number of pages chosen, sixty at most), fetching each page plainly and opening it in the headless browser when the document is an application with little static text: the text on screen is kept instead, the links it shows are followed, and its own tabs and menu buttons are pressed so screens that only appear on a click are read too (`src/lib/sites.ts`). Pages are stored per connector (`sites`, `site_pages`) and searched in memory. The model reaches them through the connector's own MCP endpoint, `/api/sites/mcp/<connector id>` (bearer token = the connector's secret), with `site_search`, `site_read` and `site_pages`; hits and read pages become numbered sources with the real page URLs, so answers cite them and the citations open the page. Read again replaces the pages; removing the connector removes them. Private and local addresses are refused (`SITES_ALLOW_LOCAL=1` lets development read a site on this machine).

## Consoles in answers

When an answer is about the person's own setup or something they can act on in Ricorsa (their connectors, the apps they built, an idea to build, what to ask next), the model may place one interactive console inside it: a fenced block tagged `console` holding a JSON card of rows, each with a status pill and up to three buttons. The guide and the context the model gets (connector ids and states, presets that can be added, recent apps) are in `src/lib/console.ts`; the app renders the card (`mountConsoles` in `public/app/assets/app.js`) and runs a fixed set of verbs: open a route, ask a follow-up, build an idea, turn a connector on or off, add a preset, open an app, open a link, copy text. Ids are checked against the person's account before anything happens, and the prose still carries the substance.

## Answers and citations

Each answer starts with retrieval: one Brave query for a normal question (none for Writing focus), four to six planned queries plus a read of the top pages in Research mode. The merged, numbered results are pushed to the browser before the model starts and handed to the model as context after the question; it cites them with `[n]` markers that the client renders as chips. Connectors are offered to the model as functions; when it calls one, Ricorsa calls the MCP server and returns the result, until the model answers. Answers that hit the output limit continue in partial mode. Earlier answers are fed back into follow-ups with the markers stripped.

## Provenance

Everything created from a graph carries a cryptographic id. When Discover generates ideas, each one is hashed (SHA-256) over a non-reversible subject id, the exact fingerprint of the graph it was drawn from (every node id, weight and count), the category, the idea text and the moment of generation. A thread started from an idea stores that id and fingerprint as its origin, every turn chains a new hash onto the previous one, and any node the thread adds to the graph records the turn and idea it came from. The thread menu has a Provenance view with the full chain, and the Graph page has one for the whole graph (`GET /api/graph/export?summary=1`: fingerprint, subject id, counts, the latest lineage entries). Export on the Graph page downloads the graph with its provenance (`GET /api/graph/export`): the fingerprint and how it is computed, every node with its weight, origin and map anchor, the connections, the intents, and on full-graph plans the lineage chain of every thread (its origin, each turn's hash and the nodes each turn added); the file name carries the fingerprint. `src/lib/hash.ts` is the single place the hashing lives if you later want to anchor those ids somewhere external (a ledger, a timestamping service, a verifiable credential).

## Security notes

- The browser never talks to PayPal, Moonshot AI or Brave directly, and never holds a key.
- Subscriptions are only ever applied from PayPal's own subscription object, never from what the browser claims.
- Every API route resolves the signed-in user first; threads, Spaces and graphs are always filtered by owner.
- Security headers are set in `next.config.ts`. Put Cloudflare's WAF and Turnstile in front of `/auth/login` if free-tier abuse shows up.

## Before launch

Have the Privacy and Terms pages (`src/app/privacy`, `src/app/terms`) reviewed; they are starting points. The identity graph is profiling of a named person, so keep the pause, export and delete paths working and mention them in the privacy policy. Add a support inbox, and decide who receives the enterprise inquiries that the landing page sends to `enterprise@ricorsa.com`.

## Manager Console

The staff console (customers, sign-ups, licenses, trials, communication, invoicing and billing) is a separate app in `console/`, deployed as its own Worker at https://manage.ricorsa.com with its own database and Auth0 application. It reads this product's database for live account data and writes only plan grants (statuses `TRIAL` and `LICENSED`, which `src/lib/plans.ts` treats as granting until `planRenewsAt` passes). See `console/README.md`.

## VDRPros Vault

The `vault/` directory is VDRPros Vault Cloud: the sealed document repository and the service behind the VDRPros Vault connector in Ricorsa (Connectors, VDRPros Vault). It deploys as its own Worker at https://vault.vdrpros.com; see `vault/README.md`.
