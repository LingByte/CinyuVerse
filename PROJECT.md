# CinyuVerse 项目文档

> AI 驱动的小说创作 IDE —— 三栏布局（资源管理器 / Markdown 编辑器 / AI 助手），支持桌面端与 Web 开发模式。

---

## 1. 项目简介

CinyuVerse 是一个面向长篇小说创作的集成环境：

- 以**工作区**为单位管理分卷、分章 Markdown 正文
- 通过 **WebSocket** 与 AI 实时对话、流式续写
- 创作模式下 AI 可**自主读取/写入**项目文件（世界观、大纲、章节等）
- 提供类似 IDE 的主题、壁纸、编辑器配色系统

**技术栈**

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.x、Gin、GORM、SQLite |
| 前端 | Vue 3、Pinia、Vite、CodeMirror 6 |
| 桌面 | Electron |
| AI | 通义千问（环境变量配置 LLM） |

---

## 2. 目录结构

```
CinyuVerse/
├── cmd/server/           # Go 服务入口
├── internal/
│   ├── handlers/         # HTTP / WebSocket 处理器
│   ├── models/           # 数据库模型
│   └── service/          # 工作区文件、AI 工具、导出等
├── pkg/
│   ├── config/           # 配置加载
│   ├── lingo/            # 日志、响应封装
│   └── llm/              # LLM 调用与工具
├── workspace/            # 本地工作区数据（开发时）
└── web/
    ├── electron/         # Electron 主进程
    └── src/
        ├── pages/        # Landing、IdeWorkspace
        ├── components/ide/
        ├── stores/       # themeStore、editorSchemeStore
        ├── composables/  # useWorkspace、useWebSocket
        └── config/       # 主题预设、壁纸预设
```

---

## 3. 快速启动

### 3.1 环境要求

- Go 1.21+
- Node.js 18+
- 配置 LLM（见 `pkg/config`，常用 `LLM_API_KEY` 等）

### 3.2 开发模式（推荐桌面端）

**终端 1 — 后端**

```powershell
cd C:\Users\17793\Desktop\CinyuVerse
go run ./cmd/server
```

默认监听：`http://localhost:8080`

**终端 2 — 前端 + Electron**

```powershell
cd C:\Users\17793\Desktop\CinyuVerse\web
npx tsc -p electron/tsconfig.json
npm run dev:electron
```

前端：`http://localhost:9090`

### 3.3 仅 Web 前端

```powershell
cd web
npm install
npm run dev
```

> 浏览器模式下「打开文件/文件夹」不可用，需 Electron。

### 3.4 生产打包

```powershell
cd web
npm run build:electron
npm run dist
```

Electron 生产环境会自动启动内嵌 `bin/server`。

---

## 4. 配置说明

| 变量 / 配置 | 说明 | 默认 |
|-------------|------|------|
| `ADDR` | HTTP 监听地址 | `:8080` |
| `WORKSPACE_DIR` | 工作区根目录 | `./workspace` |
| `DSN` | SQLite 连接串 | 本地 data 目录 |
| `LLM_*` | 模型 API 地址、Key、模型名 | 见 `.env` / config |

桌面端数据目录：

- 数据库：`userData/data`
- 工作区：`userData/workspace`

---

## 5. 用户功能一览

### 5.1 IDE 工作区

- 创建 / 打开 / 关闭工作区
- 分卷、分章树形目录
- Markdown 章节编辑（语法高亮）
- 手动保存 `Ctrl+S`、**30 秒自动保存**
- 左右栏拖拽宽度；侧边栏 / AI 面板可隐藏
- 编辑器字体缩放
- 状态栏：连接状态、总字数、卷章数、导出快捷入口

### 5.2 AI 助手（右侧面板）

| 模式 | 说明 |
|------|------|
| **对话** | 纯聊天，不读项目文件 |
| **创作** | AI 调用工具读写工作区 |

创作子模式：续写、改写、扩写、缩写、润色；支持「续写下一章」一键操作。

可调：模型、温度、最大 token、上下文窗口（2K–32K / 无限制）。

交互：流式输出、工具进度、停止生成、**插入正文到当前章节**。

### 5.3 导入 / 导出

- 导出全书 **TXT** / **Markdown**
- 桌面端：打开 `.md`/`.txt` 文件或文件夹批量导入为工作区

### 5.4 主题与外观

- **16 套 UI 主题**（8 浅 + 8 深）+ 5 种强调色
- **自定义 UI 主题**、对比度检测、跟随系统明暗
- **8 套内置壁纸** + 自定义上传
- 壁纸亮度 / 遮罩 / 面板不透明度
- 主题与壁纸联动、**纯色工作模式**
- **7 套编辑器配色**（Darcula、IDEA Light 等）+ 自定义
- 导入导出：`.cin-theme`、`.cin-scheme`、IDEA `theme.json`、`.icls`、`.jar/.zip` 主题包

