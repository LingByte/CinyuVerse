---
status: accepted
date: 2026-11-25
decision-makers:
  - Cinyuverse maintainers
---

# 故事线是节拍驾驶舱；操作权威在 story-graph.json

小说 Workspace 的「故事线 / Overview」主职固定为 **节拍驾驶舱（beat writing
cockpit）**：用可维护的节拍图驱动「下一拍写什么 / 写完如何收账」。它不是通用
思维导图，不是第二份散文大纲编辑器，也不是只读的 Agent 结构浏览器。

术语见根 [`CONTEXT.md`](../../CONTEXT.md) Novel writing domain；后续改 Overview、
写作 prompt、仿写 seed 或 `story_beat` 表时必须遵守本 ADR。

## Context

2026-11-25 设计诊断表明故事线同时承担四类职责（进度看板、多类型边可视化、半
编辑器、写作入口），并存在三套可漂移的「结构真相」：

1. **`.cinyuverse/outline.md`** — 立项、大量旧写作模板、仿写 seed 仍以散文大纲
   为「故事结构」；Overview **几乎不读**。
2. **`.cinyuverse/story-graph.json`** — Overview（React Flow）与
   `infer-beat` / `write-beat` / `update-state` 的操作骨架；节拍 status 由本地
   `completeBeatAndAdvance` 推进。
3. **SQLite `story_beat` / `story_beat_edge`** — migration、host 命令与前端
   `storyGraphApi` 已存在，但 Overview **从不调用**；读写只走文件树 API。

此外还有：伏笔表格式分裂（scaffold 表格 / 顶栏 checkbox 统计 / 仿写另一种表头）；
撰写→回写→确认推进过碎；人不能直接改节拍字段；图缺少主线图层；仿写 seed 不产
`story-graph.json`。

若不先锁主职与权威，后续任何「修图表」或「接 DB」都会继续叠平行模型。

## Decision

### 1. 主职：节拍驾驶舱

Overview 的成功标准是：作者能围绕 **当前节拍** 完成「推演 → 撰写 → 状态收账 →
推进下一拍」，且图与 `.cinyuverse/` 记忆侧车不长期脱节。

明确 **不是**：

- 大纲可视化优先（大纲若存在，服务于驾驶舱，不反过来）
- 纯看板（status 筛选可以有，但不能替代写作闭环）
- 仅 Agent 结构浏览器（人必须能维护节拍模型，不能只靠改 JSON）

### 2. 操作权威：`story-graph.json`

- **推进、写作绑定、节拍声明（hooks ids、completion_criteria、chapter 绑定）**
  以仓库内 `.cinyuverse/story-graph.json` 为唯一操作权威。
- Host 继续组装 `BeatContextPack`（伏笔池对账、邻域图、状态/摘要/角色摘录）注入
  prompt；记忆侧车（`hooks.md`、`current-state.md`、`chapter-summaries.md`）由
  Agent 按 `update-state` 回写，**不**另立第二套节拍图。
- 同一项目在任意时刻应至多一个 `current` 节拍；推进逻辑必须强制该不变量。

### 3. `outline.md`：派生或降级，不再与图并列权威

- 新功能与 Overview 闭环 **不得** 再把 `outline.md` 当作可写的结构权威。
- 允许保留为：人可读摘要、由图表导出的视图、或遗留 prompt 的只读输入——但一旦
  与 `story-graph.json` 冲突，以图为准。
- 立项 scaffold / 仿写 seed 的后续改造应产出可用的 `story-graph.json`；不得只写
  outline 却假装故事线已就绪。

### 4. SQLite `story_beat`：冻结死层，禁止第三真相

- 在 Overview 与文件权威未收敛前，**不得** 把 UI 接到 `storyGraphApi` / DB 图，也
  **不得** 做 JSON↔DB 双写。
- 默认后续：删除或明确标记废弃未使用的 host/API 表面，避免新代码误用；若将来要
  迁库，必须是 **一次性迁移 + 单一权威切换**，并废止文件权威——不在本 ADR 批准
  双轨并存。

### 5. 图表与闭环的产品约束（指导后续实现，本 ADR 不改代码）

- **图层**：默认只渲染主线（`sequential` / `causal`）；伏笔线、角色弧按需叠加。
- **模型可编辑**：侧栏可改 chapter 绑定、hooks 声明、完成条件并写回 JSON；连边
  不得把弧节点 id 当 beat id。
- **仪式缩短**：撰写后的「回写状态 + 推进」须成为可感知状态机，禁止只靠 banner
  记忆「确认推进」。
- **伏笔一种格式**：池表与统计、仿写 seed 共用同一种 `hooks.md` 表格契约；禁止
  顶栏再扫 checkbox 任务列表冒充伏笔数。
- **Context pack 可预览**：作者应能看见即将注入会话的结构化上下文（可只读）。

## Consequences

### 改造优先级（已拍板排序；实施另开变更）

1. **统一真相** — prompt/scaffold/seed 对齐文件图权威；冻结或移除死 `storyGraphApi`
2. **图层化图表** — 默认主线；伏笔/角色弧可选
3. **节拍一等编辑** — chapter 绑定、hooks、完成条件侧栏写回
4. **收紧写作仪式** — 写完 → 回写 → 推进状态机
5. **仿写/立项对齐** — seed 与新建项目产出可用 graph；hooks 表头统一

### 正面

- 产品语言与 Overview 实现方向一致，减少 outline/图/DB 三漂移。
- Agent 与 Host 分工清晰：Host 持图与 context pack；Agent 写正文与记忆侧车。

### 代价 / 风险

- 旧 `plan-chapter` 等仍读 `outline.md` 的模板需逐个降级或改读图，短期两套文案
  仍可能并存——以本 ADR 为冲突裁决，不得再增强 outline 权威。
- 删除死 DB API 前需确认无外部调用方；冻结期禁止新引用。

## Alternatives considered

- **大纲可视化优先**：与当前 Overview 投资（React Flow + beat prompts）相反，且
  无法表达伏笔边与推进状态机。
- **SQLite 为权威、文件仅导出**：与现网 Agent「改仓库文件」工作流冲突，且 Overview
  从未接线；成本高于收益。
- **双写 JSON + DB**：制造第三漂移源，明确拒绝。
