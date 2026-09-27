# Formula D odds V263 regression tests

Run from the repository root with Node 24 (no installation required):

```sh
node --test tests/formula-d/regression.test.cjs
```

The production module retains its historical `formula-e` filename. Tests load
the checked-in JavaScript into isolated Node VM contexts. Imports are replaced
by test bindings in memory, exports are exposed for inspection, and selected
I/O functions are replaced inside the VM only. The harness never rewrites
production files; the reviewed runtime fixes remain in the checked-in module.
No network clients, real credentials, database connections, migrations or
Hatchable services are used. Unmocked external operations throw immediately.

## Fixtures and coverage

Twenty-three fixed HTML fixtures cover normal first-half markets, simultaneous
full-time/first-half columns, decimal and split quarter lines, multiple prices,
ties in both visual orders, neighboring matches, similar names, missing
fixtures, cross-fixture team pairs, gender/age identity and ordinary club
affixes. All fixture data is synthetic and offline. The minimal DOM adapter supports only the selectors used by the
current extractor and fixed explicit geometry. Tests execute the real
`extract` callback, including row matching, market parsing and odds selection;
they do not duplicate its business rules in the adapter.

Other tests exercise actual retry/handler functions, capture windows, snapshot
write decisions through a recording DB fake, cloudScan status computation,
prewarm waits through a virtual clock, and per-fixture audit parameters.

## Locked business rules and minimal runtime fixes

- Gender and youth markers remain part of team identity; FC/AFC/CF/SC
  affixes can still normalize. Tests cover England/Switzerland Women, W,
  女足 and U21/U23/U19, plus an explicitly matching women's fixture.
- T-5min eligibility starts exactly five minutes before kickoff and ends
  strictly before kickoff. Future retry anchors cannot authorize early saves.
- Actual snapshot writes are tested at 5:00.001, 5:00.000, 4:59.999,
  kickoff and post-kickoff; T-1hr writes at 60:00.001, 60:00.000 and 59:59.999.
- The pure `canWriteSnapshot` gate checks both sample and write time. The
  official scheduler prewarm still waits until the checkpoint before reading.

The original three failing assertions are retained unchanged and now pass.
The former characterization test of the symmetric T-5 window was updated
to the newly authorized one-way business window, not skipped or disabled.

## Limits

The fixtures cannot prove real browser layout, cross-origin iframe access,
dynamic rendering, navigation or live site compatibility. A scheduler fake
verifies one enqueue per batch attempt and stable names, but cannot prove
Hatchable's distributed task deduplication. Recording DB fakes verify SQL
intent, not PostgreSQL constraints, transactions or persistence. Status tests
stub browser acquisition and saves; audit classification is tested separately
with representative diagnostics, not every live failure mechanism. No claims
are made about real credential login or online end-to-end behavior.

Full local run: 60 tests, 60 pass, 0 fail, 0 skipped.
