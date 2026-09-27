# Formula C live-intent regression coverage

Run offline:

```sh
node --test tests/formula-c/*.test.cjs
node --test tests/formula-a/*.test.cjs
node --test tests/formula-b/*.test.cjs
node --test tests/formula-d/*.test.cjs
```

Final results: **C 84/84, A 50/50, B 70/70, D 60/60 PASS**.
The original baseline was 42 tests with 13 locked-rule failures; all are resolved.

## Runtime and isolation

Formula C still uses the historical names api/formula-d-live.js,
api/formula-d.js and lib/formula-d-engine.js. Tests execute actual production
functions using the existing VM loader, with a syntax-only adapter for the
manual route's two exports on one line. The live provider route and its cached
response are exercised with in-memory provider responses and snapshot stubs.
Unexpected requests fail; no real network, credentials, database, migration,
roster refresh or learning writes are used. Learning snapshot serialization is
covered separately. No deployment, commit or push occurred.

## Final locked behavior

Final intent is exactly one of Must Win, Want Win, Hope Win, Don't Lose, Equalize.
---, Win Big and Give Up are excluded, including old input labels and missing
feed cases. realtimeEvidence separately reports available, limited or unavailable.
Known pre-match/hard targets precede dynamic execution evidence. Quiet attacks
cannot erase an Equalize target or mechanically downgrade a leading Want Win.
Hard mandatory goals survive missing data; pressure alone cannot create them.

If no usable directional goal remains, the conservative context fallback is
Equalize when trailing, Don't Lose for a draw at minute 85 or later, and Hope Win
otherwise. This inferred goal is marked limited/unavailable with low confidence;
unknown strength alone cannot upgrade it. Missing-feed confidence remains 40
regardless of advancing time. Strength plus actual lineup constraints can affect
capability while a single ordinary yellow cannot force a category change.

The user explicitly authorized retiring the obsolete ten-minute-GTI assertion
and the --- sentinel. The old quiet/low-xG trailing assertions were correspondingly
updated to preserve Equalize as a limited-evidence fallback. No failure was skipped.

## Rolling evidence and boundaries

Timestamped observations enter only [clock-5, clock]. Tests cover exactly five
minutes, five minutes plus 0.001 seconds, and future events. The shot parser,
SS/AS/GTI pipeline and tactical evidence all exercise these boundaries.
45+1, 45+3 and 90+5 normalize to 46, 48 and 95 consistently for the clock,
window, event sorting and substitution timing.

Only recent5 inputs affect current SS/AS/GTI. Historical ten-minute display
fields do not affect current metrics or decisions. Old substitutions, yellow
cards and formation/committed-player changes expire as dynamic evidence. A red
card's persistent player-disadvantage remains lineup context, distinct from a
recent red-card event. Attacking/defensive/balanced substitutions, normalized
progression quality, formations, committed numbers and red/yellow evidence
are covered. Timestamp-free yellow totals are context, not invented recent events.

Caller-supplied recent5/normalized aggregates are treated as five-minute inputs;
explicit stale evidenceMinute is rejected. Offline tests cannot certify the
provenance or freshness of a real provider's preaggregated values.

## Change scope

The preceding minimal fixes changed the two historical live API routes,
lib/formula-d-engine.js and the new pure lib/formula-c-live-evidence.js helper.
Formula A/B production logic, Formula D odds modules, frontend and Excel layout
are untouched. Existing endpoints remain compatible, with realtimeEvidence added
to each side of the provider response (also retained in cached responses).


## Formula C module extraction

All nine requested modules now live under lib/formula-c/: match-context.js,
score-time-state.js, lineup-state.js, rolling-window.js, tempo-metrics.js,
live-evidence.js, intent-rules.js, intent-engine.js and learning-backtest.js.

Each extraction ran the unchanged suites: C 84/84, A 50/50, B 70/70, D 60/60.
No test failed during extraction and no assertions were edited. Syntax and
whitespace checks passed. An additional 960-case comparison against a snapshot
of the pre-extraction core matched complete outputs (intent, confidence,
reasons, metrics, signals, context and diagnostics). Dependency traversal
confirmed the live intent engine cannot import learning/backtest code.

Rule priority remains mandatory unmet target, trailing goal, known pre-match
goal with capability context, satisfied hard target, observed support, then
conservative context fallback. Score, normalized clock, shared strength inputs,
lineup and evidence feed those rules without a duplicate strength table.
Quantitative metrics contain no final intent classification. Database snapshot
and historical backtest work remain behind the historical learning adapter and
are never invoked by the pure live intent engine.

Physical line reductions measured against the start of THIS extraction turn:
- lib/formula-d-engine.js: 179 -> 6 (173 fewer).
- lib/formula-c-live-evidence.js: 45 -> 4 (41 fewer).
- lib/formula-d-learning.js: 117 -> 3 (114 fewer).

These files retain compatibility exports. Live API routes and output fields,
frontend/Excel files and database schema were not changed during extraction.
The overall uncommitted Git diff still includes the earlier authorized fixes
and tests; it should not be confused with the scope of this extraction alone.
