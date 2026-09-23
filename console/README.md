# SMEPro Ricorsa Manager Console

The staff-side console for Ricorsa: customers, the accounts signing up on ricorsa.com, licenses and trials, communication, invoicing and billing, with roles for the people who use it. It lives at https://manage.ricorsa.com and is a separate app from the product: its own Worker, its own database, its own Auth0 application. The product is only read (accounts, subscriptions, usage), except for the one thing the console exists to do, which is grant a plan, a trial or a license to an account.

## What it does

Customers are the console's own records: people or companies with contacts, tags, notes, an owner on the team, a status (lead, trial, active, past due, churned) and a link to the Ricorsa account they use. Every list is an interactive grid: sort by any column, search, filter chips, hide and resize columns, page through, edit cells in place (double-click or Enter), select rows for bulk changes, export what is shown as CSV, and save views to come back to or share with the team. Layouts are remembered per person, on every device.

Ricorsa sign-ups is the live list of accounts on ricorsa.com with plan, billing cycle, subscription status, usage this month, monthly value and margin, and last activity. Any account can be added as a customer in one click, or given a plan by hand.

Licenses and trials grant plans. A license is a key on a plan for a period (or open-ended); a trial is a plan for a number of days. Either is applied to the linked Ricorsa account immediately (the product marks the account TRIAL or LICENSED with the end date and returns it to Free when the date passes). Trials can be extended, converted into a license, or cancelled; licenses renewed, suspended, revoked.

Communication is the history with each customer: emails sent from the console (through Resend), and calls, meetings and notes logged by the team.

Billing is read in monthly units. Every customer and license carries a billing cycle, monthly or annual; a customer linked to a paying Ricorsa account follows the account's subscription (the product records the cycle from the PayPal plan id), and a license names its own when issued (a term of a year or more is annual). The dashboard shows the paying base as cohorts by plan and cycle: MRR at list price with annual spread over twelve months, model cost over the trailing thirty days from the product's usage rows, the gross margin that leaves, subscriptions that ended in the trailing ninety days as a monthly churn rate, and the lifetime value that follows (ARPU × gross margin ÷ churn; a cohort with no churn yet is projected at 2 percent a month and says so). The Ricorsa sign-ups grid carries the same per account (cycle, monthly value, thirty-day cost and margin) and filters by cycle; the customers grid filters by cycle too.

Allowances and true-ups. Staff can raise an account's monthly allowances above its plan (app versions, Discover idea sets, questions, Research reports) from the account sheet or the customer record; the product enforces the raised numbers at once and shows them on the person's Account page. For annual accounts, whatever was used beyond the plan's own allowance in a month is what the console bills: the dashboard lists the annual accounts over their allowance, and one click drafts a true-up invoice with a line per unit kind at the prices in Settings (per version, per idea set, per question, per report). The draft is then sent like any invoice, through PayPal Invoicing or by email. Monthly subscribers are not true-up candidates; they upgrade.

Invoices are drafted per customer with line items, tax and terms, numbered from Settings, and rendered as a branded PDF on the Worker. Sending goes through PayPal Invoicing (the customer gets a Pay button and the status flows back through a webhook or a refresh) and/or by email with the PDF attached. Payments received elsewhere are recorded by hand and can be mirrored to PayPal.

Staff sign in with Auth0. Owners named in `CONSOLE_OWNERS` are owners on first sign-in; owners invite others by email (they are in as soon as they sign in with that address) and approve access requests. Roles: owner (everything), manager (records, sending, grants), viewer (read only). Every change is written to the activity log.

## Setup

1. Cloudflare: create the D1 database `ricorsa-console` and put its id in `wrangler.jsonc`. Create a Worker named `ricorsa-console` from the `cosudm/ricorsa` repository with the root directory `console`, build command `npm run cf:migrate && npx opennextjs-cloudflare build` and deploy command `npx opennextjs-cloudflare deploy`. Attach the custom domain `manage.ricorsa.com`.
2. Auth0: a Regular Web Application in the same tenant as Ricorsa with callback `https://manage.ricorsa.com/auth/callback` and logout URL `https://manage.ricorsa.com`. Put its client id in `wrangler.jsonc`.
3. Secrets on the Worker: `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` (any 32 random bytes as hex), `PAYPAL_CLIENT_SECRET` (the same PayPal app as the product), `RESEND_API_KEY` (from resend.com, with `ricorsa.com` verified as a sending domain).
4. Push to `main`. Migrations for the console database are applied on every deploy.

## Local development

```
npm install
npm run db:migrate:local          # the console's own tables
npm run db:seed:ricorsa:local     # the product's tables and a few sample accounts, for the local copy of RICORSA
DEV_FAKE_USER=1 DEV_FAKE_EMAIL=you@example.com CONSOLE_OWNERS=you@example.com npm run dev
```

Open http://localhost:3124. Without `PAYPAL_CLIENT_SECRET` and `RESEND_API_KEY` the console still works; sending is what needs them. `PAYPAL_BASE_URL` and `RESEND_BASE_URL` point the clients at stand-ins for tests.
