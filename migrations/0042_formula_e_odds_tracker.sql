CREATE TABLE formula_e_matches (
  id BIGSERIAL PRIMARY KEY,
  input_home TEXT NOT NULL,
  input_away TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  kickoff_at TIMESTAMP WITH TIME ZONE,
  selected_line TEXT,
  current_odds NUMERIC(6,3),
  status TEXT NOT NULL DEFAULT 'pending_source',
  source_name TEXT NOT NULL DEFAULT '3573217',
  source_detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE formula_e_odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES formula_e_matches(id) ON DELETE CASCADE,
  sample_kind TEXT NOT NULL,
  selected_line TEXT,
  odds NUMERIC(6,3) NOT NULL,
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_formula_e_matches_kickoff ON formula_e_matches(kickoff_at);
CREATE INDEX idx_formula_e_snapshots_match_observed ON formula_e_odds_snapshots(match_id, observed_at DESC);
CREATE UNIQUE INDEX uq_formula_e_snapshot_kind ON formula_e_odds_snapshots(match_id, sample_kind);