# Formula D timeline recovery

Offline verification (Node built-in test runner, no added dependencies):

```sh
node --test tests/formula-d-worker/regression.test.cjs
node --test tests/formula-d/regression.test.cjs
```

The worker suite runs the production orchestration, existing HTML fixture
parser, persistence statements and coordination boundaries with synthetic
clocks/browser/DB/scheduler doubles. No source website, real credentials,
database migration or deployment is used. The original 60 odds assertions
remain unchanged; their harness isolates the newly introduced external lease
and navigation-wait boundaries. This suite separately exercises those adapters.

## Runtime changes

- `timeline.js`: Early, known fixture date, Today fast path. Source/row/market
  failures immediately enter Early, date, Today, Favorites, then remaining odds
  entries. Each source reads a fresh DOM with the existing FIRST HALF, rightmost
  O/U, all-lines and nearest-1.88 parser; locked-line rules remain intact.
- `navigation.js`: old-document marker, changed DOM, complete/not-loading state
  and two stable observations. A stale or empty page cannot be counted as a
  completed navigation. Readiness is bounded; timeout moves to another source.
- `snapshot-store.js`: original scheduled target is persisted independently of
  actual observation time. DB uniqueness prevents duplicate formal slots;
  successful rows are immutable, explicit partial/failed rows can be repaired.
  Application and SQL gates enforce no early writes and no post-kickoff writes.
- `priority.js`, `lease.js`: T-5 > T-1 > timeline > manual > other. A shared DB
  lease serializes Formula D cloud/debug browser use. Pending higher-priority
  work causes cooperative yield, including interruption of prewarm waits.
  Heartbeats are every 10 seconds; lease expiry is 2 minutes. An in-flight
  browser operation is not forcibly killed: it yields at its next checkpoint.
  Process-loss recovery is therefore bounded by lease expiry, not instantaneous.
- Existing retry limits are unchanged. Deferrals retain the target and retry
  count; expired formal jobs stop. Per-fixture audit retains existing stages
  and adds target/capture status. The cloud response adds captureStates/attempts.

## Schema prerequisite and verification limits

`migrations/0057_formula_d_timeline_worker.sql` must be reviewed/applied before
enabling this runtime. It adds target/status columns, a unique formal-slot index
and two small coordination tables. Existing baseline uniqueness and historical
rows are retained. The earliest historical value per slot becomes canonical;
other per-line rows remain unanchored history. No migration was run here.

The SQL uniqueness/owner predicates are checked by tests with an atomic store
double. This is not a live PostgreSQL concurrency or browser-provider smoke
test; those checks remain necessary when deployment is separately authorized.
The real source site's current DOM/navigation has not been accessed or certified.

There are no A/B/C/shared-data, frontend or Excel changes. Formula D's existing
kickoff-relative T-12/hourly/T-1/T-5 schedule definitions, line selection,
gender/age matching, and retry-count rules are retained. This change does not
introduce a second wall-clock schedule or change the kickoff-relative slots.
