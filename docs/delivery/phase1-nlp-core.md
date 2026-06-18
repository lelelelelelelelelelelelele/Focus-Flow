# 交付报告 · BYOK NLP 编辑 Phase 1（schema + apply-core）

> 这是**给人类的 Change Verdict**（受众=我自己，拍 go/no-go 的人），按 byok-plan-v2 §8 结构。
> 与 `docs/harness/episode-log.md` 分工：那份是 harness 方法论记录（dense，给研究/复盘）；**这份是交付判断**（scannable，给决策）。
> 日期 2026-06-14｜分支 `feat/byok-nlp-edit`｜未 commit。

## 一句话 Verdict

**Phase 1 地基可用，可进 Phase 2。** 但有 **2 条行为口径待你拍板**、**2 个 plan 假设要先补**，否则 Phase 2 会再撞同一个坑。

## Intent → Change → Boundary → Evidence → Verdict → Risk

| 段 | 内容 |
|---|---|
| **Intent** | BYOK NLP 编辑的纯逻辑地基：把自然语言 op 校验成可落地的 action 计划 + diff 预览 |
| **Change** | 新增 4 文件 `src/lib/nlp-edit/{schema,apply-core,schema.test,apply-core.test}.ts`。`git diff HEAD` 为空 = **零现有文件改动** |
| **Boundary impact** | **本期无新边界风险**。纯逻辑：无网络、无 key、无新权限、无新依赖。（plan 里那条 `app→外部HTTP` 新边 + 明文 key 属 Phase 0/2，**不在本期**——照实说明，不提前背锅） |
| **Evidence** | `vitest` **45/45 真绿**（baseline 16 + 新测试 29），`tsc --noEmit` 干净；8 条护栏全有真断言；3 镜头对抗验证（真值✅ / 边界✅ / 真跑：sandbox 假阴性，已 harness 亲跑裁决）。**证据是测试，非截图**——Phase 1 无 UI/LLM，截图证据留到 Phase 3/4 |
| **Verdict** | 地基正确、纯、可测、风格同作者。**Ready**，前提是下面 2 条口径你认 |
| **Residual risk** | ① 测试"绿"依赖关闭 sandbox（真实环境真绿，但 CI 无 vitest 步）；② `INVALID_OP` 防御分支无测试（低风险）；③ node_modules 初始缺 jsdom |

## 你需要决定的（2 条口径，按守则该你拍）

1. **update 能改什么**：子 agent 定为「可重挂父任务（parentId）但**不可换分区**（zoneId）」。同意？还是 NLP 编辑也该能换区？
2. **坏 op 怎么办**：子 agent 定为「一个 op 非法 → **整批否决**（fail-fast），不部分应用」。同意？还是希望"跳过坏的、应用好的"？

（两条子 agent 都给了合理理由，默认我就按它定的走；你不改即视为认可。）

## 建议的两个前置补丁（来自 harness 抓到的 D1/D2）

- **补"验证环境"口径进 §0/§7**：明确测试在哪跑算数（本地真实环境 vs CI），否则"绿不绿"无定论。
- **补 CI gate 现实**：`.github/workflows/build.yml` 当前**没有** vitest 步骤，plan §7 依赖的 CI 门并不存在——要么接上，要么把 gate 改成"本地真跑"。

## 不在本期（已知边界）

provider/LLM 契约（Phase 2）、UI（Phase 3）、Tauri http 基础设施 + 明文 key（Phase 0）、test:report/FEATURE_NOTES 接线 + 真 LLM 截图证据（Phase 4）、实际 Apply wiring（单步 saveSnapshot + 批量 setState）。
