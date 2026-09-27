CREATE TABLE IF NOT EXISTS formula_e_cloud_state (
  singleton_key text PRIMARY KEY DEFAULT 'main',
  enabled boolean NOT NULL DEFAULT true,
  credential_status text NOT NULL DEFAULT 'missing',
  last_status text,
  last_message text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_found integer NOT NULL DEFAULT 0,
  last_saved integer NOT NULL DEFAULT 0,
  last_source_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
)