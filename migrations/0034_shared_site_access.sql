CREATE TABLE IF NOT EXISTS site_access_config (
  id BIGSERIAL PRIMARY KEY,
  singleton_key TEXT NOT NULL UNIQUE,
  shared_username TEXT NOT NULL,
  shared_password_hash TEXT NOT NULL,
  admin_username TEXT NOT NULL,
  admin_password_hash TEXT NOT NULL,
  password_version INTEGER NOT NULL DEFAULT 1,
  max_sessions INTEGER NOT NULL DEFAULT 2 CHECK (max_sessions >= 1 AND max_sessions <= 20),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_access_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  password_version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_access_tokens_expires_at ON site_access_tokens(expires_at);

-- No default accounts or credential hashes are shipped. See MIGRATION_REPORT.md.
-- Provision site_access_config through a trusted server-side setup before login.
