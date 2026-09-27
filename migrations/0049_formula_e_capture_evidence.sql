CREATE TABLE IF NOT EXISTS formula_e_capture_evidence (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scan_reason TEXT,
  mode TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  found_count INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_formula_e_capture_evidence_time
ON formula_e_capture_evidence(captured_at DESC);