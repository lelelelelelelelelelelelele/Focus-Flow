# Focus-Flow · 应用内 BYOK NLP 任务编辑 — 实施计划 v2

> 个人留底文档（同 `docs/ai-task-editing.md`，未进上游仓库）。
> v1 定稿 2026-06-14；**v2 修订 2026-06-14**：补 Intent Contract（含人指定验收契约）、依赖边/boundary rules（架构图省略），并修正验收两层（门槛 ≠ 证据）。
> v2 不替代 v1，是 v1 的治理层补全；v1 的执行计划部分基本沿用。

---

## 0. Intent Contract（人在 plan-prior 指定，agent 不得自改口径）

> 这一节是 plan 的**输入**，由人交互拍死，不是 agent 推断出来的。验收口径以此为准；agent 后续只设计「如何满足」，无权重定「什么算通过」。

### 目标
普通用户在应用内用自然语言编辑任务（BYOK），不依赖外部 agent 工具。

### 受众
本计划产物（含 §8 交付报告）的首要受众是**我自己**——开发者兼使用者，掌控判断与 go/no-go 的人。不是上游 maintainer，不是泛化 reviewer。（显式锁死，防止 agent 把口径外推成「对外说服件」。）

### 范围
- 自然语言 → `add_task / update_task / delete_task` 三种 op（zone 操作后置，不在本期）。
- 单弹窗 + 一次 API 调用，先预览 diff 再落地。

### Non-goals（明确禁止）
- 不做 agent / 不给 LLM 文件系统或命令权限；LLM 输出**只能**是受 schema 约束的 op。
- 不假设能发上游版（上游 pull-only，需作者合 PR）。
- MVP 不引入 keychain/stronghold（key 明文存 settings，UI 标风险）。
- 不做多轮对话、对话记忆、自动执行。

### 验收契约（human-specified）
- **门槛（gate）**：`npm run test:report` 全绿 = 回归没坏。由 mock + 断言层负责，确定性、无 key、进 CI。
- **证据（evidence）**：一次**真 key、真 LLM 的真实「自然语言 → todo」运行**，自动截三态（对话框输入 / diff 预览 / 落地后任务列表），嵌入报告；**针对本期新增功能**，替代真人手动点测。
  - 证据**不卡 CI**（交付时本地带 key 跑）；断言放松为结构性：≥1 个 task 真落地、ops 解析无错、无崩溃。
  - 截图内容每次可不同——它是「某次真实运行的产品快照」，变是正常的。
- **mock 不充当证据**：集成型功能的证据必须跑真集成；mock 只做回归门槛。

### 必须停下来让人确认（HIL）
- 任何落地前**先展示 diff 预览**，人点 Apply 才落地。
- 批量删除必须显式确认，不静默执行。

---

## 1. 背景与定位

「真正支持任务修改 / NLP 编辑」这条核心下一步，已有一条 **agent 指令路线**闭环：
`file-mirror` 双向镜像（任务 ↔ `focus-flow-tasks.json`，PR #3 已并入上游 main）+ 个人文档
`ai-task-editing.md`，服务「会用 Claude Code / Cursor / 终端 agent 的 power user」。

本计划是**并行的第二条前端**：**应用内轻量 BYOK NLP 编辑对话框**，面向普通用户。

- **兼容性**：不依赖外部 agent 工具，任何人有 key 即可用。
- **安全**：LLM 只能产出受 schema 约束的任务编辑，无文件系统 / 命令权限；再叠一层
  「先预览 diff 再落地」（human-in-the-loop），blast radius 比 agent 路线更小。
- **轻量**：单弹窗 + 一次 API 调用，无需开终端、切上下文。

**复用 file-mirror 已定义的 JSON schema**，前面的活儿是地基不是沉没成本。

> ⚠️ v2 核验记录：`docs/ai-task-editing.md` 在当前仓库**未找到**（未跟踪 / 在其它分支 / 尚未写）。本节「agent 路线已闭环」的前提依赖该文档存在，落地前请确认其位置。

