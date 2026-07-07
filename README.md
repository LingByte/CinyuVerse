# CinyuVerse

本地优先的 **AI 小说创作 IDE**。桌面端通过 **Tauri + Rust** 读写本地文件、调用 LLM；前端为 **Vue 3 + TypeScript**。可选连接 **Go Story** 后端管理书籍流水线。

## 快速开始

```bash
npm install
cp src-tauri/.env.example src-tauri/.env   # 可选，配置 AI
npm run dev:tauri
```

- 开发地址：`http://localhost:9090/`
- Tauri 自动打开桌面窗口；首次 Rust 编译约 1～3 分钟

仅 Web 预览：`npm run dev`（无本地文件系统能力）。

## 使用指南

日常写作流程、AI 流水线、批量任务、审校、备份、Go 后端桥接等，见 **[docs/usage-guide.md](./docs/usage-guide.md)**。

简要步骤：

1. 进入 IDE → **文件 → 打开文件夹**
2. `Ctrl+L` 打开 AI 助手（简易对话或三层流水线）
3. ActivityBar 使用设定 / 大纲 / 任务 / 备份等面板
4. 可选：在 `backend/` 运行 `go run ./cmd/server` 使用「后端」面板

## 文档导航

| 文档 | 说明 |
|------|------|
| [docs/usage-guide.md](./docs/usage-guide.md) | **使用指南（推荐）** |
| [PROJECT.md](./PROJECT.md) | 环境、结构、功能清单 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层架构与数据流 |
| [docs/quick-start.md](./docs/quick-start.md) | 安装与首次运行 |
| [docs/ai-configuration-guide.md](./docs/ai-configuration-guide.md) | AI 服务配置 |
| [docs/README.md](./docs/README.md) | 全部文档索引 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 1.x + Rust |
| 前端 | Vue 3 + TypeScript + Pinia |
| 编辑器 | CodeMirror 6 |
| 可选后端 | Go Story HTTP API |
| 构建 | Vite 8 + vue-tsc + Cargo |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev:tauri` | 桌面开发（推荐） |
| `npm run dev` | 仅 Web 预览 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build:tauri` | 打包桌面应用 |

## 许可证

见 [LICENSE](./LICENSE)。
