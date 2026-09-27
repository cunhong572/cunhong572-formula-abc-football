CREATE TABLE IF NOT EXISTS formula_d_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL,
  competition TEXT,
  team_id TEXT,
  team_name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('home','away')),
  opponent_name TEXT,
  minute INTEGER NOT NULL,
  score_for INTEGER NOT NULL DEFAULT 0,
  score_against INTEGER NOT NULL DEFAULT 0,
  intent TEXT NOT NULL,
  confidence INTEGER,
  ss NUMERIC(7,2),
  attack_score NUMERIC(7,2),
  ss5 NUMERIC(7,2),
  as5 NUMERIC(7,2),
  ss10 NUMERIC(7,2),
  as10 NUMERIC(7,2),
  gti NUMERIC(7,2),
  recent5_shots INTEGER,
  recent5_xg NUMERIC(8,3),
  recent10_shots INTEGER,
  recent10_xg NUMERIC(8,3),
  total_shots INTEGER,
  total_xg NUMERIC(8,3),
  possession NUMERIC(7,2),
  red_cards INTEGER,
  substitutions INTEGER,
  prematch_intent TEXT,
  strength_tier INTEGER,
  opponent_strength_tier INTEGER,
  data_mode TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, team_name, minute)
);
CREATE INDEX IF NOT EXISTS idx_formula_d_snapshots_match_team_minute ON formula_d_snapshots(match_id, team_name, minute);
CREATE INDEX IF NOT EXISTS idx_formula_d_snapshots_intent ON formula_d_snapshots(intent);

CREATE TABLE IF NOT EXISTS formula_d_backtests (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES formula_d_snapshots(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  minute INTEGER NOT NULL,
  intent TEXT NOT NULL,
  horizon_minutes INTEGER NOT NULL,
  future_minute INTEGER,
  future_ss NUMERIC(7,2),
  future_as NUMERIC(7,2),
  future_recent5_shots INTEGER,
  future_recent5_xg NUMERIC(8,3),
  goal_delta INTEGER,
  conceded_delta INTEGER,
  behavior_score NUMERIC(7,2),
  supported BOOLEAN,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_id, horizon_minutes)
);
CREATE INDEX IF NOT EXISTS idx_formula_d_backtests_intent_horizon ON formula_d_backtests(intent,horizon_minutes);

CREATE TABLE IF NOT EXISTS formula_d_match_results (
  match_id TEXT PRIMARY KEY,
  competition TEXT,
  home_name TEXT,
  away_name TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);