## 2. 关键决策（已定）

| 维度 | 决策 | 理由 |
|---|---|---|
| Key 存储 | **明文存 settings（MVP）** | 最快出原型，零新依赖；UI 标注风险，后续再升级 stronghold/keychain |
| Provider | **通用 BYOK（OpenAI 兼容）** | base_url + key + model，覆盖最多第三方网关 |
| 结构化输出 | **function-calling（强制单 tool）** | 比 `json_schema` strict 模式在各家 OpenAI 兼容网关里支持更广 |
| 落点 | **个人分支** | 上游只读（pull-only），进上游需作者合 PR；不假设能发版 |

## 3. 现状盘点（对本功能意味着什么 / 也是 architecture-code 一致性输入）

| 地基 | 现状 | 影响 |
|---|---|---|
| 数据 schema | `src/types/index.ts` 的 `Task`/`Zone` + `file-mirror-core.ts` 的 `MirrorFile` | 直接约束 LLM 输出，零额外定义 |
| 落地通道 | store actions `addTask/updateTask/deleteTask`，各自带 `saveSnapshot()` | 改 store 即可，完全不碰文件 IO |
| 自动同步 | `file-mirror.ts` 订阅 `tasks/zones` 变化，600ms 防抖导出 | 改完 store 镜像文件自动跟新，白送 |
| 防误删护栏 | `file-mirror-core.ts` 的「空文件不覆盖好数据」 | 同一思路复用到 ops 校验 |
| 分层范式 | core（纯逻辑）+ engine（可注入）+ wiring（真依赖），全单测锁住 | 照抄，评审一眼是同一作者风格 |
| 测试报告 | `npm run test:report` → `scripts/gen-test-report.mjs` → `test-report.html`（含 `FEATURE_NOTES` 能力说明） | 验收门槛直接接这条现成管线 |
| 网络权限 | **`src-tauri/capabilities/main.json` 当前只有 sql/fs/dialog，无任何 http**（已含 `fs:scope`） | 本期唯一硬缺口，见 Phase 0 |

**核心结论**：落地侧零新增。LLM 产出受约束的 op → 走现有 store action → file-mirror 自动导出 → 撤销也白送。唯一真新增是「网络出口 + key 存储」两块基础设施。

## 4. 依赖边与边界规则（v2 · 架构图省略）

> 这不是我的仓库（Focus-Flow 上游 pull-only），完整 architecture map 不成比例，省。只留两样便宜且护着新风险面的东西：本期唯一新依赖边 + nlp-edit 的边界规则。模块职责见 §5 拟议结构。

**唯一新依赖边**：`app → plugin-http → 外部 LLM 网关（https://*）`。整个功能的新风险集中处（网络出口 + 明文 key）。其余全走现有 store action / file-mirror，无新边。

### Boundary Rules（nlp-edit 模块）

```yaml
module: nlp-edit
allowed_dependencies:
  - types (Task/Zone)
  - store public actions (addTask/updateTask/deleteTask, saveSnapshot)
  - injected fetchFn  # 仅 provider.ts，且必须可注入
forbidden:
  - direct fs / 命令执行
  - direct sql / DB
  - 未注入的全局 fetch        # 必须可注入，否则不可单测
  - apply-core / schema 引入任何 IO   # 这两个必须保持纯
must:
  - LLM 输出仅限 schema 约束的 op，不得越出
  - 落地 = 一次 saveSnapshot + 批量 setState（单步撤销，非每 op 一步）
  - 未知 id 报错不静默；op 数量上限；批量删除显式；空结果不落地
verification:
  - mock e2e 断言        # 门槛，进 CI
  - 真 LLM 三态截图      # 证据，交付时跑，不卡 CI
```

## 5. 拟议结构（沿用 file-mirror 范式）

