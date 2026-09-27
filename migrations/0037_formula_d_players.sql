CREATE TABLE IF NOT EXISTS formula_d_players (
  player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  team_id TEXT,
  team_name TEXT,
  position_code TEXT,
  position_group TEXT,
  role_class TEXT,
  market_value_eur BIGINT,
  market_value_text TEXT,
  source TEXT NOT NULL DEFAULT 'FotMob',
  roster_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value_updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_formula_d_players_team ON formula_d_players(team_id);
CREATE INDEX IF NOT EXISTS idx_formula_d_players_name ON formula_d_players(LOWER(player_name));
CREATE INDEX IF NOT EXISTS idx_formula_d_players_role ON formula_d_players(role_class);

CREATE TABLE IF NOT EXISTS formula_d_roster_scan_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  cursor_competition INTEGER NOT NULL DEFAULT 0,
  cursor_team INTEGER NOT NULL DEFAULT 0,
  teams_scanned INTEGER NOT NULL DEFAULT 0,
  players_known INTEGER NOT NULL DEFAULT 0,
  values_known INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO formula_d_roster_scan_state(id) VALUES(1) ON CONFLICT(id) DO NOTHING;