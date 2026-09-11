-- VDRPros Vault Cloud: control plane. Documents and their search index live in the shards (Durable Objects);
-- this database holds who owns what, the inventory of paper, batches, connections and the receipt chain.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',          -- active | suspended
  plan TEXT NOT NULL DEFAULT 'vault',
  created_at INTEGER NOT NULL
);

-- People in a tenant. Roles: owner (everything), admin (people, workspaces, connections), contributor (intake),
-- reviewer (read and annotate), viewer (read). The Ricorsa connection flow finds a person by email.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',          -- active | disabled
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  UNIQUE (tenant_id, email)
);
CREATE INDEX users_email ON users(email);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  doc_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  paper_folders INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX workspaces_tenant ON workspaces(tenant_id);

-- Who may see a workspace, and how (owner | admin | contributor | reviewer | viewer). Tenant owners and admins see all.
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE matters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  caption TEXT,
  court TEXT,
  status TEXT NOT NULL DEFAULT 'open',            -- open | closed
  doc_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX matters_ws ON matters(workspace_id);

-- Search shards of a workspace. New documents go to the open shard; a shard closes when it nears its size.
CREATE TABLE shards (
  id TEXT PRIMARY KEY,                              -- "<workspace_id>:<n>"
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  docs INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',            -- open | full
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, n)
);

-- Paper inventory. A box is barcoded and located; folders inside it are barcoded too. Digitised folders point at
-- the documents that came out of them through documents.folder_id in the shards.
CREATE TABLE boxes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  matter_id TEXT REFERENCES matters(id) ON DELETE SET NULL,
  barcode TEXT NOT NULL,
  label TEXT NOT NULL,
  custodian TEXT,
  date_from TEXT,
  date_to TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'inventoried',     -- inventoried | scanning | digitised
  folder_count INTEGER NOT NULL DEFAULT 0,
  pages_est INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, barcode)
);
CREATE INDEX boxes_ws ON boxes(workspace_id);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  box_id TEXT NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paper',           -- paper | requested | scanning | digitised
  pages_est INTEGER,
  doc_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, barcode)
);
CREATE INDEX folders_box ON folders(box_id);
CREATE INDEX folders_ws_status ON folders(workspace_id, status);

-- A batch is one delivery: an electronic sync, a scanning run, or a room pushed from the VDRPros app.
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  matter_id TEXT REFERENCES matters(id) ON DELETE SET NULL,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'electronic',        -- electronic | scan | app
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',            -- open | sealed | done | failed
  files_expected INTEGER NOT NULL DEFAULT 0,
  files_received INTEGER NOT NULL DEFAULT 0,
  files_duplicate INTEGER NOT NULL DEFAULT 0,
  files_done INTEGER NOT NULL DEFAULT 0,
  files_failed INTEGER NOT NULL DEFAULT 0,
  files_awaiting_ocr INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  manifest_key TEXT,
  intake_key_hash TEXT,                           -- the batch's own upload key (hashed), for the uploader
  seal TEXT,                                      -- sha256 over the sorted file hashes, set when sealed
  created_by TEXT,
  created_at INTEGER NOT NULL,
  sealed_at INTEGER,
  done_at INTEGER
);
CREATE INDEX batches_ws ON batches(workspace_id, created_at);

-- The receipt chain: one hash-linked line per event that matters to custody, per tenant.
CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,                             -- batch.opened | file.received | file.duplicate | batch.sealed | doc.indexed | doc.failed | connection.created | connection.revoked | scan.requested | ...
  subject TEXT,                                   -- the id the receipt is about
  hash TEXT NOT NULL,                             -- sha256(prev_hash + canonical detail)
  prev_hash TEXT,
  detail TEXT NOT NULL,                           -- canonical JSON
  at INTEGER NOT NULL,
  UNIQUE (tenant_id, seq)
);
CREATE INDEX receipts_subject ON receipts(subject);

-- Outside clients (Ricorsa) connected by a person of the tenant, limited to chosen workspaces.
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,                           -- ricorsa
  external_user TEXT,                             -- the client's own id for the person
  label TEXT,
  workspace_ids TEXT NOT NULL,                    -- JSON array
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',          -- active | revoked
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX connections_user ON connections(user_id);

-- One-time codes for the connection flow: emailed to the person, checked once, then spent.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  client TEXT NOT NULL,
  external_user TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Requests to digitise a folder (or a whole box) that is still on paper.
CREATE TABLE scan_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  box_id TEXT REFERENCES boxes(id) ON DELETE CASCADE,
  requested_by TEXT,                              -- user id or connection id
  via TEXT NOT NULL DEFAULT 'vault',              -- vault | ricorsa
  note TEXT,
  status TEXT NOT NULL DEFAULT 'requested',       -- requested | scanning | done | declined
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX scan_requests_ws ON scan_requests(workspace_id, status);

-- Files the pipeline could not finish, with the reason, so nothing is dropped silently.
CREATE TABLE dead_letters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  batch_id TEXT,
  doc_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX dead_letters_ws ON dead_letters(workspace_id);

-- Every read through a connection, so the customer's audit covers what a client read on a person's behalf.
CREATE TABLE access_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  connection_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,                           -- search | read | link | list | scan_request
  doc_id TEXT,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX access_log_conn ON access_log(connection_id, at);