### 5.5 Electron 桌面专属

- 本地文件 / 文件夹导入
- 窗口最小化 / 最大化 / 关闭
- 隐藏原生菜单，使用应用内菜单栏

---

## 6. 后端 API 概览

前缀默认 `/api`。

### 工作区（IDE 使用 ✅）

```
POST   /workspace
GET    /workspace/list
GET    /workspace/:id
PUT    /workspace/:id
DELETE /workspace/:id
POST   /workspace/:id/volumes
POST   /workspace/:id/volumes/:volId/chapters
GET    /workspace/:id/volumes/:volId/chapters/:chId
PUT    /workspace/:id/volumes/:volId/chapters/:chId
GET    /workspace/:id/wordcount
```

### AI 流式（IDE 使用 ✅）

```
WS     /ws/ai/stream
```

消息类型：`chat` | `create` | `new_chapter` | `stop`

### 导出（IDE 使用 ✅）

```
GET    /export/:id/txt
GET    /export/:id/md
```

### 已实现、IDE 未接入 ❌

```
POST   /ai/chat
POST   /ai/sessions
GET    /ai/sessions
GET    /ai/sessions/:id/messages
POST   /ai/sessions/:id/chat
...
GET    /novels/*
POST   /recognize
```

---

## 7. 工作区文件格式

```
workspace/
└── {书名}_novel_{id}/
    ├── meta.json          # 书名、类型、世界观、人物、大纲、文风
    ├── vol001/
    │   ├── chapter_001.md
    │   └── chapter_002.md
    └── vol002/
        └── chapter_001.md
```

---

## 8. AI 对话「记忆」说明

### 当前行为

| 项目 | 现状 |
|------|------|
| **对话模式** | 通过 `POST /api/ai/chat` 写入后端 Session，刷新后从 `GET /api/ai/sessions/:id/messages` 恢复 |
| **创作模式** | WebSocket 流式生成；结束后通过 `POST /api/ai/sessions/:id/messages` 追加 user/assistant 对 |
| **按工作区隔离** | 每个工作区独立 Session 列表（`workspaceId` 查询）；当前活跃 Session ID 存于 `localStorage` |
| **历史 UI** | 聊天区渲染完整消息气泡；右上角可切换/新建历史会话 |
| **对话模式流式** | 暂未实现，发送后显示「AI 正在思考…」再一次性展示回复 |

状态栏「记忆：N 条」表示：当前工作区 Session 中已加载的消息条数（持久化于 SQLite）。

### 常见情况

1. **刷新页面**：对话会从后端 Session 恢复（需已打开同一工作区）
2. **切换工作区**：自动加载该工作区对应的 Session / 历史
3. **新建对话**：创建新 Session，旧 Session 仍可在历史列表中找回
4. **创作模式**：流式输出期间界面只显示当前流；完成后写入 Session 并刷新气泡列表

### API 端点（IDE 已对接）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/ai/sessions?workspaceId=` | 列出工作区会话 |
| POST | `/api/ai/sessions` | 创建会话 |
| GET | `/api/ai/sessions/:id/messages` | 加载消息历史 |
| POST | `/api/ai/chat` | 对话模式一轮问答 |
| POST | `/api/ai/sessions/:id/messages` | 追加消息（创作模式同步） |
| DELETE | `/api/ai/sessions/:id` | 删除当前会话 |

前端封装：`web/src/api/chat.ts`，状态管理：`web/src/composables/useChatSession.ts`。

---

## 9. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前章节 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换 AI 面板 |
| `Ctrl+,` | 打开主题设置 |
| `Ctrl+Enter` | 发送 AI 消息（输入框内） |
| `Ctrl+0` | 重置编辑器缩放 |

---

## 10. 已知限制

- 删除卷/章节：前端 UI 有入口，**后端无对应 DELETE API**
- 浏览器模式无法打开本地文件/文件夹
- 小说库页面（`/api/novels`）前端已移除，API 仍保留
- 文档识别 API 无前端入口
- **AI 对话无跨会话持久化**（见第 8 节）

---

## 11. 相关文件索引

| 功能 | 主要文件 |
|------|----------|
| IDE 主界面 | `web/src/pages/IdeWorkspace.vue` |
| AI 面板 | `web/src/components/ide/AiChatPanel.vue` |
| WebSocket | `web/src/composables/useWebSocket.ts` |
| 工作区 API | `web/src/composables/useWorkspace.ts` |
| 主题系统 | `web/src/stores/themeStore.ts` |
| 壁纸层 | `web/src/components/ide/BackgroundLayer.vue` |
| WS 后端 | `internal/handlers/ws_stream.go` |
| 工作区服务 | `internal/service/workspace/` |
| 会话 API | `internal/handlers/chat.go` |

---

*文档版本：2026-06-23 · 与当前 main 分支 IDE 功能同步*
