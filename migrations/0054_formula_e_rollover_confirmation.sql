ALTER TABLE formula_e_matches
  ADD COLUMN IF NOT EXISTS rollover_candidate_line TEXT,
  ADD COLUMN IF NOT EXISTS rollover_candidate_odds NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS rollover_candidate_target_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rollover_candidate_count INTEGER NOT NULL DEFAULT 0;