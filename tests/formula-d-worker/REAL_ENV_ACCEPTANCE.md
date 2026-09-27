# Real-environment acceptance — REAL E2E PASS

## 最新验收结论：REAL E2E PASS

核验时间：2026-09-27 15:09 UTC。独立验收项目：`proj_D4A8tb6OOmOD`。
本节为当前结论；后面的 FAIL 记录是保留的历史证据，不代表最新状态。本轮仅查询真实数据库、平台任务和执行日志，未调用 Worker、未插入/修改 snapshot，未修改公式代码。

### 自动 timeline 与数据库证据

- `formula_e_cloud_state`：credential_status=configured，last_status=ok，last_run_at=`2026-09-27T14:59:08.404Z`，last_success_at=`2026-09-27T15:00:51.384Z`，last_found=3，last_saved=3。
- 平台任务 `289465`（formula-e-timeline-next）last_fired_at=`2026-09-27T14:59:01Z`。
- Worker 路由 `/api/formula-e-cloud-once` 执行日志 id=`29407847`，request_id=`2f17b434-4a28-4398-b6e9-011faa39a302`：HTTP 200，duration_ms=103151，error=null，于 `15:00:51Z` 完成。
- 下列三条均为新正式 snapshot，sample_kind=`last_1hr`，target_at=`2026-09-27T15:00:00Z`，capture_status=`captured_fallback`。14:59 是启动时间，不能当作正式时间槽。
- 三场 kickoff 均为 `16:00:00Z`；target_at 精确等于 kickoff−1hr，observed_at 均不早于 target_at 且早于 kickoff。延后约 51 秒仍保留原正式 targetAt。

| 比赛 | match_id | snapshot id | observed_at（UTC） | 盘口 | Over | audit id |
|---|---|---|---|---|---|---|
| Denmark–Wales | 403 | 24 | 15:00:51.261056 | 1 | 1.61 | 40 |
| Serbia–Netherlands | 404 | 25 | 15:00:51.305602 | 1/1.5 | 1.89 | 41 |
| Austria–Kosovo | 407 | 26 | 15:00:51.344071 | 1 | 1.91 | 42 |

三条 audit 的 reason=timeline、status=success、stage=SUCCESS、capture_status=captured_fallback；逐行与 snapshot 比较，盘口、赔率、targetAt、capture_status 全部一致。数据库状态满足 found>0、saved>0、正式 snapshot 自动落库及无重复的本轮验收条件。fallback 成功由持久化 capture_status 支持；本次只读查询没有取得该成功任务的逐入口响应，不虚构具体成功入口或 fast 失败详情。

### 幂等、lease 和 job

- 全库按 `match_id + target_at + sample_kind` 分组检查：重复组数 **0**。
- `formula_e_browser_lease`：**0 行**，lease 已释放。
- `formula_e_worker_requests`：**0 行**，无残留执行请求。
- 平台 scheduler 并非空：任务 289465 已安排下一 targetAt=`15:16:34.039Z`，next_fire_at=`15:15:04Z`。这是下一任务，与当前槽位残留 job 不同；本轮仅记录，不取消或修改。

### 范围与差异说明

- 本验收库的 `14:49Z` Germany–Greece 记录仍为 failed，Norway–Portugal 在 `14:58Z` 亦为 failed；未读取到这两场所述的成功 snapshot，不将其计入 PASS 依据。PASS 依据为上面已核实的三场成功正式槽位。
- 本轮确认了 T-1hr 实际在窗口内写入；T-5 的真实窗口边界未在本轮重新验证，不扩大 PASS 范围。
- 0057 先前在该验收库成功执行/重跑；迁移前后 snapshot/audit/matches 原字段摘要一致、无数据损失。本轮没有执行 migration，没有更改生产库。
- 结论：按当前约定的 REAL E2E 门槛，**PASS，生产上线前此验收门槛已闭环**；不表示已在生产应用 0057、已部署生产，或重新验证了生产网页登录后的所有功能。
- 未修改 Formula D 或其他公式逻辑；未 commit、merge main 或部署。下方旧证据完整保留。

### 本轮最终回归

| 套件 | 结果 |
|---|---|
| Formula A | 50/50 PASS |
| Formula B | 70/70 PASS |
| Formula C | 84/84 PASS |
| Formula D（含 Worker） | 109/109 PASS |
| Worker | 49/49 PASS |
| Shared-data | 50/50 PASS |

## 历史验收记录（保留，结论已由上文更新）

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
