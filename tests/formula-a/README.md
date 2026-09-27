# Formula A offline regression suite

Run from the repository root:

```sh
node scripts/build-formula-a.cjs --check
node --test tests/formula-a/regression.test.cjs
node --test tests/formula-d/regression.test.cjs
```

No new packages, live network calls, credentials, database operations or
migrations are needed. The API harness injects synthetic team/fixture data;
the browser harness executes the production app's calculation/export functions.
The existing JSZip library generates real XLSX ZIP bytes. A limited XML DOM
adapter supports the worksheet operations used by the exporter. Tests inspect
the resulting OOXML, not screenshots or native Excel print preview.

`v263-baseline.json` was captured before refactoring. Its API contract and all
uncompressed XLSX member hashes remain locked. For the worksheet, only the
newly authorized print metadata is removed before comparing its original
hash; cell coordinates, values, style references, row heights, column widths,
merges and other existing metadata must still match. Styles and the embedded
template remain byte-identical to the baseline. Separate assertions require
fitToPage=1, fitToWidth=1, fitToHeight=1 and preservation of orientation.

## Current scope

Large-scale extraction is paused at the user's request. Four small shared
modules already exist: fatigue-days, coach-style, standings and form. A
dependency-free build script emits the classic browser bundle from these same
sources. Keep that bundle current using `node scripts/build-formula-a.cjs`.
No API routes changed. No schedule/model/export module extraction is underway.

The three original characterization findings are now intentional fixes:

- Dates use the fixture/status/venue/competition IANA timezone, or an explicit
  local offset timestamp. Consistent competition timezone metadata can fill a
  missing fixture zone. A Z timestamp alone is not evidence of venue timezone.
  Unknown/invalid zones produce a typed 422 diagnostic instead of guessing.
  Provider date-only calendar dates remain unchanged. Absolute timestamps are
  still used to order fixtures; converted calendar dates feed Days calculations.
- Standings must uniquely match the current fixture's league ID, using the
  table's leagueId, data.leagueId or id metadata. Missing/unidentified/ambiguous
  tables produce a typed 422 diagnostic. No domestic-table fallback is silent.
- Excel now explicitly fits one page. The actual template omitted orientation;
  its default portrait is made explicit. Existing explicit landscape is retained.
  Only print metadata changes; no cell/layout/style changes are permitted.

Upstream data must contain enough trustworthy metadata to select the local
timezone and competition. Tests do not certify real provider availability or
the accuracy of upstream official rankings. Native Excel/browser visual
rendering and online data-provider integration are not exercised here.

Current result: Formula A 50/50 PASS; Formula D 60/60 PASS.
