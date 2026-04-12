# 超长篇小说 AI 平台 — 文档索引

本目录说明如何以 **Go（Golang）** 为主栈，规划并实现一个可支撑 **百万字级及以上** 连贯叙事的 AI 小说创作平台：从产品设计到工程落地、从「能写」到「写得长且前后一致」。

## 阅读顺序

| 文档 | 内容概要 |
|------|----------|
| [production-workflow.md](./production-workflow.md) | 完整制作流程：阶段划分、交付物、里程碑、协作与验收 |
| [long-novel-engine.md](./long-novel-engine.md) | 超长篇小说核心：分卷分章、世界与角色状态、记忆检索、一致性约束、生成流水线 |
| [golang-architecture.md](./golang-architecture.md) | Go 服务端架构：模块边界、API、数据模型、异步任务、与模型提供方集成 |
| [operations-and-quality.md](./operations-and-quality.md) | 质量、安全、成本、观测与运维：评测集、人工审阅、缓存与限流 |
| [model-relations.md](./model-relations.md) | 持久化模型关系：`Work` / `Volume` / `Chapter` 等外键与唯一约束说明 |
| [system-data-flow.md](./system-data-flow.md) | **系统运作与数据流**：从配置到成书、阶段串联、一章生成的读写路径 |

## 与当前仓库的关系

当前仓库根目录以 Web 前端为主；若后续在根目录增加 `cmd/`、`internal/` 等 Go 服务，可将本目录文档作为 **单一事实来源（SSOT）** 对齐实现。新增代码时建议在本 README 中补充「实现对照表」链接到具体包路径。

## 术语约定

- **超长篇小说**：以「多卷、多章、长期连载」为形态，总字数与上下文窗口无关，由 **结构化记忆 + 分块生成 + 校验闭环** 共同保证连贯性。
- **引擎**：调度模型调用、维护小说状态机、执行检索与后处理的后端核心，不等同于「单次 Chat 接口」。
