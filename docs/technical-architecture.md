# 技术架构（已迁移）

> **本文档已废弃。** 早期内容描述的是 GoPilot（React + Go 后端）架构，与当前 CinyuVerse 不符。

请阅读最新架构说明：

- **[ARCHITECTURE.md](../ARCHITECTURE.md)** — 前端分层、数据流、Rust 模块
- **[PROJECT.md](../PROJECT.md)** — 功能清单与环境要求

当前技术栈摘要：

- 前端：**Vue 3 + TypeScript + Pinia + CodeMirror 6**
- 桌面：**Tauri 1.x + Rust**
- 无 Go 后端；IPC 统一经 `src/services/desktopApi.ts`
