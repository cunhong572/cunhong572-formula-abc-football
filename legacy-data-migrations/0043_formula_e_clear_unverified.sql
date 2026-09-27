-- Clear the first test sync values that had no verified O/U line.
DELETE FROM formula_e_odds_snapshots s
USING formula_e_matches m
WHERE s.match_id=m.id
  AND m.selected_line IS NULL
  AND m.current_odds=1.90;

UPDATE formula_e_matches
SET current_odds=NULL,
    status='pending_source',
    source_detail='Cleared unverified odds; awaiting exact FIRST HALF O/U match.',
    updated_at=now()
WHERE selected_line IS NULL
  AND current_odds=1.90;