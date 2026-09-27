-- Remove the malformed Formula E fixture created when the sportsbook's
-- 1X2 Draw label was mistaken for a team. Related odds snapshots cascade.
DELETE FROM formula_e_matches
WHERE lower(trim(input_home)) = 'draw'
   OR lower(trim(input_away)) = 'draw';