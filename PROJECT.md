# CinyuVerse 项目文档

> AI 驱动的小说创作 IDE —— 三栏布局（资源管理器 / Markdown 编辑器 / AI 助手），支持 Electron 桌面端与 Web 开发模式。

---

## 1. 项目简介

CinyuVerse 是一个面向**长篇小说创作**的集成环境：

- 以**工作区**为单位管理分卷、分章 Markdown 正文
- 通过 **WebSocket** 与 AI 实时对话、流式续写；**Session API** 持久化对话历史
- 创作模式下 AI 可**自主读取/写入**项目文件（世界观、大纲、章节等）
- 人物卡、世界观词条、三级大纲、时间线、回收站、章节快照
- 多格式导出（TXT / MD / EPUB / DOCX / 网文平台）
- 16 套 UI 主题、壁纸玻璃化、编辑器配色、打字机专注模式

**技术栈**

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.25、Gin、GORM、SQLite |
| 前端 | Vue 3、Pinia、Vite、CodeMirror 6 |
| 桌面 | Electron |
| AI | OpenAI 兼容 API（通义千问 / Ollama 等，环境变量配置） |

---

## 2. 目录结构

```
CinyuVerse/
├── cmd/server/                 # Go 服务入口
├── internal/
│   ├── handlers/               # HTTP / WebSocket 处理器
│   ├── models/                 # 数据库模型（Session、Message 等）
│   └── service/
│       ├── workspace/          # 工作区文件、AI 工具、大纲、回收站
│       └── export/             # TXT / MD / EPUB / DOCX / 网文平台导出
├── pkg/
│   ├── config/                 # 配置加载
│   ├── lingo/                  # 日志、响应封装
│   └── llm/                    # LLM 流式调用与工具
├── workspace/                  # 本地工作区数据（开发时，已 gitignore）
└── web/
    ├── electron/               # Electron 主进程（多窗口、灵感箱、文件关联）
    └── src/
        ├── pages/              # Landing、IdeWorkspace、InspirationPage
        ├── components/ide/     # 编辑器、AI 面板、大纲、设定、回收站等
        ├── composables/        # useWorkspace、useWebSocket、useChatSession
        ├── stores/             # themeStore、focusModeStore、llmStore 等
        └── api/                # ide.ts、chat.ts
```

---

## 3. 快速启动

### 3.1 环境要求

- Go 1.21+（项目 go.mod 为 1.25）
- Node.js 18+
- LLM API Key（见 §4）

### 3.2 开发模式（推荐 Electron 桌面端）

**终端 1 — 后端**

```powershell
cd C:\Users\17793\Desktop\CinyuVerse
go run ./cmd/server
```

默认：`http://localhost:8080`

**终端 2 — 前端 + Electron**

```powershell
cd C:\Users\17793\Desktop\CinyuVerse\web
npx tsc -p electron/tsconfig.json
npm run dev:electron
```

- 前端 Dev Server：`http://localhost:9090`
- Electron 窗口应自动弹出

> 开发模式下需**手动启动 Go 后端**；生产打包后 Electron 会自动启动内嵌 `bin/server`。

### 3.3 仅 Web 浏览器

```powershell
cd web
npm install
npm run dev
```

浏览器模式不支持：打开本地文件夹、灵感悬浮窗、拆出独立窗口、部分文件关联。

### 3.4 生产打包

```powershell
cd web
npm run build:electron
npm run dist
```

---

## 4. 配置说明

| 变量 | 说明 | 默认 |
|------|------|------|
| `ADDR` | HTTP 监听 | `:8080` |
| `WORKSPACE_DIR` | 工作区根目录 | `./workspace` |
| `DSN` | SQLite 连接串 | 见 config |
| `LLM_API_KEY` | 大模型 API Key | — |
| `LLM_BASE_URL` | OpenAI 兼容 Base URL | — |
| `LLM_MODEL` | 默认模型名 | — |
| `LLM_PROVIDER` | 提供方标识 | `openai` |

桌面端（Electron 生产）数据目录：

| 路径 | 内容 |
|------|------|
| `userData/data/` | SQLite 数据库 |
| `userData/workspace/` | 小说工作区 |
| `userData/inspiration/` | 灵感草稿 JSON |

---

## 5. 功能一览

### 5.1 IDE 工作区

- 创建 / 打开 / 关闭工作区；分卷、分章树形目录
- Markdown 章节编辑（CodeMirror 语法高亮）
- `Ctrl+S` 保存、**30 秒自动保存**
- 左右栏拖拽宽度；`Ctrl+B` / `Ctrl+J` 切换侧栏与 AI 面板
- 编辑器字体缩放（`Ctrl+±` / `Ctrl+0`）
- **左侧栏四标签**：目录 · 设定 · 大纲 · 回收站

