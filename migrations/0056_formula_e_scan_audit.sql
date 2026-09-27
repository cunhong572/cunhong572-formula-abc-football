CREATE TABLE IF NOT EXISTS formula_e_scan_audit (
  id bigserial PRIMARY KEY,
  match_id bigint,
  home text NOT NULL,
  away text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  stage text,
  detail text,
  selected_line text,
  odds numeric,
  kickoff_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)