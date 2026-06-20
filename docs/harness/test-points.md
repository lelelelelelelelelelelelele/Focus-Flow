# Focus-Flow · BYOK NLP 编辑 — 测试点账本（Test-Point Ledger）

> 人拥有的、活的账本（方法论见 Obsidian「Development Workflow Harness · 测试点账本」）。
> 每条 = 人在开发全程提出的一个验收点 / hard case / 需求。**强制流向 test + report + 架构边界**；known-gap 三处可见。
> 状态：`covered-now` / `deferred-phaseN` / `known-gap` / `won't-do`。
> 闭环对账：验收阶段每条必须是 covered 或明确 won't-do，不许 deferred 被忘掉。

| ID | 测试点 | 来源 | 状态 | → test | → report | → 架构边界 |
|---|---|---|---|---|---|---|
| TP1 | 验收证据 = 真 LLM→todo 三态截图（非 mock），针对新功能 | 受众/证据讨论 | `deferred-Phase4` | Phase4 真 LLM 截图 | byok-plan-v2 §7/§8 | — |
| TP2 | 人类报告 = HTML + 实测截图 | 报告格式讨论 | `covered-now`（HTML）/ 截图 `deferred-Phase3/4` | — | phase1-nlp-core.html | — |
| TP3 | mock 只做 gate；集成证据必须真跑 | mock-vs-real 争论 | `covered-now`（原则）；真 LLM 证据 `deferred-Phase4` | Phase4 | §7 两层 | — |
| TP4 | 报告受众 = 我自己（非上游 maintainer） | 受众纠偏 | `covered-now` | — | phase1-nlp-core §0 受众 / §8 | — |
| TP5 | 验证环境口径（sandbox / CI 测试在哪算数） | Episode#1 D1/D2 | `known-gap` | CI 当前**无** vitest 步 | byok-plan-v2 §7 待补 verification_env | — |
| TP6 | 子任务 / 移动 / 删子树（父**已存在**） | 树提问 | `covered-now` | apply-core.test（happy + 护栏，已有） | — | phase1-io-contract 协议层 |
| TP7 | 一次性建**新多层树**（新父 + 新子） | Episode#2 / 人工 ratify | `covered-now`（核心层）· wiring `deferred-Phase3` | apply-core.test「建新树 tempId」块（plan + parentLabel） | phase1-nlp-core 树/子任务状态 | phase1-io-contract 协议层 |
| TP8 | diff 预览**必须显父任务名**（防静默错挂） | Episode#2 T2 | `covered-now` | 同上（parentLabel 断言） | phase1-nlp-core | phase1-io-contract |
| TP9 | re-parent **环 / 深度守护** | Episode#2 T3 | `covered-now` | apply-core.test（CYCLE：自身/子孙 + 合法反例） | phase1-nlp-core 树/子任务状态 | phase1-io-contract「成环」例 |

## 闭环说明

- **TP7/TP8 已闭环（核心层）**：人 ratify「一句话建新树」是真需求后实现——add_task 加 tempId 批内引用（建新树）+ AddedPreview.parentLabel（diff 显父名，防静默错挂）。core 层测试绿；**app 内真正落地 = TP7 的 Phase 3 wiring（addTask 回传真 id）尚未做**。
- **TP9 已闭环**：re-parent 到自身/自身子孙 → CYCLE（含「挪到非子孙合法」反例）。同批补了 INVALID_OP 防御分支测试（关掉交付报告残余风险②）。
- **TP5** 待并入 byok-plan-v2 §0/§7（verification_env 口径）。
- 新测试点随人追问继续往表里加；本批是「人指定测试点 → test/report/架构边界三处可见 + 闭环」的可复制样板。
