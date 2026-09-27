ALTER TABLE formula_d_historical_scan_state
  ADD COLUMN IF NOT EXISTS scan_in_progress BOOLEAN NOT NULL DEFAULT FALSE;