# Legacy data migrations — never run during fresh initialization

This directory is an archive, not an active migration directory. Do not include
it in recursive migration discovery or deployment initialization.

| File | Classification |
| --- | --- |
| 0043_formula_e_clear_unverified.sql | DELETE/UPDATE of old unverified test odds |
| 0044_formula_e_remove_draw_row.sql | DELETE of a previously malformed fixture |
| 0045_formula_e_authoritative_baseline.sql | DELETE current fixtures and INSERT historical matches/odds from an old image |
| 0046_formula_e_keep_current_six.sql | DELETE all but a previous six-fixture batch |
| 0053_formula_e_seed_line_baselines.sql | INSERT backfilled baseline odds from existing match data |

These files are retained for historical reference only. They are not a source
of current fixtures or odds. Any future execution requires an explicit,
separate data-maintenance decision and review against the target database.
