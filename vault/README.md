# VDRPros Vault Cloud

The sealed repository behind VDRPros, and the connector Ricorsa uses to search it. Files come in through one intake (a browser upload, the uploader script for folder trees, later a bulk sync), are hashed and kept exactly as received, read into pages of text (or OCR'd), classified, and indexed page by page. Every custody event is a line in a hash-linked receipt chain. Ricorsa connects with a one-time code sent to the person's Vault email, gets a token limited to the workspaces they chose, and searches live through MCP; its answers cite pages, and the pages open in Ricorsa's viewer.

It lives at https://vault.vdrpros.com, in the same Cloudflare account as VDRPros and Ricorsa, and runs as one Worker with:

- D1 `vault`: the control plane (tenants, people, workspaces, matters, boxes and folders, batches, connections, receipts, scan requests, dead letters, access log)
- R2 `vault-files`: originals under `orig/<workspace>/<sha256>`, page text under `text/<sha256>.json`, manifests under `manifests/`
- Queue `vault-intake` (dead letters to `vault-intake-dlq`): one message per received file
- Durable Objects: `SearchShard` (SQLite with FTS5, one per slice of a workspace, about a million files each) and `HashDirectory` (one per workspace, every hash it holds)

## Setup

1. Cloudflare: create the D1 database `vault` (id in `wrangler.jsonc`), the R2 bucket `vault-files` (United States jurisdiction), and the queues `vault-intake` and `vault-intake-dlq`. Create a Worker named `vault` from the `cosudm/ricorsa` repository with the root directory `vault`, build command `npm run cf:migrate` and deploy command `npx wrangler deploy`. Attach the custom domain `vault.vdrpros.com`.
2. Secrets on the Worker (Settings, Variables and Secrets): `ADMIN_KEY` (the staff sign-in), `RICORSA_CLIENT_SECRET` (shared with Ricorsa, where it is `VAULT_CLIENT_SECRET`), `LINK_SECRET` (any 32 random bytes as hex), `RESEND_API_KEY` (codes are emailed from `MAIL_FROM`; the domain in it must be verified in Resend), and for OCR `OCR_PROVIDER` (`azure` with `AZURE_DI_ENDPOINT` and `AZURE_DI_KEY`, or `moonshot` with `MOONSHOT_API_KEY`; `none` keeps scans as awaiting OCR).
3. Ricorsa: `VAULT_URL` in its `wrangler.jsonc` and the `VAULT_CLIENT_SECRET` secret. The VDRPros Vault card then appears in Connectors.
4. Push to `main`. Migrations for the control plane are applied on every deploy.

## Operating it

Staff sign in at `/admin/` with the staff key. Create the tenant (the customer), add the people who may connect Ricorsa (their Vault email, with owner or admin for everything or a workspace membership for less), create workspaces and matters, then open a batch. A batch can be filled from the browser or with the uploader:

```
node scripts/upload.mjs --url https://vault.vdrpros.com --batch <batch id> --key <batch key> [--matter <id>] [--seal] ./folder
```

Paper is recorded as boxes and folders (barcode, label, custodian, dates, location) under the workspace's inventory, so Ricorsa can name what exists before it is scanned; a scan request from Ricorsa or from the staff screens moves a folder through requested, scanning and digitised, and the scanned pages come in as a batch tied to that folder.

## Local development

```
npm install
cp .dev.vars.example .dev.vars        # staff key, client secret, link secret
npm run db:migrate:local
npm run dev                            # http://localhost:3180, with APP_BASE_URL overridden to localhost so codes are returned instead of emailed
node test/run.mjs --samples ./path/to/sample/files
```

Ricorsa's local server points at it with `VAULT_URL=http://localhost:3180` and `VAULT_CLIENT_SECRET` equal to the Vault's `RICORSA_CLIENT_SECRET`.
