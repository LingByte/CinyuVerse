# CinyuVerse 项目说明

本地优先的 AI 小说创作 IDE。在 VS Code 风格的三栏布局中管理章节、设定、大纲，并通过 **Rust（Tauri）** 调用 LLM 辅助写作；可选连接 **Go Story** 后端管理书籍流水线。

**使用指南**：[docs/usage-guide.md](./docs/usage-guide.md)

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 1.x + Rust |
| 前端 | Vue 3 + TypeScript + Pinia |
| 编辑器 | CodeMirror 6（Markdown / 纯文本） |
| 终端 | xterm.js |
| 样式 | Tailwind CSS v4 + 自定义 CSS 变量（`themes.css`） |
| 构建 | Vite 8 + vue-tsc + Cargo |
| 可选后端 | Go Story HTTP API（`backend/`） |

## 项目结构

```
CinyuVerse/
├── package.json              # 前端依赖与 npm 脚本
├── vite.config.ts            # Vite（端口 9090）
├── src/                      # Vue 前端
│   ├── pages/                # Landing、IdeShell、InspirationPage
│   ├── components/           # UI（editor、ai、writing、story…）
│   ├── features/             # composables、stores
│   ├── services/desktopApi.ts# Tauri invoke 唯一门面
│   └── core/                 # 类型、存储键
├── src-tauri/src/            # Rust 后端
│   ├── main.rs               # 命令注册、AI 流式
│   ├── cinyuverse_fs.rs      # 文件系统 cv_*
│   ├── project_meta.rs       # .cinyuverse 元数据、备份
│   ├── ai_pipeline.rs        # 三层流水线、异步任务队列
│   ├── stats_audit.rs        # 字数统计、剧情审校
│   ├── export_format.rs      # EPUB/DOCX/平台导出
│   ├── llm_runtime.rs        # 共享 LLM 非流式调用
│   └── …
├── backend/                  # Go Story 服务（可选）
├── docs/                     # 专题文档
├── PROJECT.md                # 本文档
└── ARCHITECTURE.md           # 架构说明
```

详细分层见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 20 |
| npm | 随 Node 安装 |
| Rust | 1.70+（[rustup](https://rustup.rs/)） |
| Go | 1.21+（仅使用 Story 后端时） |
| Windows | WebView2 运行时 |

## 快速开始

```bash
cd CinyuVerse
npm install

# 可选：AI 配置
cp src-tauri/.env.example src-tauri/.env

# 启动桌面开发
npm run dev:tauri
```

- Vite：`http://localhost:9090/`
- 首次 Rust 编译约 1～3 分钟

其他命令：

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅 Web 预览（无本地 FS / AI） |
| `npm run typecheck` | TypeScript 检查 |
| `npm run build:tauri` | 打包桌面应用 |

完整使用流程见 [docs/usage-guide.md](./docs/usage-guide.md)。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  Vue 3 — IdeShell / EditorWorkspace / WorkspaceAiPanel  │
│  features/* → services/desktopApi.ts                    │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri invoke + events
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Rust (src-tauri/)                                      │
│  文件系统 · AI 流式 · 流水线 · 审校 · 导出 · 备份        │
└──────────────────────────┬──────────────────────────────┘
                           ▼
              本地磁盘 / LLM API

┌─────────────────────────────────────────────────────────┐
│  Go Story (backend/, 可选) :4567                        │
│  书籍/章节 HTTP API — ActivityBar「后端」面板            │
└─────────────────────────────────────────────────────────┘
```

## IDE 布局

```
┌──────────────────────────────────────────────────────────────┐
│ MenuBar                                                      │
├────┬──────────────┬────────────────────────────┬─────────────┤
│Act.│ 左栏面板      │ 中栏 EditorWorkspace        │ AI Drawer   │
│Bar │ 目录/后端/    │ 多标签 + 预览               │ (Ctrl+L)    │
│    │ 搜索/设定/    │                             │ WorkspaceAi │
│    │ 大纲/版本/    │                             │ Panel       │
│    │ 任务/备份     │                             │             │
├────┴──────────────┴────────────────────────────┴─────────────┤
│ BottomPanel（终端 / 输出）                    StatusBar         │
└──────────────────────────────────────────────────────────────┘
```

### ActivityBar 面板

| ID | 功能 |
|----|------|
| `explorer` | 目录树 |
| `story` | Go Story 书籍/章节（需 Go 服务） |
| `search` | 工作区搜索 |
| `meta` | 角色与词条 |
| `outline` | 大纲与时间线 |
| `versions` | 章节版本快照 |
| `tasks` | AI 异步任务（批量润色/生成等） |
| `backup` | 增量与全量备份 |

AI 助手：**WorkspaceAiPanel**（简易单模型 / 三层流水线），`Ctrl+L` 打开抽屉。

## 核心功能（v0.3）

- 本地工作区：打开文件夹、多标签编辑、版本快照
- `.cinyuverse/` 项目元数据（角色、大纲、设定）
- **WorkspaceAiPanel**：简易对话 + Rust 三层流水线（大纲→正文→校对）
- **AI 任务队列**：批量润色/生成，自动逐章 LLM 循环
- **剧情审校**：规则检测 + LLM 深度分析
- **真增量备份**：manifest 对比，仅打包变更文件
- **导出**：TXT/MD、EPUB、DOCX、番茄/起点/晋江、分卷 ZIP
- **Go Story 桥接**：后端面板可触发本地三层流水线写回 Go 章节
- 写作统计看板、灵感草稿子窗口、终端面板、多主题

## 数据持久化

| 数据 | 存储位置 |
|------|----------|
| 章节正文 | 用户本地文件夹 |
| 项目元数据 | `.cinyuverse/`（project.json、大纲、角色等） |
| 版本历史 | `.cinyuverse/history/` |
| AI 任务 | `.cinyuverse/tasks/` |
| 备份 | `.cinyuverse/backups/` + manifest.json |
| 主题、部分 UI | `localStorage` |

## 已知限制

- Web 模式无文件系统与 Rust AI 能力
- AI 需在 `src-tauri/.env` 配置（见 [docs/ai-configuration-guide.md](./docs/ai-configuration-guide.md)）
- Go Story 后端与本地 Rust 流水线独立运行；桥接需同时打开本地工作区
- 批量任务依赖大纲章节绑定 `file_path`
- detach AI 子窗口仍使用 `AiChatPanel`，与主抽屉能力略有差异

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存 |
| `Ctrl+L` | 切换 AI 面板 |
| `Ctrl+,` | 外观与主题 |
| `Ctrl+\`` | 切换底部终端 |
| `Ctrl+Shift+I` | 灵感草稿箱 |
| `Esc` | 关闭 AI 面板 |

macOS 下 `Ctrl` 对应 `Cmd`。更多见 [docs/usage-guide.md](./docs/usage-guide.md)。

## 文档索引

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 入口与命令 |
| [docs/usage-guide.md](./docs/usage-guide.md) | **使用指南（推荐）** |
| [docs/quick-start.md](./docs/quick-start.md) | 安装与首次运行 |
| [docs/ai-configuration-guide.md](./docs/ai-configuration-guide.md) | AI 配置 |
| [docs/ai-panel-usage.md](./docs/ai-panel-usage.md) | AI 面板说明 |
| [docs/README.md](./docs/README.md) | 全部文档索引 |

## 版本

当前版本：**0.1.0**（功能迭代至 v0.3 能力集）
