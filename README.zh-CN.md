# Cinyuverse

<p align="center">
  <a href="./README.md">English</a> · 简体中文
</p>

<p align="center">
  <strong>AI 原生小说创作平台</strong><br />
  多 Agent 协作写作，本地优先数据归属。
</p>

<p align="center">
  <a href="https://cinyuverse.com"><img src="https://img.shields.io/badge/Website-cinyuverse.com-111111?style=flat-square" alt="Official website" /></a>
  <a href="https://github.com/LingByte/CinyuVerse/releases/latest"><img src="https://img.shields.io/badge/Download-Latest_Release-111111?style=flat-square" alt="Download latest release" /></a>
  <img src="https://img.shields.io/badge/Desktop-macOS_%7C_Windows_%7C_Linux-111111?style=flat-square" alt="Desktop platforms" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-111111?style=flat-square" alt="Apache 2.0 License" /></a>
</p>

<p align="center">
  <a href="https://cinyuverse.com">官网</a> ·
  <a href="https://cinyuverse.com/docs">文档</a> ·
  <a href="https://github.com/LingByte/CinyuVerse/releases/latest">下载</a>
</p>

Cinyuverse 是一个 AI 原生小说创作平台。它通过结构化工作流协调多个写作 Agent — 规划师、作者、审校编辑、修订编辑、角色设计师 — 同时把所有文件、对话和元数据保留在你控制的机器上。

## 为什么需要 Cinyuverse

用单个编码 Agent 写小说会做的一地鸡毛。Agent 能编辑文件，但不懂伏笔池、人物弧光、时间线连贯性或章节节奏。Cinyuverse 通过给 Agent 提供领域专用工作区和结构化交接来解决这个问题。

### Agent 看到什么

创建项目时，Cinyuverse 自动搭建 `.cinyuverse/` 元数据目录：

```text
.cinyuverse/
  CLAUDE.md             — 写作规范（ACP Agent 自动读取）
  project.json          — 书籍信息（书名、题材、目标字数）
  outline.md            — 大纲（卷/章结构）
  world-view.md         — 世界观设定
  writing-rules.md      — 写作规则、视角、禁词表
  hooks.md              — 伏笔池（open / progressing / resolved）
  current-state.md      — 当前世界状态事实
  chapter-summaries.md  — 章节摘要滚动窗口
  style-sample.md       — 文风参考样本
  characters/           — 角色卡（一个角色一个 .md 文件）
chapters/               — 章节正文（chapter-NN.md）
```

Agent 读取这些文件获取上下文，把结果写到对应位置。作者无需手动写 prompt — 工作区本身就是上下文。

### 写作工作流

Cinyuverse 内置 14 个 prompt 模板，驱动 Agent 完成小说创作全流程：

| 阶段 | 模板 | 做什么 |
| --- | --- | --- |
| **作品基础** | `init-foundation`, `revise-foundation` | 生成故事圣经、卷大纲、写作规则、初始伏笔 |
| **章节创作** | `plan-chapter`, `write-chapter`, `update-state` | 规划备忘录 → 撰写正文 → 更新摘要/伏笔/状态 |
| **审校修订** | `audit-chapter`, `revise-chapter` | 8 维度审计 → 针对性修订 |
| **角色管理** | `create-character`, `refine-character` | 生成和完善角色卡 |
| **世界观** | `expand-world-view`, `add-glossary` | 深化世界观，补充设定词条 |
| **工具** | `continuity-check`, `writing-stats`, `export-prep` | 全书连贯性检查、字数统计、导出准备 |

每个模板是纯函数，构建结构化 prompt 告诉 Agent 读哪些文件、做什么、结果写到哪。

### 多 Agent 协作

Agent 通过委派和图工作流协作：

- **委派：** 父 Agent 在对话中把工作交给其他已启用 Agent。子会话拥有独立时间线与回合。
- **Graph Workflow：** 以 JSON DAG 描述步骤依赖后再执行。源文件可纳入 Git；发布后的定义版本不可变。
- **Automation：** 在手动操作或到达计划时间时，启动一次普通回合，或启动某个已发布的 Workflow 版本。

一次审查链可以使用委派（规划 → 撰写 → 审校 → 修订）。需要复用、版本化并按计划重复执行的流程写成 Graph。

## 核心能力

### ACP 原生 Agent 运行时

Cinyuverse 通过 [Agent Client Protocol（ACP）](https://agentclientprotocol.com/) 连接编码 Agent。内置 Agent 包括 Claude Code、Codex、DeepSeek Harness、Cursor、OpenCode 等。ACP 官方注册表中的兼容 Agent 走同一套管线。

Agent 运行时管理连接、会话、prompt、权限、终端、MCP/Skill/配置面和对话流。对话基于事件溯源，渲染为时间线。

### 本地优先数据归属

项目、会话、配置与诊断数据保存在用户控制的 Host 上。Cinyuverse 不运营云端数据托管，也不会自动将数据上传到云端服务。

> [!IMPORTANT]
> Cinyuverse 仍在活跃开发中。请使用版本控制并备份重要项目，在提交前检查 Agent 产生的变更。

### Rust + Tauri 架构

桌面壳使用 Tauri 2。领域逻辑以 Rust crate 实现。界面使用 React 与 TypeScript。桌面 command、Web 路由与远程适配器调用同一套 Application Core。

```text
frontend/        React + TypeScript + Vite 用户界面
src-tauri/       Tauri 桌面壳、系统集成与 IPC 命令
crates/          Agent、会话、Git、插件、自动化与服务
packages/        插件 SDK 与 CLI
shared/          从 Rust 生成的 TypeScript 类型
```

### 插件生态

Cinyuverse 插件是可安装、可启停、可配置的产品功能单元。同一包可以向界面、Agent、Host 与 Runtime 贡献能力。官方捆绑插件覆盖会话增强、多智能体协同、工作流创建、Office 预览与插件开发。

## 下载与安装

安装包从 [GitHub Releases](https://github.com/LingByte/CinyuVerse/releases/latest) 获取。

| 平台 | 系统基线 | 架构 | 安装包 |
| --- | --- | --- | --- |
| macOS | macOS 12 或更高版本 | Intel / Apple Silicon | `.dmg` |
| Windows | Windows 10 / 11 | x64 / ARM64 | `.exe` / `.msi` |
| Linux | Ubuntu 22.04 同等基线 | x64 / ARM64 | `.AppImage` / `.deb` |

首次启动会进入引导，探测本机已有 Agent Runtime，并选择启用的 Agent 和默认 Agent。缺失的托管组件在后台安装。

## 开发

### 环境要求

- Node.js 22，pnpm 10.x
- Rust nightly，见 `rust-toolchain.toml`
- 当前平台所需的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)
- 至少一个可供联调的 Agent CLI

### 命令

```bash
pnpm install
pnpm run dev          # 启动桌面应用 + HMR
pnpm run check        # tsc --noEmit + cargo check
pnpm run lint         # eslint + clippy
pnpm run format       # cargo fmt + prettier
cd frontend && pnpm test
cargo test --workspace
pnpm run tauri:build
```

`pnpm run dev` 启动 React / Vite 前端、Tauri 桌面壳与 Rust 服务。修改共享 Rust 类型后运行 `pnpm run generate-types`。修改 SQL 查询或迁移后运行 `pnpm run prepare-db`。

## 致谢

Cinyuverse 的 Agent 接入建立在 [Agent Client Protocol](https://agentclientprotocol.com/) 之上。内置 Agent 与 Registry Agent 通过 ACP 进入统一的安装、认证、会话与落地管线。

项目采用 [Apache License 2.0](./LICENSE)。