### 5.2 设定面板（人物 / 世界观）

- **人物卡**：姓名、年龄、身份、性格、关系、故事线、对话风格
- **世界观词条库**：分类、可检索词条
- 数据存 `characters.json` / `glossary.json`，自动同步到 `meta.json` 供 AI 读取

### 5.3 大纲面板

- **三级结构**：全书总纲 → 分卷大纲 → 章节小节
- **时间线视图**：事件、时间、人物、描述
- 点击章节节点**跳转编辑器**；导出 / 导入 Markdown 思维导图
- 数据存 `outline.json`

### 5.4 回收站与章节快照

- 删除卷/章节移入回收站，**7 天内可恢复**
- 每次保存前自动创建章节快照（最多 30 个/章）
- **视图 → 章节历史版本**：diff 对比 + 一键回滚

### 5.5 写作数据看板

- 点击状态栏**字数**或 **视图 → 写作数据看板**
- 总字数 / 有效正文 / 今日新增 / 目标进度 / 分卷统计 / 近 14 日柱状图

### 5.6 AI 助手

| 模式 | 说明 |
|------|------|
| **对话** | REST `POST /api/ai/chat`，不读文件；Session 持久化 |
| **创作** | WebSocket 流式；AI 调用工具读写工作区 |

**创作子模式**：续写、剧情推演、冲突、伏笔、对话优化、摘要、查重、改写、扩写、缩写、润色

**其他**：多模型切换（含 Ollama 预设）、Prompt 文风模板、全局设定注入 systemPrompt、历史会话切换、插入正文

### 5.7 导入 / 导出

| 格式 | 入口 |
|------|------|
| TXT / Markdown | 文件菜单 / 状态栏 |
| EPUB / DOCX | 文件菜单 |
| 番茄 / 起点 / 晋江 | 文件菜单（分卷排版 + 基础违禁词过滤） |
| 大纲 Markdown | 大纲面板「导出」 |

桌面端：打开 `.md` / `.txt` 文件或文件夹批量导入。

### 5.8 主题与外观

- 16 套 UI 主题 + 5 强调色；8 套壁纸；7 套编辑器配色
- 壁纸亮度 / 面板透明度 / 纯色专注模式 / 主题联动
- **打字机专注模式**（视图菜单）：隐藏侧栏、AI、菜单栏、状态栏

### 5.9 Electron 桌面专属

| 功能 | 快捷键 / 入口 |
|------|----------------|
| 灵感草稿箱 | `Ctrl+Shift+I` 或 视图菜单 |
| 拆出 AI 面板 | 视图 → 拆出 AI 面板 |
| 拆出大纲面板 | 视图 → 拆出大纲面板 |
| 文件关联 | 双击 `.md` / `.txt` / `.cinv` |
| 窗口控制 | 文件菜单（最小化 / 最大化 / 关闭） |

---

## 6. 后端 API 概览

前缀：`/api`

### 工作区

```
POST/GET/PUT/DELETE  /workspace[...]
POST/DELETE          /workspace/:id/volumes[...]
POST/GET/PUT/DELETE  /workspace/:id/volumes/:volId/chapters/:chId
GET/POST             /workspace/:id/volumes/:volId/chapters/:chId/snapshots[...]
GET/PUT              /workspace/:id/characters
GET/PUT              /workspace/:id/glossary
GET/PUT              /workspace/:id/outline
POST                 /workspace/:id/outline/import-md
GET                  /workspace/:id/trash
POST                 /workspace/:id/trash/:trashId/restore
GET                  /workspace/:id/stats?target=
GET                  /workspace/:id/wordcount
```

### AI

```
WS                   /ws/ai/stream
POST                 /ai/chat
POST/GET/DELETE      /ai/sessions[...]
POST                 /ai/sessions/:id/messages
```

### 导出

```
GET  /export/:id/txt
GET  /export/:id/md
GET  /export/:id/epub
GET  /export/:id/docx
GET  /export/:id/platform/:platform   # fanqie | qidian | jjwxc
GET  /export/:id/outline-md
```

### 遗留（待清理）

```
GET  /novels/*
POST /recognize
```

---

## 7. 工作区文件格式

```
workspace/
└── {书名}_novel_{id}/
    ├── meta.json           # 书名、类型、世界观、人物、大纲、文风、卷章索引
    ├── characters.json     # 人物卡结构化数据
    ├── glossary.json       # 世界观词条
    ├── outline.json        # 三级大纲 + 时间线
    ├── .snapshots/           # 章节历史快照
    ├── vol001/
    │   └── chapter_001.md
    └── vol002/
        └── chapter_001.md

workspace/.trash/             # 全局回收站（7 天过期）
```

