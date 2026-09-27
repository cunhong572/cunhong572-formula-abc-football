CREATE TABLE IF NOT EXISTS formula_d_historical_scan_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cursor_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  days_scanned INTEGER NOT NULL DEFAULT 0,
  matches_seen INTEGER NOT NULL DEFAULT 0,
  matches_processed INTEGER NOT NULL DEFAULT 0,
  snapshots_created INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO formula_d_historical_scan_state(id,start_date,end_date,cursor_date,status)
VALUES(1,'2024-07-01','2026-06-30','2024-07-01','running')
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS formula_d_historical_matches (
  match_id TEXT PRIMARY KEY,
  match_date DATE,
  season_label TEXT,
  competition TEXT,
  home_name TEXT,
  away_name TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  data_quality TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_formula_d_hist_matches_date ON formula_d_historical_matches(match_date);

CREATE TABLE IF NOT EXISTS formula_d_historical_snapshots (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES formula_d_historical_matches(match_id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  opponent_name TEXT,
  side TEXT NOT NULL,
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
  recent5_shots INTEGER,
  recent5_xg NUMERIC(8,3),
  recent10_shots INTEGER,
  recent10_xg NUMERIC(8,3),
  red_cards INTEGER,
  substitutions INTEGER,
  data_quality TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id,team_name,minute)
);
CREATE INDEX IF NOT EXISTS idx_formula_d_hist_snap_intent ON formula_d_historical_snapshots(intent);

CREATE TABLE IF NOT EXISTS formula_d_historical_backtests (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES formula_d_historical_snapshots(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  minute INTEGER NOT NULL,
  intent TEXT NOT NULL,
  horizon_minutes INTEGER NOT NULL,
  future_minute INTEGER,
  future_ss NUMERIC(7,2),
  future_as NUMERIC(7,2),
  goal_delta INTEGER,
  conceded_delta INTEGER,
  behavior_score NUMERIC(7,2),
  supported BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_id,horizon_minutes)
);
CREATE INDEX IF NOT EXISTS idx_formula_d_hist_bt_intent ON formula_d_historical_backtests(intent,horizon_minutes);