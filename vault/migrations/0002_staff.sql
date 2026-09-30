-- Staff accounts for the admin screens: SMEPro's own people sign in with an email and a password of their own.
-- The staff key (ADMIN_KEY) remains as the way to create the first owner account and as the recovery path.
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',            -- owner (manages staff) | staff
  status TEXT NOT NULL DEFAULT 'active',         -- active | disabled
  password_hash TEXT,                            -- pbkdf2$<iterations>$<salt>$<hash>, base64url
  must_change INTEGER NOT NULL DEFAULT 0,        -- 1 after a temporary password: the next sign-in has to set a new one
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,                          -- after too many wrong passwords, sign-in waits until this time
  password_changed_at INTEGER,                   -- sessions issued before this moment are no longer valid
  last_sign_in_at INTEGER,
  created_by TEXT,                               -- staff id, or 'key' for the first account
  created_at INTEGER NOT NULL
);

-- What staff did to staff: sign-ins, accounts created, passwords reset, roles and status changed.
CREATE TABLE staff_log (
  id TEXT PRIMARY KEY,
  staff_id TEXT,
  email TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX staff_log_at ON staff_log(at);