```
src/lib/nlp-edit/
  schema.ts        # 编辑 op 的 JSON Schema = function 的 parameters；字段值锁死 Task 枚举
  apply-core.ts    # 纯逻辑：snapshot + ops → 校验 → action 计划 / 新 snapshot（单测锁护栏）
  provider.ts      # createProvider({ fetchFn })：OpenAI 兼容请求构造 + tool_call 解析（可注入，可单测）
src/components/
  NlpEditDialog.tsx  # 输入框 → 调 provider → diff 预览（增/改/删）→ Apply/Cancel
```

- op 三种：`add_task / update_task / delete_task`（zone 操作后置）。
- 落地：Apply 时**先 `saveSnapshot()` 一次 + 批量 setState**（单步撤销）→ file-mirror 自动导出。
- 护栏：未知 id 报错不静默、op 数量上限、批量删除要显式、空结果不落地。
- provider 把当前 zones/tasks 摘要塞进上下文，让 LLM 能引用 id。
- 错误（key 错/网络/格式）→ 类型化 error 供 UI 回流。

## 6. 实施阶段（按依赖顺序）

### Phase 0 — 基础设施（唯一新增依赖）
- 加 `tauri-plugin-http`（Cargo）+ `@tauri-apps/plugin-http`（JS），capability 加 `http:default`。
  ⚠️ 通用 BYOK 下 base_url 用户自填，build 时无法预知，scope 只能放宽到 `https://*`——个人工具可接受，
  但要在 UI / 代码注释里写明这是有意取舍（且这条要进交付报告的 Boundary impact）。
- `settings` schema 加 `byok: { baseUrl, apiKey, model }`，`SettingsPanel.tsx` 加一栏（明文 + 风险提示）。

### Phase 1 — schema + apply-core（纯逻辑，先写测试）★ 建议起手
- `nlp-edit/schema.ts`：op 的 JSON Schema，字段值锁死 priority/urgency/deadlineType 枚举。
- `nlp-edit/apply-core.ts`：纯函数校验 + 产出 action 计划；护栏复用 file-mirror 思路。
- 单测照 `file-mirror-core.test.ts` 风格锁住。

### Phase 2 — provider（OpenAI 兼容）
- `nlp-edit/provider.ts`：`createProvider({ fetchFn })`，`/chat/completions` + `tools:[emit_task_edits]` +
  `tool_choice` 强制，经 plugin-http 发出；解析 `tool_call.arguments` → ops。

### Phase 3 — 对话框 UI
- `NlpEditDialog.tsx`：textarea → 「生成」→ diff 预览 → Apply/Cancel；入口按钮放 SettingsPanel 或主工具栏。
- i18n 走现有 `src/locales`。

### Phase 4 — 验收 & 报告（接现成管线，v2 重写）
见第 7、8 节。Phase 4 拆成两条独立产线：**门槛产线**（mock，进 CI）与**证据产线**（真 LLM，交付时跑）。

## 7. 验收两层（v2 修正 · 门槛 ≠ 证据，角色彻底分开）

> v1 把「`test:report` 全绿」既当门槛又当交付证据，是混淆。BYOK 的全部新风险在「真模型调用」那一下，mock 截图证明不了它能用。修正如下。

| 层 | 角色 | 手段 | 确定性 | 进 CI? | 进报告? |
|---|---|---|---|---|---|
| **门槛 gate** | 机器查管道没坏（解析/apply/store） | mock-provider 喂罐头响应 + 断言（ops 解析对、apply-core diff 对、store 改对） | 确定 | ✅ 是 | 是（绿/红 + FEATURE_NOTES） |
| **证据 evidence** | 替人确认真功能能用 | 真 key + 真 LLM + 真 UI → 自动截三态 | 每次可变 | ❌ 否（本地跑） | ✅ 是（头条） |

要点：

1. **报告头条证据 = 真实 LLM 跑出来的截图**，不是 mock。这张替代真人冒烟。
2. 证据**不卡 CI**，故不存在「今天绿明天红」——它是真实运行快照，变是正常。
3. 证据层断言**放松成结构性**：≥1 task 落地、ops 无解析错、无崩溃。鲁棒于模型措辞差异，截图承担「人眼确认」。
4. key 不是阻碍：个人工具 / 个人分支，key 本就是自己的，交付时本地带 key 跑一次，脚本替你点完截图。
5. mock 层**保留**，但只做回归门槛（重构改坏 op 解析能不带 key 就红），**不冒充证据**。

