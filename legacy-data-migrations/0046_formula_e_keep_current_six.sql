-- The user replaced the Formula E batch with six new fixtures.
-- Older rows must not remain mixed into the current tracker.
DELETE FROM formula_e_matches
WHERE id NOT IN (
  SELECT id FROM formula_e_matches ORDER BY id DESC LIMIT 6
);