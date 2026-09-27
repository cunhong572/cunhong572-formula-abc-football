CREATE TABLE IF NOT EXISTS formula_usage_daily (
  usage_date date NOT NULL,
  category text NOT NULL,
  bytes_used bigint NOT NULL DEFAULT 0,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_date, category)
)