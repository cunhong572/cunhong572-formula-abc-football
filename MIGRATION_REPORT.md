# V263 migration report

Source: `C:/Users/Danny/Downloads/V263_Hatchable_Export`.
Target branch: `migration/v262-baseline`.
Baseline commit: `4ea8406940ff6c9c4ebd54b1dbc1da6d6bc23677`.

No deployment, main update, commit, database connection or SQL execution is
part of this migration. The export is kept unchanged.

## Files

84 exported additions are synchronized: api (30), lib (13), public (16),
hatchable.toml (1), active migrations (20), and archived migrations (5).
There are 20 active SQL
files total, of which 17 are schema-only and 3 include harmless state seeds.
README.md replaces the previous Railway README with the exported Hatchable
README. Three migration-support files are added: .gitignore, this report,
and legacy-data-migrations/README.md. Total: 87 new files, 1 modified file.

## Retained old files (7)

All are unchanged: app.py, requirements.txt, Procfile, railway.toml,
rules_config.json, README_正式版.txt, Formula_ABC_GitHub_Upload.zip.
The Python implementation and business rules remain a comparison/rollback
reference; functional equivalence with V263 has not been established.
Railway settings still start the old Python application and must be reviewed
in a later deployment task. The existing tracked ZIP remains tracked despite
the new ignore rule; it was not removed or re-added.

## Every migration containing data statements

| Migration | Treatment and reason |
| --- | --- |
| 0034_shared_site_access.sql | Remove the entire account INSERT; retain tables and index. No placeholder credential rows. |
| 0036_formula_d_historical.sql | Keep singleton scan-state INSERT: zero counters and a configured historical scan date range, no match results/odds/credentials. Later 0040 defaults manual_enabled to false. |
| 0037_formula_d_players.sql | Keep id-only singleton INSERT; all other fields use non-sensitive scan defaults. |
| 0043_formula_e_clear_unverified.sql | Archive: temporary DELETE/UPDATE of old test odds. |
| 0044_formula_e_remove_draw_row.sql | Archive: DELETE of old malformed matches. |
| 0045_formula_e_authoritative_baseline.sql | Archive: DELETE and INSERT of historical fixtures/odds. |
| 0046_formula_e_keep_current_six.sql | Archive: DELETE for an old batch. |
| 0048_formula_d_nations_historical.sql | Keep pending singleton scan-state INSERT; date is a scan cursor, not historical match data. |
| 0053_formula_e_seed_line_baselines.sql | Archive: INSERT backfill of old baseline odds. |

Other SQL files contain structure only. ON DELETE CASCADE is a foreign-key
constraint, not a data cleanup statement. 0051 drops the old unique index;
0052 creates its per-line replacement. Keep both structural migrations.
Only migrations/ belongs in new-environment initialization; exclude
legacy-data-migrations/ entirely.

## Credentials and later initialization

Removed from 0034: shared account name, shared password hash, admin account
name, admin password hash, and their entire initialization INSERT. No actual
values are reproduced in this report or the legacy archive.

No account is usable by default. Existing authentication fails closed when
the singleton configuration is missing. Before a later deployment, provision
site_access_config using a trusted server-side administrator setup and
parameterized SQL, taking new account names/passwords from that environment's
secret store. The existing authentication expects lowercase hexadecimal
SHA-256 password hashes. Use singleton_key main, password_version 1 and an
appropriate max_sessions value (the previous default was 2). Do not paste
credentials or hashes into tracked SQL, source, reports or shell history.
This sync does not implement an automatic environment bootstrap.

hatchable.toml retains only the exported secret declarations, not real values.
Its exported expose=true settings remain unchanged and require platform-level
review before deployment. No new secret values were introduced.

.gitignore excludes environment files, local databases/dumps, credentials,
caches, logs, export ZIPs, temporary directories and local screenshots.
Ignore rules do not untrack files already in Git.

## Validation

- All 54 JavaScript files passed `node --check`, including bundled libraries.
- 84 unmodified export files match the source byte-for-byte at their target
  paths; 0034 differs only by removing the account INSERT and adding comments.
- All 7 retained old files have no Git diff against HEAD. An initial raw-byte
  comparison encountered checkout line-ending differences; Git's comparison
  confirms no tracked-content change.
- The four original account-name/hash values are absent from all newly
  synchronized source, SQL, configuration and report files.
- A mocked empty database test confirms shared login reports missing
  configuration, admin login returns false, and an empty token is rejected.
- All 9 sampled environment/database/cache/log/ZIP/temp/screenshot/credential
  paths are ignored. Git reports 87 new files and one modified README.
- `git diff --check` passed. Active SQL data statements occur only in the
  three documented default scan-state migrations.

No Hatchable runtime or PostgreSQL service is available locally for this
validation. SQL has been reviewed but not executed; platform integration,
database initialization and full application behavior remain untested.
