# CinyuVerse

本地优先的 AI 小说创作 IDE（Electron 桌面应用）。不依赖 Go 后端，所有文件读写通过 Electron IPC 直接操作本地磁盘。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 41 + contextBridge IPC |
| 前端 | Vue 3 + TypeScript + Pinia |
| 编辑器 | CodeMirror 6（Markdown / 纯文本） |
| 样式 | Tailwind CSS v4 + 自定义 CSS 变量主题 |
| 构建 | Vite 8 + vue-tsc + electron-builder |

## 项目结构

```
CinyuVerse/
├── PROJECT.md          # 本文档
├── LICENSE
└── web/
    ├── electron/       # 主进程：IPC、文件系统、窗口管理
    │   ├── main.ts
    │   ├── preload.ts
    │   ├── fsTree.ts   # 目录树构建与文件类型判断
    │   ├── build.ts    # 编译脚本
    │   ├── watch.ts    # 开发热编译
    │   └── run.ts      # 启动 Electron（处理 ELECTRON_RUN_AS_NODE）
    ├── src/
    │   ├── pages/      # Landing、IdeWorkspace、InspirationPage
    │   ├── components/ide/  # IDE 面板与预览器
    │   ├── composables/     # useWorkspace、useLocalChat
    │   ├── stores/          # 主题、写作统计、LLM 配置等
    │   └── utils/           # 文件类型、导出、localStorage 数据
    └── package.json
```

## 快速开始

### 环境要求

- Node.js ≥ 20（推荐 24+）
- npm

### 安装依赖

```bash
cd web
npm install
```

### 开发模式（Electron 桌面）

```bash
cd web
npm run dev:electron
```

启动后：
- Vite 开发服务器：`http://127.0.0.1:9090`
- Electron 窗口自动打开，并附带 DevTools

### 仅 Web 预览（无文件系统能力）

```bash
cd web
npm run dev
```

浏览器模式下打开文件夹/文件会提示「仅桌面端支持」。

### 类型检查

```bash
cd web
npm run typecheck
```

### 打包发布

```bash
cd web
npm run dist
```

产物输出到 `web/release/`（Windows NSIS / macOS DMG / Linux AppImage）。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (Vue 3)                                       │
│  IdeWorkspace → useWorkspace → window.electronAPI       │
│  EditorPanel  → fileTypes.detectFileType → 预览器分发    │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (invoke/handle)
┌──────────────────────────▼──────────────────────────────┐
│  Main Process (Electron)                                │
│  fsTree.buildDirTree / readFile / writeFile / dialog    │
└──────────────────────────┬──────────────────────────────┘
                           │ node:fs
