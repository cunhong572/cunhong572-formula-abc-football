CREATE TABLE IF NOT EXISTS formula_e_structure_learning (
  profile_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  frame_count INTEGER NOT NULL DEFAULT 0,
  event_rows INTEGER NOT NULL DEFAULT 0,
  market_blocks INTEGER NOT NULL DEFAULT 0,
  ou_headers INTEGER NOT NULL DEFAULT 0,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_formula_e_structure_learning_mode
ON formula_e_structure_learning(mode, successes DESC, last_seen_at DESC);