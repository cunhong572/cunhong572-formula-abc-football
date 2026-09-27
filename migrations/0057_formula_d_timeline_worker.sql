-- Schema only. Apply before enabling this worker; never executed by runtime.
ALTER TABLE formula_e_odds_snapshots
  ADD COLUMN IF NOT EXISTS target_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_status text;

-- Preserve historical rows. Only the earliest existing value becomes the
-- canonical formal slot; other per-line history remains unanchored history.
WITH anchors AS (
  SELECT s.id,s.match_id,s.sample_kind,s.observed_at,
    m.kickoff_at - CASE
      WHEN s.sample_kind='last_5min' THEN interval '5 minutes'
      WHEN s.sample_kind='last_1hr' THEN interval '1 hour'
      ELSE substring(s.sample_kind from '^t([0-9]+)h$')::int * interval '1 hour'
    END AS target
  FROM formula_e_odds_snapshots s JOIN formula_e_matches m ON m.id=s.match_id
  WHERE s.target_at IS NULL AND m.kickoff_at IS NOT NULL
    AND (s.sample_kind IN ('last_5min','last_1hr') OR s.sample_kind ~ '^t[0-9]+h$')
), ranked AS (
  SELECT *,row_number() OVER(PARTITION BY match_id,target,sample_kind ORDER BY observed_at,id) AS n FROM anchors
)
UPDATE formula_e_odds_snapshots s SET target_at=r.target,capture_status='captured_exact'
FROM ranked r WHERE r.id=s.id AND r.n=1 AND NOT EXISTS (
  SELECT 1 FROM formula_e_odds_snapshots x WHERE x.match_id=r.match_id AND x.target_at=r.target AND x.sample_kind=r.sample_kind
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_formula_e_formal_slot
  ON formula_e_odds_snapshots(match_id,target_at,sample_kind) WHERE target_at IS NOT NULL;
-- Baseline/legacy line history retains its former uniqueness. Formal slots
-- use the target key, including when kickoff is later rescheduled.
DROP INDEX IF EXISTS uq_formula_e_snapshot_line_kind;
CREATE UNIQUE INDEX IF NOT EXISTS uq_formula_e_legacy_line_kind
  ON formula_e_odds_snapshots(match_id,selected_line,sample_kind) WHERE target_at IS NULL;

ALTER TABLE formula_e_scan_audit
  ADD COLUMN IF NOT EXISTS target_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_status text;

CREATE TABLE IF NOT EXISTS formula_e_worker_requests (
  task_key text PRIMARY KEY,
  priority integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS formula_e_browser_lease (
  singleton_key text PRIMARY KEY,
  owner text NOT NULL,
  priority integer NOT NULL,
  expires_at timestamptz NOT NULL
);
