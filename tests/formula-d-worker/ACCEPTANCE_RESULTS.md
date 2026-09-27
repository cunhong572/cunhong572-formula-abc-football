# Formula D 真实环境验收：REAL E2E PASS

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

验收日期：2026-09-27 UTC。分支：`refactor/worker-scheduler`。

结论含义：数据库及真实源站组件验证有成功证据，但没有完成一次在有效重试窗口内获准执行、读取真实站点并写入新正式槽位的完整 Worker 任务。因此不能把组件验证组合冒充完整 REAL ENV PASS。未改变业务规则或放宽球队匹配。

## 环境与数据边界

- 独立 PostgreSQL 项目：`proj_D4A8tb6OOmOD`，名称 `Formula D Worker Acceptance 20260927`。
- 生产项目：`proj_Lgog5Tsn1ZJE`，V273；仅执行只读查询和只读浏览器探测，未写生产数据库、项目文件或调度任务。
- 从生产复制 7 张 Formula D 相关表的结构；新增字段之前，7 张表的列名、类型、可空性均与生产一致。
- 仅复制比赛 403–407 共 5 行、关联历史 snapshot 9 行。没有复制登录、token 或账号配置表。
- 浏览器使用生产项目已有凭据的运行上下文执行当前本地源码，只读取赔率。全部测试数据库写入均在独立验收库。没有把凭据输出或写入仓库，也没有把生产凭据配置到验收项目。
- 没有部署生产；没有部署独立项目的完整 Worker 路由。数据库和源码函数通过 Hatchable REPL 验收，不是已部署的端到端 scheduler 验收。

## Migration

已执行：0042、0047、0049、0050、0051、0052、0054、0055、0056，以及 0057。排除不属于本次赔率 Worker 的 0048 历史学习 migration。

0057 在验收库通过 `db.transaction` 执行全部 8 条语句；随后重复执行成功。

- 迁移前后历史 snapshot 均为 9 条，所有原字段逐项一致；没有删除历史数据。
- 6 条正式记录回填 target_at，3 条 baseline 保持 null。
- 按 kickoff 与 sample_kind 重新计算，回填错误 0 条。
- `uq_formula_e_formal_slot` 对 match_id + target_at + sample_kind 唯一。
- `uq_formula_e_legacy_line_kind` 保留未锚定历史记录的盘口唯一性。
- 迁移及并发测试后的正式槽位重复数均为 0。
- 生产 information_schema 查询确认没有新增 target_at/capture_status；0057 没有在生产执行。
- 初次索引检查因平台禁止 pg_indexes 被拒；改用官方项目 schema 工具验证，没有绕过系统目录限制。

0057 SHA256：`20720E3694F717967E6BF489E3CC08D6665498D819FCB3616AC25D888991778B`。

## 逐项验收

| 项目 | 结果 | 实际证据与范围 |
|---|---|---|
| 独立 PostgreSQL / 结构与必要数据复制 | PASS | 独立项目；7 张相关表、5 场比赛、9 条历史 snapshot |
| Migration / 回填 / 唯一索引 / 历史保留 | PASS | 全部原字段不变，错误及重复为 0 |
| Early fast source path | PASS（源站组件） | 06:24:02.545Z，实际解析 12 场；不是正式 scheduler 任务 |
| candidates=0 → fallback | PASS（源站组件） | 06:28:12.966Z，在 Today 恢复 3 场 |
| 固定 fallback 顺序 | PASS | 首轮 Early → 09/28 日期 → Today → Favorites → 其他入口；恢复轮在 Today 找齐后停止 |
| Denmark–Wales | PASS（源站读取） | Today，盘口 1，Over 1.66 |
| Serbia–Netherlands | PASS（源站读取） | Today，盘口 1/1.5，Over 2.00 |
| 可抓取对照 | PASS | Belgium–France：Early，1/1.5 @ 1.93；另有 Austria–Kosovo：Today，1 @ 1.93 |
| 原 targetAt 持久化 | PASS（写入层） | 真实 PostgreSQL：06:16:34.039 请求、06:17:54.083873 写入，正式槽位仍为前者 |
| 同槽连续 3 次及并发幂等 | PASS | 连续 3 次 + 8 路竞争，只存 1 行；3 场真实读取结果各重试写入 3 次仍保留原槽 |
| 已成功记录不可覆盖 | PASS | Austria 新读 1.93，旧成功槽仍为 1.80 |
| T-5 提前 / 窗口内 / 开赛后 | PASS | 应用函数及独立执行的原 SQL 双层验证：0 / 1 / 0 条写入 |
| 同 timeline 的 lease 竞争 | PASS（执行权及写入层） | 两个实际 withWorkerLease 调用并发，仅一个执行主体，只有一条正式记录；不是两个真实浏览器任务 |
| lease fencing / 过期恢复 | PASS | 错误 owner 写入失败；过期 lease 可接管；结束时 lease 表为 0 行 |
| 优先级 | PASS（实际数据库） | T5 → T1 → hourly → manual → background；每一级低优先级均被较高 pending 请求阻挡 |
| 有效窗口内的完整真实 Worker + 新正式 snapshot | **未通过** | 真实成功源站探测发生在 06:28，保留的 06:00 anchor 已过重试期限。正式 admission 实际返回 expired，不能当成合格正式抓取 |

