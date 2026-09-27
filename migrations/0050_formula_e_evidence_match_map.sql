CREATE TABLE IF NOT EXISTS formula_e_capture_evidence_matches (
  evidence_id BIGINT NOT NULL REFERENCES formula_e_capture_evidence(id) ON DELETE CASCADE,
  match_id BIGINT NOT NULL REFERENCES formula_e_matches(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  PRIMARY KEY (evidence_id, match_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_formula_e_evidence_match_map_match
ON formula_e_capture_evidence_matches(match_id, stage);