# CinyuVerse 架构说明

本文档描述前端分层、Tauri/Rust 后端边界与核心数据流。快速上手见 [PROJECT.md](./PROJECT.md)。

## 设计原则

1. **本地优先**：正文存磁盘，元数据与聊天存 `localStorage`（后续可迁移至项目目录）。
2. **单一 IPC 门面**：前端不直接 `invoke`，统一走 `services/desktopApi.ts`。
3. **按域拆分 UI**：`components/` 负责展示，`features/` 负责业务逻辑。
4. **模式隔离**：首页与编辑页背景、遮罩策略通过 `html[data-landing-mode]` / `html[data-ide-mode]` 分离。

## 分层总览

```
┌─────────────────────────────────────────────────────────────┐
│  pages/          Landing · IdeShell · InspirationPage         │
├─────────────────────────────────────────────────────────────┤
│  components/     按域划分的 UI 组件                           │
│    layouts · explorer · editor · viewers · ai · writing      │
│    search · terminal · theme                                 │
├─────────────────────────────────────────────────────────────┤
│  features/       业务逻辑（stores / composables / utils）     │
│  services/       desktopApi — Tauri invoke 门面             │
│  core/           类型、存储键、平台工具                       │
└──────────────────────────┬──────────────────────────────────┘
                             │ @tauri-apps/api invoke + events
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  src-tauri/ (Rust)                                          │
│  cinyuverse_fs · ai · conversation · config · main.rs       │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
src/
├── App.vue                     # 模式路由与 html data-* 属性同步
├── pages/
│   ├── Landing.vue             # 欢迎页
│   ├── IdeShell.vue            # 主 IDE 壳（ActivityBar + 三栏 + AI 抽屉）
│   └── InspirationPage.vue     # 灵感草稿（子窗口）
├── components/
│   ├── layouts/                # MenuBar、StatusBar、ActivityBar、PanelShell
│   ├── explorer/               # ExplorerTree
│   ├── editor/                 # EditorWorkspace、EditorPanel、TabsBar
│   ├── viewers/                # ViewerRegistry + 各格式预览器
│   ├── ai/                     # AiChatPanel、AiAssistantDrawer
│   ├── writing/                # MetaPanel、OutlinePanel、WritingDashboard
│   ├── search/                 # SearchPanel
│   ├── terminal/               # BottomPanel、XtermTerminal
│   └── theme/                  # ThemeSettings、BackgroundLayer
├── features/
│   ├── workspace/              # useWorkspace、localWorkspace、导出
│   ├── editor/                 # 编辑器配色、fileTypes
│   ├── theme/                  # themeStore、预设与 ICLS 解析
│   ├── chat/                   # useLocalChat、promptStore、llmStore
│   ├── writing/                # 字数统计、专注模式
│   ├── shell/                  # 壳层 composables
│   └── sidebar/                # 侧栏相关
├── services/
│   ├── desktopApi.ts           # 唯一桌面 API 入口
│   └── runtime.ts              # isTauri() / isDesktop()
├── core/
│   ├── types/                  # workspace.ts、desktop.ts
│   ├── storage/keys.ts         # localStorage 键名
│   └── platform/               # 快捷键修饰键检测
└── assets/themes.css           # 全局 CSS 变量与 IDE 面板遮罩
```

## 模块职责

| 模块 | 职责 | 主要入口 |
|------|------|----------|
| **workspace** | 打开文件夹/文件、FsNode 树、会话恢复、导出 | `useWorkspace()` |
| **editor** | CodeMirror 配色、fileTypes 分发 | `EditorPanel.vue`、`editorSchemeStore` |
| **chat** | AI 面板 UI、localStorage 会话、流式调用 | `useLocalChat()`、`AiChatPanel.vue` |
| **theme** | 预设主题、accent、背景图、面板透明度 | `useThemeStore()` |
| **writing** | 字数看板、打字机/专注模式 | `useWritingStatsStore()`、`focusModeStore` |
| **services** | Tauri 调用封装 | `desktopApi` |

## 核心数据流

### 打开文件夹 → 编辑章节

```
IdeShell.onMenuOpenFolder()
  → useWorkspace().openLocalFolder()
  → desktopApi.openFolder()          // open_folder_dialog
  → desktopApi.listDirTree()         // cv_list_dir_tree
  → desktopApi.scanFolder()          // cv_scan_folder
  → buildLocalWorkspace()            // 生成 WorkspaceDetail + 章节映射
  → ExplorerTree 展示 FsNode
  → 点击文件 → EditorWorkspace.openFile()
  → desktopApi.readFile()            // cv_read_file
  → FileViewer → EditorPanel / CodeMirror
```

### AI 流式对话

```
AiChatPanel → useLocalChat().send()
  → desktopApi.aiChatStream()
  → invoke('ai_chat_stream', { request })
  → Rust ai.rs 调用 LLM
  → 事件 ai-chat-chunk / ai-chat-end / ai-chat-error
  → 前端 onChunk 增量更新 UI
  → persistState() 写入 localStorage
```

### 主题与 IDE 遮罩

