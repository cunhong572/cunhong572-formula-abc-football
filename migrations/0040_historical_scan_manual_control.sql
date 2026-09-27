ALTER TABLE formula_d_historical_scan_state
  ADD COLUMN IF NOT EXISTS manual_enabled BOOLEAN NOT NULL DEFAULT FALSE;