时间边界/竞争测试用明确标注 ACCEPTANCE REPLAY 的隔离测试比赛和复制来的真实历史赔率；这些不是新实时赔率。真实源站读取记录另行保存，没有用回放值冒充现场读取。

## 关键数据库记录

时间均为 UTC。以下行都在验收库。

| snapshot id | match id | target_at | observed_at | odds | 说明 |
|---|---|---|---|---|---|
| 1 | 900001 | 06:16:34.039 | 06:17:54.083873 | 1.66 | 延后约 80 秒的 PostgreSQL 写入层测试；11 次调用仅一行 |
| 12 | 900003 | 06:16:34.221 | 06:17:54.248278 | 1.66 | T-5 窗口内测试 |
| 13 | 900005 | 06:17:54.282 | 见 JSON | 1.66 | 双 worker 执行权竞争，唯一获准写入 |
| 14 | 900011 | 06:18:51.942 | 见 JSON | 1.66 | 直接原 SQL 的数据库时钟门禁测试 |
| 564 | 403 | 06:00:00 | 06:04:24.349333 | 1.66 | 复制的历史成功槽；现场读到后再次写入不会替换 |
| 565 | 404 | 06:00:00 | 06:04:24.403393 | 2.00 | 同上 |
| 566 | 407 | 06:00:00 | 06:04:24.433837 | 1.80 | 新现场价 1.93 未覆盖旧成功值 |

总计：13 条 snapshot（9 条复制历史 + 4 条数据库测试）、42 条 acceptance_scan_attempts、30 条 formula_e_scan_audit、9 条 acceptance_results，活动 lease 为 0。39 条初轮/对照记录加 3 条最终成功读取记录组成 42 条。失败记录的 actual_capture_time、盘口、赔率和 snapshot_id 为 null，未造成功记录。

## 源站问题定位

首轮 3 场在 Early、日期页、部分其他入口为 candidates=0；Today / Favorites 等入口出现就绪超时。独立 DOM 检查能看到其他真实赛事，Early 对照可解析 12 场，因此不是整体解析器失效。

随后 Today 再次加载，3 场按原严格匹配与 FIRST HALF O/U 规则全部读到。可以确认入口/加载状态存在波动；不能仅凭这些观测断言已找到稳定性的唯一根因。没有放宽匹配、没有伪造赔率。

源站 REPL 请求标明 30 秒超时，但一次实测执行 108439 ms；该参数不能当作整次浏览器工作硬截止保证。完整 Worker 在真实浏览器时长、lease heartbeat、优先级抢占共同作用下仍需有效窗口内的端到端验收。

## 回归与产物

- Worker/Scheduler：49/49 PASS。
- 原 Formula D：60/60 PASS；合计 109/109 PASS。
- Formula A：50/50；B：70/70；C：84/84；Shared-data：50/50，全部 PASS。
- 原始最终记录：`acceptance-final-evidence.json`；迁移前后记录：`acceptance-evidence-20260927.json`。
- 未 commit、push、merge；未修改 main，未部署生产。

下一验收关口：在独立运行环境中，以尚在有效窗口内的真实正式目标执行完整 Worker，验证首次补抓新增正式槽位，以及实际浏览器工作期间的并发与优先级。当前结论必须保持 **REAL ENV FAIL**，不能用组件 PASS 替代该关口。
