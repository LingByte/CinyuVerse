# 文档索引

CinyuVerse 项目文档分为**核心文档**与**专题文档**两类。

## 核心文档（仓库根目录）

| 文档 | 说明 |
|------|------|
| [README.md](../README.md) | 项目入口、快速命令 |
| [PROJECT.md](../PROJECT.md) | 环境、结构、功能清单 |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | 分层架构、数据流、Rust 模块 |

## 专题文档（本目录）

| 文档 | 说明 |
|------|------|
| [usage-guide.md](./usage-guide.md) | **使用指南**（AI、任务、审校、备份、Go 桥接） |
| [quick-start.md](./quick-start.md) | 安装与首次运行 |
| [ai-configuration-guide.md](./ai-configuration-guide.md) | AI 服务配置（Ollama / OpenAI 兼容） |
| [ai-panel-usage.md](./ai-panel-usage.md) | AI 面板使用说明 |
| [ai-troubleshooting.md](./ai-troubleshooting.md) | AI 常见问题排查 |

## 历史 / 规划文档

以下文档来自早期合并或规划阶段，**部分内容已过时**。请以 [ARCHITECTURE.md](../ARCHITECTURE.md) 与源码为准。

| 文档 | 说明 |
|------|------|
| [technical-architecture.md](./technical-architecture.md) | 已废弃，见 ARCHITECTURE.md |
| [ai-coding-assistant-roadmap.md](./ai-coding-assistant-roadmap.md) | AI 编码助手路线图（历史） |
| [phase-1-implementation-summary.md](./phase-1-implementation-summary.md) | 阶段一实施总结（历史） |
| [task-decomposition-implementation.md](./task-decomposition-implementation.md) | Rust 任务分解模块说明 |
| [AI编程编辑器-需求文档(PRD).md](./AI编程编辑器-需求文档(PRD).md) | 产品需求文档（历史） |

## 推荐阅读顺序

1. [README.md](../README.md) → `npm run dev:tauri`
2. [usage-guide.md](./usage-guide.md) → 日常写作与 v0.3 功能
3. [ARCHITECTURE.md](../ARCHITECTURE.md) → 跟一条「打开文件夹 → 编辑 → AI」链路
4. [ai-configuration-guide.md](./ai-configuration-guide.md) → 配置并测试 AI
5. 按需查阅故障排除与面板使用
