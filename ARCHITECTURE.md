# CinyuVerse 架构说明

本文档描述前端分层、Tauri/Rust 后端边界与数据流。快速上手见 [PROJECT.md](./PROJECT.md)。

## 分层总览

```
┌─────────────────────────────────────────────────────────────┐
│  pages/          Landing · IdeShell · InspirationPage         │
├─────────────────────────────────────────────────────────────┤
│  components/     按域划分的 UI 组件                           │
│    layouts · explorer · editor · viewers · ai · writing · theme│
│    search · git · terminal · extensions  ← 自 cy 合并（样式保留）│
├─────────────────────────────────────────────────────────────┤
│  features/       业务逻辑（stores / composables / utils）     │
│  services/       desktopApi — Tauri invoke 门面             │
│  core/           类型、存储键、平台工具                       │
└──────────────────────────┬──────────────────────────────────┘
                             │ @tauri-apps/api invoke
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  src-tauri/ (Rust)                                          │
│  cinyuverse_fs · ai · conversation · git · terminal · ...   │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
web/src/
├── App.vue                 # 模式路由：landing / ide / inspiration / detach
├── pages/
│   ├── Landing.vue         # 欢迎页
│   ├── IdeShell.vue        # 主 IDE 壳（ActivityBar + 三栏布局）
│   ├── InspirationPage.vue # 灵感草稿（可独立子窗口）
│   └── IdeShell.vue        # 主 IDE 壳
├── components/
│   ├── layouts/            # MenuBar、StatusBar、ActivityBar、ResizableRightPanel
│   ├── explorer/           # ExplorerTree
│   ├── editor/             # EditorWorkspace、EditorPanel、TabsBar
│   ├── viewers/            # ViewerRegistry + 各格式预览器
│   ├── ai/                 # AiChatPanel
│   ├── writing/            # MetaPanel、OutlinePanel、WritingDashboard
│   └── theme/              # ThemeSettings、BackgroundLayer
├── features/
│   ├── workspace/          # useWorkspace、导出、localWorkspace
│   ├── editor/             # 编辑器配色、fileTypes
│   ├── theme/              # themeStore
│   ├── chat/               # useLocalChat
│   ├── writing/            # 字数统计、专注模式
│   └── shell/              # 壳层 composables
├── services/
│   ├── desktopApi.ts       # 唯一桌面 API 入口
│   └── runtime.ts          # isTauri() / isDesktop()
└── core/
    ├── types/              # workspace.ts、desktop.ts
    ├── storage/keys.ts     # localStorage 键名
    └── platform/           # 快捷键修饰键
```

## 模块职责

| 模块 | 职责 | 主要入口 |
|------|------|----------|
| **workspace** | 打开文件夹/文件、FsNode 树、会话恢复、导出 | `useWorkspace()` |
| **editor** | CodeMirror、fileTypes 分发、预览器 | `EditorPanel.vue` |
| **chat** | AI 面板 UI、localStorage 会话 | `AiChatPanel.vue` |
| **theme** | 预设主题、accent、背景图 | `useThemeStore()` |
| **writing** | 字数看板、打字机模式 | `useWritingStatsStore()` |
| **services** | Tauri 调用封装 | `desktopApi` |

## 数据模型

1. **FsNode** — 来自 `cv_list_dir_tree`，驱动 ExplorerTree 与 EditorPanel。
2. **WorkspaceDetail** — 来自 `cv_scan_folder` + `buildLocalWorkspace()`，驱动大纲、字数、导出。

章节 `id` 在本地模式下等于**文件绝对路径**。

## 持久化

| 数据 | 存储 | 键名 |
|------|------|------|
| 文件内容 | 用户磁盘 | — |
| 上次文件夹/文件 | localStorage | `cinyuverse:lastFolder` 等 |
| 角色/大纲/聊天 | localStorage | `workspaceJsonKey(wsId, suffix)` |
| 灵感草稿 | localStorage | `inspirationFallbackKey(wsId)` |
| 主题/统计 | localStorage | 各 store 内部 |

## 页面数据流

```
IdeShell.vue
  ├── useWorkspace()       → desktopApi (cv_*)
  ├── EditorWorkspace      → EditorPanel → viewers / CodeMirror
  ├── LeftSidebar          → ExplorerTree + Meta/Outline
  ├── AiChatPanel          → useLocalChat
  └── stores (theme/writing/focus)
```

## 依赖规则

- **pages** 依赖 **features** 与 **services**，不直接 `invoke`。
- **features** 不 import 其他 feature 的 `.vue` 内部实现（少量例外如 ThemeSettings）。
- 桌面类型定义在 `@/core/types/desktop.ts`。

## Rust 后端模块

| 模块 | 说明 |
|------|------|
| `cinyuverse_fs.rs` | 文件系统 cv_* 命令 |
| `ai.rs` | LLM 客户端与流式输出 |
| `conversation.rs` | 对话管理 |
| `main.rs` | 命令注册、Git、终端、扩展等 |

## 子窗口

`desktopApi.openInspirationWindow` / `openDetachedPanel` 使用 Tauri `WebviewWindow` 打开带 query 参数的 URL：

- `?mode=inspiration&wsId=...`
- `?mode=detach&panel=ai|outline&wsId=...`

`App.vue` 根据 query 切换渲染模式。

## 后续演进

1. 项目元数据落盘：`.cinyuverse/project.json`
2. 灵感草稿迁移到 Rust 持久化（可选）
3. 前端 AI 面板接入 `ai_chat_stream`
4. 删除 legacy `IdeWorkspace.vue` 或合并进 IdeShell
