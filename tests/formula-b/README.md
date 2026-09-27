# Formula B characterization and locked-rule regression tests

Run from the repository root:

```sh
node --test tests/formula-b/*.test.cjs
node --test tests/formula-a/regression.test.cjs
node --test tests/formula-d/regression.test.cjs
```

The tests execute current production functions in isolated VM contexts, reusing
the existing loader. All provider responses are synthetic; network, database,
credentials and deployment are unavailable.

## Original entry points before fixes

The UI and batch code call `/api/formula-b`. That route currently returns only
rank, fatigue, density, form and next-three fixtures. The intent implementation
identifies itself as “Formula B Master Rules” but lives in `api/formula-c.js`.
The suite tests BOTH explicitly; passing the latter is not evidence that the
Formula B route exposes those features. Real canonicalTeam normalization is
used for the national-team strength examples.

## Original characterization result: 56 tests, 40 pass, 16 fail

Failures preserve the user's requested rules as executable assertions:

1. Croatia is Elite instead of Good (Italy correctly remains Good).
2. Same-tier current opponent and Elite/Good next-two opportunity window returns
   Hope Win rather than Want Win.
3. Unknown competition format can still return Want Win.
4. A two-tier advantage can force Want Win without independent strong evidence.
5. There is no consumed verified market-odds input; an explicit synthetic 4.10
   away-price example does not constrain Want Win. The supplied evidence fields
   are prospective test inputs, not a documented existing API contract. This is
   a missing capability, not proof that a supported field was parsed incorrectly.
6. Nations League mathematical need returns Must Win despite insufficient ability.
7. The same early Must Win return bypasses missing strength information.
8. Nations League inherits the domestic away-one-tier ceiling rather than its
   requested strength-priority rule.
9. League A is lost when it exists only in group metadata, not competition name.
10–11. Europa/Conference incomplete schedules have no explicit diagnostic.
12. Missing competition rank falls back to a domestic ranking (the fallback is
    labelled in rankSource, but violates the no-other-competition requirement).
13. Density counts a tight second interval even if the first interval is loose.
14–16. Actual Formula B route has no intent, returns three rather than six
    Nations League fixtures, and lacks the two-short-gaps very-tired category.

No failing assertions are skipped, marked TODO or relaxed. Tests do not validate live provider
data against official tables, actual Excel rendering or network availability.
The complete 8/6 schedules and 36-team tables are tested using fixed full inputs;
separate red tests identify missing-data diagnostics. Existing web/Excel layouts
remain untouched.


## Current minimal fixes

The outdated opportunity assertion was corrected with explicit user approval.
Fourteen additional tests cover the
strict opportunity condition, cross-competition exclusion, mandatory-points
ability checks, the away-price boundary, both route adapters and diagnostics.
Current result: 70 tests, 70 pass, 0 fail. No original failure remains.

The final locked opportunity rule requires a same-tier current opponent and
two subsequent same-league opponents that are BOTH stronger, including Elite
and Good. Middle qualifies; Good does not. Both future-opponent orders are
covered. The isolated Good scenario remains Hope Win. Production logic was
not changed for this test correction; no tests are skipped.

The shared pre-match implementation is in lib/formula-b-engine.js. Formula B
is the formal entry and formula-c remains a historical compatible entry. The B
response retains render fields (including string form), adds intent, diagnostic
and context fields, and adds formResults for the array representation. Missing
current-competition standings now produce null rank and diagnostics instead of
a domestic fallback. No frontend or Excel layout files are changed.

Formula A: 50/50 pass. Formula D: 60/60 pass. No live data, migration or deployment
is exercised. Provider-sourced table freshness and official provenance cannot
be certified by these offline synthetic fixtures.

## Module extraction

The engine is now split into lib/formula-b/strength-tiers.js,
competition-context.js, standings-context.js, schedule-pressure.js, fatigue.js,
nations-league.js, european-league-phase.js, intent-rules.js, intent-engine.js
and worksheet-model.js. Strength configuration is independent of intent rules.
The intent engine preserves first-match ordering: input validation, mandatory
need/capability, away-market uncertainty, Nations League, schedule pressure,
and common supporting-evidence rules. The legacy shared entry retains provider
orchestration and compatibility exports; both API URLs retain their behavior.

Each extraction ran all three suites (B 70/70, A 50/50, D 60/60); none failed.
No assertions were changed during extraction. Node syntax checks also passed.
No frontend/Excel files, migrations, network data or deployment were changed.

Line-count comparison against Git HEAD includes the preceding uncommitted bug
fixes and compatibility work: api/formula-c.js fell from 688 to 6 lines (682
fewer), while api/formula-b.js fell from 39 to 17 lines (22 fewer).
The shared lib/formula-b-engine.js provider adapter is 293 lines. These are
physical line counts; the API reduction is not solely this extraction turn.