### Phase 4 具体动作
1. **登记能力说明**：给 `gen-test-report.mjs` 的 `FEATURE_NOTES` 加三条 —— `apply-core` / `nlp-provider` /
   `NlpEditDialog`，让 HTML 报告显示 BYOK 覆盖了什么能力。
2. **门槛产线（mock e2e，进 CI）**：喂罐头 OpenAI 响应（带 `tool_calls.arguments`）→ 断言 ops 解析正确 →
   apply-core 产出正确 diff → store 被正确改。**无需真 key 即可把核心管道锁进 CI**。
3. **证据产线（真 LLM 自动截图，交付时本地跑）**：脚本带真 key → 真实输入「加 3 个任务」→ 自动截
   `对话框输入态 / diff 预览态 / 落地后任务列表态` 三张 → 嵌入 `test-report.html` 与交付报告。
   - 机制选型：**MVP 用组件级渲染截图**（vitest browser / Playwright 渲 `NlpEditDialog` + 真 fetch 指向真 base_url），
     成本低、拿到真实 UI 真实模型证据；真 Tauri 窗口截图（tauri-driver + WebdriverIO）作后续升级，个人工具暂不值。
   - 仅截**本期新增功能**（change-scoped），不做全应用回归截图。
4. **验收门槛**：`npm run test:report` 全绿 = 门槛过；交付物 = `test-report.html`（含 mock 断言结果）+ 真 LLM 三态截图 + 交付报告（第 8 节）。

## 8. 交付报告 / Change Verdict（v2 新增）

> agent 改完代码不能自称「完成」，要给可追踪 verdict。`test:report` 绿是 verdict 的**输入证据之一**，不是 verdict 本身。**本报告受众是我自己**——掌控判断、拍 go/no-go 的那个人，不是要去说服谁。它的用处是：①交付时不用手点一遍就能确认真功能通了（省自己时间）；②过后回看能恢复上下文（这次改了什么边界、有什么风险、凭什么信它通了）。是自用的判断与记忆面，不是对外交付/说服件。

按 `Intent → Change → Boundary → Evidence → Verdict → Residual risk` 填：

| 段 | 这次 BYOK 要写什么 |
|---|---|
| Intent | 给普通用户做应用内 NLP 编辑（BYOK 第二条前端） |
| Change | 新增 `src/lib/nlp-edit/`（schema/apply-core/provider）+ `NlpEditDialog`；**新依赖边：app → 外部 HTTP（LLM 网关）** |
| Boundary impact | 新权限 `http:default`（scope `https://*`）、**key 明文存 settings** —— 两条有意取舍，必须显式上报 |
| Evidence | mock e2e 断言结果（`test-report.html` 全绿链接）+ 真 LLM 三态截图 |
| Verdict | 我自己的 go/no-go。例：「功能通过；key 明文 + `https://*` scope 是我接受的取舍；可日常用 / 暂不推上游」 |
| Residual risk | LLM 实调不进 CI；明文 key；scope 放宽 |

---

## 附：v2 相对 v1 改了什么

| # | v1 缺口 | v2 修复 |
|---|---|---|
| 1 | 验收口径由 agent 在 plan 里自定 | 上提为 §0 Intent Contract，由人 prior 指定，agent 不得自改 |
| 2 | 新 HTTP 依赖边不可见 | §4 boundary rules + 新依赖边点名（架构图省略：非我仓库，不成比例） |
| 3 | 边界护栏散在 prose | §4 形式化为 allowed/forbidden/must yaml |
| 4 | `test:report` 绿既当门槛又当证据 | §7 拆成门槛(mock,CI) ≠ 证据(真 LLM,交付) |
| 5 | 无人类报告，agent 自称完成 | §8 Change Verdict，受众是我自己（自用判断 + 上下文记忆，非对外交付） |
