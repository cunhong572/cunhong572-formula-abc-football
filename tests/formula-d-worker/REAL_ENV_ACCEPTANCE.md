# Real-environment acceptance — incomplete

This is the earlier read-only preflight. The later independent-database acceptance and final verdict are in [ACCEPTANCE_RESULTS.md](ACCEPTANCE_RESULTS.md).

Date: 2026-09-27 UTC. Branch: `refactor/worker-scheduler`.

## Environment verified (read-only)

- Existing football project: `proj_Lgog5Tsn1ZJE`, `formula-a-football`, deployed V273.
- Database: PostgreSQL 16.13. Database clock observed: `2026-09-27T06:08:08.534682+00:00`.
- Production credentials are configured; no credential values were retrieved or logged.
- Production schema has no `target_at` / `capture_status` snapshot columns yet.
- Production scheduling is active. Observed next official target: `2026-09-27T06:45:00.000Z`, prewarm `06:43:30Z`.
- No separate acceptance project currently exists. Choice of independent acceptance database versus existing production database is pending user clarification.

Migration file SHA256:
`20720E3694F717967E6BF489E3CC08D6665498D819FCB3616AC25D888991778B`

## Live source probes (current local scanner/navigation code)

Code was executed via the project REPL without uploading files or deploying.
Only browser navigation/extraction and read-only SQL were used. No cloud scan
API handler was invoked, no scheduler was armed, and no snapshot/audit was written.

1. Login/discovery reached `https://www.3573217.com/main.aspx`; Early readiness failed. Runtime reported 25,351 ms.
2. Independent probe: Early navigation opened successfully and readiness passed. The old document had 312 counted event/time elements; the new document had 50 and a different document marker. These are DOM element counts, not unique fixture counts. Runtime reported 11,622 ms.
3. Source sequence probe completed at `2026-09-27T06:12:04.482Z`:
   - Early: readiness failed.
   - Fixture date `09/28` (Shanghai calendar): readiness passed; no parsed fixture for Denmark–Wales or Serbia–Netherlands. Both returned `team row not unique (0) candidates=0`.
   - Today: readiness failed.
   - Runtime reported 73,700 ms despite the REPL request's 30,000 ms timeout; that timeout cannot be treated as a strict browser execution bound.

This demonstrates real source-loading variability and an unresolved fixture
lookup failure. It does **not** establish successful full fallback recovery.
Favorites/other-entry recovery remains unverified.

## Database records observed, not modified

| Existing match ID | Fixture | Kickoff UTC | Locked line |
|---|---|---|---|
| 403 | Denmark–Wales | 2026-09-27 16:00 | 1 |
| 404 | Serbia–Netherlands | 2026-09-27 16:00 | 1/1.5 |
| 407 | Austria–Kosovo | 2026-09-27 16:00 | 1 |
| 405 | Germany–Greece | 2026-09-27 18:45 | null |
| 406 | Norway–Portugal | 2026-09-27 18:45 | null |

0057 has **not** been executed. No acceptance database records were created.
PostgreSQL concurrency, targetAt persistence, idempotency, T-5 database boundaries
and real lease contention have **not** been tested. Offline PASS results cannot
substitute for these missing acceptance checks.

No commit, push, merge, deployment, production file edit or database write occurred.