┌──────────────────────────▼──────────────────────────────┐
│  用户本地磁盘（任意文件夹）                               │
└─────────────────────────────────────────────────────────┘
```

### 数据持久化

| 数据 | 存储位置 |
|------|----------|
| 章节/文件内容 | 用户选择的本地文件夹 |
| 角色卡、词条、大纲、聊天记录 | `localStorage`（按 workspace id 隔离） |
| 灵感草稿（Electron） | `{userData}/inspiration/{wsId}.json` |
| 主题、写作统计、LLM 配置 | `localStorage` |
| 上次打开的文件夹/文件 | `localStorage`（`cinyuverse:lastFolder` 等） |

## Electron IPC 接口

| 通道 | 说明 |
|------|------|
| `dialog:openFile` | 打开文件对话框，返回内容（utf8/base64） |
| `dialog:saveFile` | 保存文件对话框 |
| `dialog:openFolder` | 选择文件夹 |
| `fs:listDirTree` | 递归构建可浏览文件树 |
| `fs:readFile` | 读取单个文件 |
| `fs:writeFile` | 写入可编辑文本文件 |
| `fs:createFile` / `fs:createDir` | 新建文件/文件夹 |
| `fs:deletePath` | 删除文件或空目录 |
| `fs:scanFolder` | 扫描 `.md`/`.txt`（用于导出字数统计） |
| `window:*` | 最小化、最大化、关闭 |
| `window:openInspiration` | 打开灵感草稿子窗口 |
| `window:openDetached` | 拆出 AI / 大纲独立窗口 |
| `inspiration:list` / `inspiration:add` | 灵感草稿 CRUD |

Preload 通过 `contextBridge` 暴露为 `window.electronAPI`。

## 文件预览

`EditorPanel` 根据扩展名自动选择渲染方式：

| 类型 | 扩展名示例 | 组件 |
|------|-----------|------|
| 文本（可编辑） | `.md` `.txt` `.json` `.js` `.py` `.csv` 等 | CodeMirror 6 |
| 图片 | `.png` `.jpg` `.gif` `.webp` `.svg` | ImageViewer |
| PDF | `.pdf` | PdfViewer |
| 表格 | `.xlsx` `.xls` | SpreadsheetViewer（CSV/TSV 在编辑器中以文本打开） |
| 其他二进制 | — | BinaryPlaceholder |

## IDE 布局

三栏可调整宽度：

- **左栏**：目录（LocalFileTree）/ 设定（MetaPanel）/ 大纲（OutlinePanel）
- **中栏**：编辑器或多格式预览
- **右栏**：AI 对话面板

另有 MenuBar、StatusBar、主题设置、写作看板、灵感草稿独立窗口。

## 已实现功能

### 文件与 workspace

- [x] 打开本地文件夹 / 单文件
- [x] VS Code 风格文件树（折叠、新建、删除、右键菜单）
- [x] 多格式文件预览（文本、图片、PDF、表格占位）
- [x] 文本文件编辑与自动保存（30 秒间隔）
- [x] 上次会话恢复（文件夹 + 文件）
- [x] 系统文件关联打开（`.md` `.txt` 等）
- [x] 导出 TXT / MD（合并 workspace 内章节）

### 小说创作辅助

- [x] 角色卡 / 词条管理（MetaPanel，localStorage）
- [x] 大纲树 + 时间线（OutlinePanel，localStorage）
- [x] 大纲跳转章节
- [x] 写作数据看板（字数统计、目标进度）
- [x] 打字机专注模式
- [x] 灵感草稿箱（Electron 子窗口）

### 界面与主题

- [x] 多套预设主题 + 自定义 accent
- [x] 编辑器配色方案（ICLS / IDEA JSON 导入导出）
- [x] 主题插件包（`.jar` / `.zip`）
- [x] 背景图 / 玻璃面板
- [x] 面板布局重置、字体缩放

### 窗口

- [x] 自定义 MenuBar（隐藏系统菜单）
- [x] 窗口最小化 / 最大化 / 关闭
- [x] AI / 大纲面板拆出为独立窗口

## 尚未实现 / 已知限制

- [ ] **AI 对话与创作**：UI 完整，但未接入 Ollama / OpenAI 等 LLM 直连
- [ ] **EPUB / DOCX / 平台导出**：菜单存在，功能待前端实现
- [ ] **`.xlsx` 预览**：分类为 spreadsheet 但内容为 base64，表格预览实际不可用
- [ ] **项目元数据落盘**：角色、大纲、聊天等仍在 localStorage，未写入项目文件夹
- [ ] **文件监听**：外部修改文件不会自动刷新树
- [ ] **Web 模式**：仅 Landing 可浏览，IDE 文件操作需 Electron

## 快捷键（部分）

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换 AI 面板 |
| `Ctrl+,` | 外观与主题 |
| `Ctrl+Shift+I` | 灵感草稿箱 |
| `Esc` | 退出专注模式 |

（macOS 下 Ctrl 对应 Cmd，见 `utils/platform.ts`）

## 开发说明

- Electron 主进程编译为 **CommonJS**（`electron/tsconfig.json`）
- Preload 单独编译并重命名为 `preload.cjs`
- 开发时 `watch.ts` 监听 `electron/` 变更并自动重编译
- 类型定义单一来源：`electron/types.ts`，渲染进程通过 `src/types/electron.ts` 重导出

## 版本

当前版本：**0.1.0**（本地优先 Electron 重构版）
