-- The user supplied this image as the authoritative Formula E baseline.
-- Replace only the current Formula E batch, preserving the exact row order,
-- kickoff time, O/U line and initial Over odds shown in that image.
DELETE FROM formula_e_matches;

INSERT INTO formula_e_matches
  (input_home,input_away,normalized_key,kickoff_at,selected_line,current_odds,status,source_detail)
VALUES
  ('Cheltenham Town','Exeter City','cheltenhamtown__exetercity','2026-09-23 02:00:00+08','1/1.5',2.05,'active','User-authoritative Formula E baseline image.'),
  ('Chesterfield','Port Vale','chesterfield__portvale','2026-09-23 02:00:00+08','1/1.5',2.05,'active','User-authoritative Formula E baseline image.'),
  ('Gillingham','Cambridge United','gillingham__cambridgeunited','2026-09-23 02:00:00+08','1',1.92,'active','User-authoritative Formula E baseline image.'),
  ('Milton Keynes Dons','Crawley Town','miltonkeynesdons__crawleytown','2026-09-23 02:00:00+08','1/1.5',1.65,'active','User-authoritative Formula E baseline image.'),
  ('Notts County','Grimsby Town','nottscounty__grimsbytown','2026-09-23 02:00:00+08','1',1.70,'active','User-authoritative Formula E baseline image.');

INSERT INTO formula_e_odds_snapshots(match_id,sample_kind,selected_line,odds)
SELECT id,'baseline',selected_line,current_odds
FROM formula_e_matches;