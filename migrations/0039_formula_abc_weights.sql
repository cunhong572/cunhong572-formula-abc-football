CREATE TABLE IF NOT EXISTS formula_abc_weight_config (
  formula_key text PRIMARY KEY,
  config_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)