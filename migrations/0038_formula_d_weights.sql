CREATE TABLE IF NOT EXISTS formula_d_weight_config (
  singleton_key text PRIMARY KEY,
  config_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)