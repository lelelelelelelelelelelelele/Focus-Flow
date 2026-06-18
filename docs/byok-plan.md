# Focus-Flow · 应用内 BYOK NLP 任务编辑 — 实施计划

> 个人留底文档(同 `docs/ai-task-editing.md`,未进上游仓库)。
> 定稿日期:2026-06-14。

## 1. 背景与定位

「真正支持任务修改 / NLP 编辑」这条核心下一步,已经有一条 **agent 指令路线**闭环:
`file-mirror` 双向镜像(任务 ↔ `focus-flow-tasks.json`,PR #3 已并入上游 main)+ 个人文档
`ai-task-editing.md`,服务"会用 Claude Code / Cursor / 终端 agent 的 power user"。

本计划是**并行的第二条前端**:**应用内轻量 BYOK NLP 编辑对话框**,面向普通用户。

- **兼容性**:不依赖外部 agent 工具,任何人有 key 即可用。
- **安全**:LLM 只能产出受 schema 约束的任务编辑,无文件系统 / 命令权限;再叠一层
  「先预览 diff 再落地」(human-in-the-loop),blast radius 比 agent 路线更小。
- **轻量**:单弹窗 + 一次 API 调用,无需开终端、切上下文。

**复用 file-mirror 已定义的 JSON schema**,前面的活儿是地基不是沉没成本。

## 2. 关键决策(已定)

| 维度 | 决策 | 理由 |
|---|---|---|
| Key 存储 | **明文存 settings(MVP)** | 最快出原型,零新依赖;UI 标注风险,后续再升级 stronghold/keychain |
| Provider | **通用 BYOK(OpenAI 兼容)** | base_url + key + model,覆盖最多第三方网关 |
| 结构化输出 | **function-calling(强制单 tool)** | 比 `json_schema` strict 模式在各家 OpenAI 兼容网关里支持更广 |
| 落点 | **个人分支** | 上游只读(pull-only),进上游需作者合 PR;不假设能发版 |

## 3. 现状盘点(对本功能意味着什么)

| 地基 | 现状 | 影响 |
|---|---|---|
| 数据 schema | `src/types/index.ts` 的 `Task`/`Zone` + `file-mirror-core.ts` 的 `MirrorFile` | 直接约束 LLM 输出,零额外定义 |
| 落地通道 | store actions `addTask/updateTask/deleteTask`,各自带 `saveSnapshot()` | 改 store 即可,完全不碰文件 IO |
| 自动同步 | `file-mirror.ts` 订阅 `tasks/zones` 变化,600ms 防抖导出 | 改完 store 镜像文件自动跟新,白送 |
| 防误删护栏 | `file-mirror-core.ts` 的「空文件不覆盖好数据」 | 同一思路复用到 ops 校验 |
| 分层范式 | core(纯逻辑)+ engine(可注入)+ wiring(真依赖),全单测锁住 | 照抄,评审一眼是同一作者风格 |
| 测试报告 | `npm run test:report` → `scripts/gen-test-report.mjs` → `test-report.html`(含 `FEATURE_NOTES` 能力说明) | 验收直接接这条现成管线 |

**核心结论**:落地侧零新增。LLM 产出受约束的 op → 走现有 store action → file-mirror 自动导出 → 撤销也白送。

## 4. 真正要新建的(仅两块基础设施)

1. **网络出口**:当前 capability(`src-tauri/capabilities/main.json`)**没有任何 HTTP 权限**(只有
   sql/fs/dialog)。加 `tauri-plugin-http` + `@tauri-apps/plugin-http`,capability 加 `http:default`。
   ⚠️ 通用 BYOK 下 base_url 用户自填,build 时无法预知,scope 只能放宽到 `https://*`——个人工具可接受,
   但要在 UI / 代码注释里写明这是有意取舍。
2. **Key 存储**:当前无 keychain/stronghold,只有 SQLite。MVP 先明文落 `settings`,输入框旁标"明文存储"提示。

## 5. 拟议结构(沿用 file-mirror 范式)

```
src/lib/nlp-edit/
  schema.ts        # 编辑 op 的 JSON Schema = function 的 parameters;字段值锁死 Task 枚举
  apply-core.ts    # 纯逻辑:snapshot + ops → 校验 → action 计划 / 新 snapshot(单测锁护栏)
  provider.ts      # createProvider({ fetchFn }):OpenAI 兼容请求构造 + tool_call 解析(可注入,可单测)
src/components/
  NlpEditDialog.tsx  # 输入框 → 调 provider → diff 预览(增/改/删)→ Apply/Cancel
```

- op 三种:`add_task / update_task / delete_task`(zone 操作后置)。
- 落地:Apply 时 **先 `saveSnapshot()` 一次 + 批量 setState**(单步撤销,而非每 op 一步)→ file-mirror 自动导出。
- 护栏:未知 id 报错不静默、op 数量上限、批量删除要显式、空结果不落地。
- provider 把当前 zones/tasks 摘要塞进上下文,让 LLM 能引用 id。
- 错误(key 错/网络/格式)→ 类型化 error 供 UI 回流。

## 6. 实施阶段(按依赖顺序)

### Phase 0 — 基础设施(唯一新增依赖)
- 加 `tauri-plugin-http`(Cargo)+ `@tauri-apps/plugin-http`(JS),capability 加 `http:default`(scope `https://*`)。
- `settings` schema 加 `byok: { baseUrl, apiKey, model }`,`SettingsPanel.tsx` 加一栏(明文 + 风险提示)。

### Phase 1 — schema + apply-core(纯逻辑,先写测试)★ 建议起手
- `nlp-edit/schema.ts`:op 的 JSON Schema,字段值锁死 priority/urgency/deadlineType 枚举。
- `nlp-edit/apply-core.ts`:纯函数校验 + 产出 action 计划;护栏复用 file-mirror 思路。
- 单测照 `file-mirror-core.test.ts` 风格锁住。

### Phase 2 — provider(OpenAI 兼容)
- `nlp-edit/provider.ts`:`createProvider({ fetchFn })`,`/chat/completions` + `tools:[emit_task_edits]` +
  `tool_choice` 强制,经 plugin-http 发出;解析 `tool_call.arguments` → ops。

### Phase 3 — 对话框 UI
- `NlpEditDialog.tsx`:textarea → 「生成」→ diff 预览 → Apply/Cancel;入口按钮放 SettingsPanel 或主工具栏。
- i18n 走现有 `src/locales`。

### Phase 4 — 验收 & 报告(接现成管线)
1. **登记能力说明**:给 `gen-test-report.mjs` 的 `FEATURE_NOTES` 加三条 —— `apply-core` / `nlp-provider` /
   `NlpEditDialog`,让 HTML 报告显示 BYOK 覆盖了什么能力,而非裸测试名。
2. **mock-provider 端到端测试**(进自动化报告):喂罐头 OpenAI 响应(带 `tool_calls.arguments`)→ 断言
   ops 解析正确 → apply-core 产出正确 diff → store 被正确改。**无需真 key 即可把核心链路锁进报告**。
3. **真 key 手动冒烟**(LLM 实调没法进 CI):checklist —— 填 key → 输"加 3 个任务" → 截图
   `对话框 → diff 预览 → 落地结果`;走 DELIVERY.md 风格交付片段。
4. **验收门槛**:`npm run test:report` 全绿 = 通过;产出物 = `test-report.html`(可视化结果)+ 冒烟截图。

## 7. 验收两层

- **自动化**(`test-report.html`,含 mock 端到端):管回归正确性。
- **手动冒烟**(真 key + 截图):管真实 LLM 调通——补自动化覆盖不到的网络/key 真路径。
