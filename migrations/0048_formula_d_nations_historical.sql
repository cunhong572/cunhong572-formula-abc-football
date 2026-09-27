CREATE TABLE IF NOT EXISTS formula_d_nations_historical_scan_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  phase INTEGER NOT NULL DEFAULT 1,
  cursor_date DATE NOT NULL DEFAULT '2022-06-01',
  status TEXT NOT NULL DEFAULT 'pending',
  days_scanned INTEGER NOT NULL DEFAULT 0,
  matches_seen INTEGER NOT NULL DEFAULT 0,
  matches_processed INTEGER NOT NULL DEFAULT 0,
  snapshots_created INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO formula_d_nations_historical_scan_state(id,phase,cursor_date,status)
VALUES(1,1,'2022-06-01','pending')
ON CONFLICT(id) DO NOTHING;