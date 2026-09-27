# Shared data regression coverage and migration report

Run the offline suites:

```sh
node --test tests/shared-data/*.test.cjs
node --test tests/formula-a/*.test.cjs
node --test tests/formula-b/*.test.cjs
node --test tests/formula-c/*.test.cjs
node --test tests/formula-d/*.test.cjs
```

Final results: shared-data **50/50**, A **50/50**, B **70/70**, C **84/84**,
D **60/60 PASS**. No live requests, credentials, database writes or deployment
are involved. Existing assertions remain unchanged. Formula A's VM loader only
adds the shared-data import namespace. One integration run exposed a legacy
import-path whitelist error; pointing the shared strength module directly at
the shared resolver resolved it, after which all suites passed.

## Modules and consumers

- competition-resolver.js: fixture competition identity, missing/ambiguous
  diagnostics, scoped standings-root selection and shared competition detection.
- team-resolver.js: the original alias/resolution implementation, now shared;
  explicit gender/age identity gates prevent senior/women/U19/U21/U23 crossover.
  The historical lib/team-resolver.js remains a compatibility export.
- standings-provider.js: one interface for team-scoped or league-scoped payloads,
  normalized rows, group selection, rank/points and diagnostics. A retains its
  strict labelled team-table validation; B retains a league-bound singleton
  response when the request explicitly identifies the competition. There is no
  fallback to an unrelated domestic or first standings table.
- schedule-provider.js: cached underlying team payload, chronological partitions
  and configurable views. A keeps all competitions and supplemental-provider
  merging; B keeps its next-three pressure window, Nations next-six filtering
  and full European schedule source. Intent rules and expected game counts stay
  with their formula modules.
- fixture-normalizer.js: common fixture identity, pairing and compatible A/B
  output projections. Existing display shapes are retained.
- timezone.js: verified kickoff date/zone/diagnostic interface, reusing Formula
  A's existing pure date implementation so no browser bundle or layout changes
  are required. A's UTC-crossing behavior remains protected by regression tests.
- strength-provider.js: the sole strength configuration and shared B/C input
  interpretation. Italy and Croatia stay Good. No second C strength table exists.
- match-context-provider.js: competition, teams, kickoff, standings, schedule,
  strength, rest-day facts and supplied qualification/relegation context. Missing
  qualification rules are explicitly unverified, never fabricated. A/B consume
  the shared schedule/context; C's compatible pre-match adapter uses the same
  module and Formula B's legacy-compatible endpoint.
- cache.js: in-process short TTLs, concurrent request deduplication, cloning,
  explicit invalidation and forceRefresh. Failed loads are not cached.

## Freshness and intentional access changes

Standings TTL is 30 seconds. Team payload/schedule and C pre-match-context TTL
are 15 seconds. Provider keys include the full path/competition identifier.
C pre-match cache keys are authentication-scoped in memory only. Completed-match
notifications invalidate affected team/league caches and pre-match context;
TTL also bounds freshness if no completion notification arrives. Neither a
persistent database cache nor cross-worker synchronization is introduced.

The data-access changes are intentional: fewer repeated queries, bounded cache
reuse, shorter C pre-match caching than the previous ten minutes, and rejection
of cross-age/gender candidates (including A supplemental lookups). Final
acceptance also removes an unused B first-table helper and routes C live fixture
name matching through shared identity, rejecting substring-only team matches. Formula
business rules, output schemas, frontend and Excel layout are unchanged. Existing
A team-feed and B league-feed provenance are preserved behind the common
standings interface; this does not claim their upstream snapshots are always
identical or independently certify official source freshness.

## Physical line reductions relative to branch HEAD

These are net reductions in pre-existing formula files, including removed dead
copies of old lookup helpers, not the total size of the new shared layer:

| Area | Before | After | Reduction |
|---|---:|---:|---:|
| A auto-fill | 289 | 187 | 102 |
| B adapter/context/standings/strength/worksheet modules | 525 | 275 | 250 |
| C live adapter and match context | 529 | 491 | 38 |
| Historical shared team-resolver adapter | 162 | 3 | 159 |

Nine new production modules plus this report and regression suite are added.
No Formula A browser-source modules, Formula B/C intent-rule engines, Formula D
odds modules, public assets or migrations were modified. Syntax checks and
`git diff --check` passed. Merge and deployment are outside this change.
