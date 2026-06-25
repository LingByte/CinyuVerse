# CinyuVerse

本地优先的 AI 小说创作 IDE。桌面端使用 **Tauri + Rust** 访问本地文件系统；前端为 **Vue 3**，不依赖 Go 或 Electron 后端。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 1.x + Rust |
| 前端 | Vue 3 + TypeScript + Pinia |
| 编辑器 | CodeMirror 6（Markdown / 纯文本） |
| 样式 | Tailwind CSS v4 + 自定义 CSS 变量主题 |
| 构建 | Vite 8 + vue-tsc + Cargo |

## 项目结构

```
CinyuVerse/
├── Cargo.toml              # Rust workspace
├── Cargo.lock
├── package.json            # Tauri CLI（根目录 npm run dev:tauri）
├── PROJECT.md              # 本文档
├── ARCHITECTURE.md         # 架构说明
├── LICENSE
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # Tauri 命令注册、AI、Git、终端等
│   │   ├── cinyuverse_fs.rs # 文件系统 cv_* 命令
│   │   ├── ai.rs           # LLM 流式对话
│   │   └── ...
│   └── tauri.conf.json
└── web/                    # Vue 前端
    ├── src/
    │   ├── pages/          # Landing、IdeShell、InspirationPage
    │   ├── components/     # UI（按域划分）
    │   │   ├── layouts/    # ActivityBar、MenuBar、StatusBar
    │   │   ├── explorer/   # ExplorerTree
    │   │   ├── editor/     # EditorWorkspace、EditorPanel
    │   │   ├── viewers/    # 多格式预览
    │   │   ├── ai/         # AiChatPanel
    │   │   ├── writing/    # MetaPanel、OutlinePanel
    │   │   └── theme/      # ThemeSettings
    │   ├── features/       # 业务逻辑（stores、composables）
    │   ├── services/       # desktopApi（Tauri invoke 门面）
    │   └── core/           # 类型、存储键、平台工具
    └── package.json
```

详细架构见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 20 |
| npm | 随 Node 安装 |
| Rust | 1.70+（[rustup](https://rustup.rs/)） |
| Windows | WebView2 运行时（Win10/11 通常已内置） |

## 快速开始

### 1. 安装依赖

```bash
# 根目录：Tauri CLI
cd CinyuVerse
npm install

# 前端
cd web
npm install
```

### 2. 开发模式（推荐）

在**仓库根目录**运行：

```bash
npm run dev:tauri
```

会自动启动 Vite（`:9090`）并打开 Tauri 桌面窗口。

### 3. 仅 Web 预览

无本地文件系统能力，适合看 UI：

```bash
cd web
npm run dev
```

浏览器中打开文件夹会提示「仅桌面端可用」。

### 4. 类型检查

```bash
cd web
npm run typecheck
```

### 5. 打包发布

```bash
# 根目录
npm run build:tauri
```

产物位于 `src-tauri/target/release/`（或 bundle 子目录）。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (Vue 3) — IdeShell / EditorWorkspace          │
│  useWorkspace → services/desktopApi                     │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri invoke
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Rust 后端 (src-tauri/)                                 │
│  cv_* 文件 · AI 对话 · Git · 终端 · 扩展 · 搜索         │
└──────────────────────────┬──────────────────────────────┘
                           ▼
                    用户本地磁盘
```

## Rust 文件系统命令

前端通过 `desktopApi` 调用以下 Tauri 命令：

| 命令 | 说明 |
|------|------|
| `open_folder_dialog` | 选择文件夹 |
| `open_file_dialog` | 选择文件 |
| `cv_list_dir_tree` | 递归目录树 |
| `cv_read_file` | 读取文件（utf8 / base64） |
| `cv_write_file` | 写入文本文件 |
| `cv_create_file` / `cv_create_dir` | 新建文件/目录 |
| `cv_delete_path` | 删除文件或空目录 |
| `cv_dirname` | 取父目录 |
| `cv_scan_folder` | 扫描 `.md` / `.txt`（导出/字数） |

AI 相关：`ai_chat_stream` 等，见 `src-tauri/src/ai.rs`。

## 数据持久化

| 数据 | 存储位置 |
|------|----------|
| 章节/文件内容 | 用户选择的本地文件夹 |
| 角色卡、词条、大纲、聊天记录 | `localStorage`（按 workspace id 隔离） |
| 灵感草稿 | `localStorage`（`cinyuverse-inspiration-{wsId}`） |
| 主题、写作统计、LLM 配置 | `localStorage` |
| 上次打开的文件夹/文件 | `localStorage` |

## IDE 布局

- **左栏**：资源管理器 / 设定 / 大纲（ActivityBar 切换）
- **中栏**：EditorWorkspace 多标签 + 多格式预览
- **右栏**：AI 对话（可拆分为独立 Tauri 子窗口）
- **顶栏**：MenuBar · **底栏**：StatusBar

## ActivityBar 面板

| ID | 功能 |
|----|------|
| `explorer` | 目录树 |
| `search` | 工作区全文搜索（ripgrep） |
| `git` | 源代码管理 |
| `extensions` | Open VSX 扩展市场 |
| `meta` | 角色/词条设定 |
| `outline` | 大纲 |

底部面板：问题 / 输出 / 终端（`Ctrl+\``）

## 已实现功能

- 打开本地文件夹 / 单文件
- VS Code 风格文件树（新建、删除、右键）
- 多格式预览（文本、图片、PDF 等）
- 自动保存、会话恢复
- 角色/词条、大纲、写作看板
- 多套主题与编辑器配色
- 灵感草稿箱（Tauri 子窗口 + localStorage）
- TXT / MD 导出

## 已知限制

- Web 模式无文件系统
- AI 对话已接入 Rust 后端；需在 `.env` 配置 API Key（参考 `src-tauri/.env.example`）
- EPUB / DOCX 导出待实现
- 项目元数据尚未落盘到项目文件夹

## 快捷键（部分）

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换 AI 面板 |
| `Ctrl+,` | 外观与主题 |
| `Ctrl+Shift+I` | 灵感草稿箱 |
| `Esc` | 退出专注模式 |

（macOS 下 Ctrl 对应 Cmd）

## 关于 CinyuVerse1

`CinyuVerse1` 已合并进本仓库并**从磁盘删除**。若 Cursor 工作区仍显示该文件夹，请在 IDE 中 **Remove Folder from Workspace** 移除无效引用。

## 版本

当前版本：**0.1.0**（Tauri + Rust 本地优先版）
