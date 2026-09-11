# SMEPro Ricorsa Manager Console

The staff-side console for Ricorsa: customers, the accounts signing up on ricorsa.com, licences and trials, communication, invoicing and billing, with roles for the people who use it. It lives at https://manage.ricorsa.com and is a separate app from the product: its own Worker, its own database, its own Auth0 application. The product is only read (accounts, subscriptions, usage), except for the one thing the console exists to do, which is grant a plan, a trial or a licence to an account.

## What it does

Customers are the console's own records: people or companies with contacts, tags, notes, an owner on the team, a status (lead, trial, active, past due, churned) and a link to the Ricorsa account they use. Every list is an interactive grid: sort by any column, search, filter chips, hide and resize columns, page through, edit cells in place (double-click or Enter), select rows for bulk changes, export what is shown as CSV, and save views to come back to or share with the team. Layouts are remembered per person, on every device.

Ricorsa sign-ups is the live list of accounts on ricorsa.com with plan, subscription status, usage this month and last activity. Any account can be added as a customer in one click, or given a plan by hand.

Licences and trials grant plans. A licence is a key on a plan for a period (or open-ended); a trial is a plan for a number of days. Either is applied to the linked Ricorsa account immediately (the product marks the account TRIAL or LICENSED with the end date and returns it to Free when the date passes). Trials can be extended, converted into a licence, or cancelled; licences renewed, suspended, revoked.

Communication is the history with each customer: emails sent from the console (through Resend), and calls, meetings and notes logged by the team.

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