---

## 8. AI 对话与记忆

| 项目 | 行为 |
|------|------|
| 对话模式 | `POST /api/ai/chat` → SQLite Session；刷新后恢复 |
| 创作模式 | WebSocket 流式 → 完成后 `POST .../messages` 追加历史 |
| 工作区隔离 | `workspaceId` 查询 Session；活跃 ID 存 localStorage |
| 全局记忆 | 世界观 / 人物 / 大纲 / Prompt 模板注入 systemPrompt |
| 对话流式 | 暂未实现（显示「AI 正在思考…」后一次性展示） |

前端：`web/src/api/chat.ts`、`web/src/composables/useChatSession.ts`

### 创作模式 AI 工具（后端）

`ReadProjectFiles` · `WriteChapter` · `AppendChapterContent` · `UpdateProjectSetting` · `SearchProject` · `ListProjectStructure` · `CreateVolume` · `PreparePlotBranches` · `RecallForeshadowing` · `GetDialogueStyleGuide` · `ScanDuplicateContent`

---

## 9. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前章节 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换 AI 面板 |
| `Ctrl+,` | 主题设置 |
| `Ctrl+Enter` | 发送 AI 消息 |
| `Ctrl+0` | 重置编辑器缩放 |
| `Ctrl+Shift+I` | 灵感草稿箱（Electron） |
| `Esc` | 退出打字机专注模式 |

---

## 10. 已知限制

- 浏览器模式无法打开本地文件夹；无 Electron 多窗口 / 灵感箱
- 对话模式非流式输出
- 大纲暂不支持拖拽排序、`.xmind` 导入
- PDF 导出、云同步、插件生态未实现
- `/api/novels` 冗余 API 待清理

---

## 11. 相关文件索引

| 功能 | 路径 |
|------|------|
| IDE 主界面 | `web/src/pages/IdeWorkspace.vue` |
| 左侧栏（目录/设定/大纲/回收站） | `web/src/components/ide/LeftSidebar.vue` |
| AI 面板 | `web/src/components/ide/AiChatPanel.vue` |
| 大纲 | `web/src/components/ide/OutlinePanel.vue` |
| 人物/词条 | `web/src/components/ide/MetaPanel.vue` |
| WebSocket | `web/src/composables/useWebSocket.ts` |
| Session | `web/src/composables/useChatSession.ts` |
| 工作区 | `web/src/composables/useWorkspace.ts` |
| 主题 | `web/src/stores/themeStore.ts` |
| Electron 主进程 | `web/electron/main.ts` |
| WS 后端 | `internal/handlers/ws_stream.go` |
| 工作区服务 | `internal/service/workspace/` |
| 导出 | `internal/service/export/` |
| 会话 API | `internal/handlers/chat.go` |

---

## 12. 产品路线图（规划中）

> 已实现项见 §5–§8；以下为后续迭代方向。

| 模块 | 状态 | 说明 |
|------|------|------|
| 核心创作增强 | 部分 ✅ | 待：批量章节工具、批注书签、拖拽大纲 |
| AI 能力升级 | 部分 ✅ | 待：校对、会话分组、记忆裁剪 |
| 桌面体验 | 部分 ✅ | 待：布局预设记忆、.cinv 完整格式 |
| 主题美化 | 部分 ✅ | 待：动态壁纸、主题社区 |
| 工程打包 | 规划中 | 自动更新、便携版 |
| 协作 / Web / 性能 / 生态 | 规划中 | 见历史路线图 §12 详细条目 |

### 短期迭代完成情况

| # | 任务 | 状态 |
|---|------|------|
| 1 | 卷/章 DELETE + 回收站 | ✅ |
| 2 | 人物卡 + 世界观词条 | ✅ |
| 3 | Ollama 模型预设 | ✅ |
| 4 | 打字机专注模式 | ✅ |
| 5 | EPUB / DOCX / 网文平台导出 | ✅ |
| 6 | Prompt 模板 | ✅ |
| 7 | 章节快照与对比 | ✅ |
| 8 | 写作数据看板 | ✅ |
| 9 | Session 全局记忆 | ✅ |
| 10 | 灵感箱 + 多窗口拆分 | ✅ |
| 11 | 三级大纲 + 时间线 | ✅ |
| 12 | AI 创作工具集（推演/伏笔/查重等） | ✅ |

---

*文档版本：2026-06-23 · 与当前 dev-chenjie 分支功能同步*