```
themeStore.applyTheme()
  → 注入 CSS 变量到 documentElement
  → applyWallpaperPanelVars() 设置 --wp-panel-alpha
App.vue syncAppModeAttr('ide')
  → html[data-ide-mode] + 可选 data-has-bg-image
themes.css
  → 外层栏位 .left-panel / .center-panel / .activity-bar / .ai-drawer-inner
     使用 --wp-panel-surface
  → 栏内子区域强制 transparent，由外层统一承担遮罩色
```

## 数据模型

### FsNode

来自 `cv_list_dir_tree`，树形结构驱动 `ExplorerTree`。

```typescript
// core/types/desktop.ts（概念）
{ name, path, is_dir, children? }
```

### WorkspaceDetail

来自 `cv_scan_folder` + `buildLocalWorkspace()`，驱动大纲、字数统计、导出。

- `volumes[]` → `chapters[]`
- 章节 `id` = 文件绝对路径
- `localFilePaths` Map 维护 id → path 映射

### 聊天与会话

`useLocalChat` 按 `workspaceId` 读写：

```
localStorage[cinyuverse-chat-{wsId}] → { sessions, messagesBySession, activeSessionId }
```

## 持久化

| 数据 | 存储 | 键名 / 位置 |
|------|------|-------------|
| 文件内容 | 用户磁盘 | — |
| 上次文件夹/文件 | localStorage | `cinyuverse:lastFolder`、`cinyuverse:lastFile` |
| 角色/大纲/聊天 | localStorage | `workspaceJsonKey(wsId, suffix)` |
| 灵感草稿 | localStorage | `cinyuverse-inspiration-{wsId}` |
| 写作统计 | localStorage | `cinyuverse-writing-stats-{wsId}` |
| 主题 / LLM | localStorage | 各 Pinia store 内部键 |

键名定义：`src/core/storage/keys.ts`。

## IdeShell 组件树

```
IdeShell.vue
├── BackgroundLayer（编辑页背景图）
├── MenuBar
├── ide-main
│   ├── ActivityBar
│   ├── left-panel
│   │   ├── ExplorerTree | SearchPanel | MetaPanel | OutlinePanel
│   │   └── resize-handle
│   └── center-column
│       └── center-workbench
│           ├── center-main
│           │   ├── center-panel → EditorWorkspace
│           │   └── BottomPanel
│           └── AiAssistantDrawer → AiChatPanel
└── StatusBar
```

状态来源：

- `useWorkspace()` — 工作区、目录树、当前文件
- `useThemeStore()` — 主题与背景
- `useWritingStatsStore()` — 写作统计
- 本地 ref — AI 面板开关、左栏宽度、底部面板

## 依赖规则

- **pages** 依赖 **features** 与 **services**，不直接 `invoke`。
- **features** 之间通过 composable / store 通信，避免 import 其他 feature 的 `.vue` 内部实现。
- 桌面与文件类型定义在 `@/core/types/`。
- 预览器通过 `ViewerRegistry` 注册，扩展新格式只需加 renderer + 注册。

## Rust 后端模块

| 模块 | 说明 |
|------|------|
| `cinyuverse_fs.rs` | `cv_*` 文件系统命令 |
| `ai.rs` | LLM 客户端、流式输出、配置 |
| `conversation.rs` | 多轮对话会话管理 |
| `config.rs` | 从 `.env` 加载 AI 与应用配置 |
| `main.rs` | 命令注册、终端、搜索、扩展宿主、Git 相关 |
| `task_decomposition/` | 需求分析与任务拆解（实验性） |

### 主要 Tauri 命令（节选）

**文件系统：** `cv_list_dir_tree`、`cv_read_file`、`cv_write_file`、`cv_create_file`、`cv_create_dir`、`cv_delete_path`、`cv_dirname`、`cv_scan_folder`

**AI：** `ai_chat_stream`、`ai_get_config`、`ai_set_config`、`ai_test_connection`

**终端：** `terminal_start`、`terminal_write`、`terminal_resize`、`terminal_kill`

**搜索：** `search_workspace`

完整列表见 `src-tauri/src/main.rs` 中 `generate_handler![...]`。

## 子窗口

`desktopApi.openInspirationWindow(wsId)` / `openDetachedPanel(panel, wsId)` 使用 Tauri `WebviewWindow`：

| URL 参数 | 用途 |
|----------|------|
| `?mode=inspiration&wsId=...` | 灵感草稿箱 |
| `?mode=detach&panel=ai` | 独立 AI 窗口 |
| `?mode=detach&panel=outline` | 独立大纲窗口 |

`App.vue` 读取 query 切换渲染分支。

## Web 与桌面差异

| 能力 | 桌面 (Tauri) | Web 预览 |
|------|--------------|----------|
| 打开文件夹 | ✅ | ❌ |
| 读写文件 | ✅ | ❌ |
| AI 流式 | ✅ | ❌ |
| 子窗口 | ✅ | ❌ |
| UI / 主题 | ✅ | ✅ |

检测：`services/runtime.ts` → `isTauri()` / `isDesktop()`。

## 后续演进

1. 项目元数据落盘：`.cinyuverse/project.json`
2. 灵感草稿与聊天迁移至 Rust 或项目目录
3. 完善 EPUB / DOCX 导出
4. 精简实验性 Rust 模块，统一 AI 对话路径
