# Golang 平台架构与实现指南

本文面向在仓库根目录或子目录中新增 **Go 后端** 时的推荐结构：模块划分、依赖、并发模型与外部集成。

---

## 1. 推荐目录布局（单体优先，可演进拆分）

```
/
  cmd/
    server/           # HTTP API 入口
    worker/           # 异步消费队列（可与 server 合并为单进程多 goroutine）
  internal/
    config/
    domain/           # 实体与领域规则（无 IO）
    store/            # 数据库实现（接口在 domain 或单独 ports）
    llm/              # 模型客户端、重试、流式
    embedder/         # 向量化
    retriever/        # 混合检索编排
    engine/           # 章节流水线、状态机
    api/              # HTTP handlers，dto 映射
  pkg/                # 可选：可被外部引用的稳定库
  migrations/
  docs/
```

**原则**：`internal/engine` 只依赖接口（store、llm、retriever），便于单测替换为 mock。

---

## 2. 核心接口（示意）

以下用伪接口说明边界，实际项目可用具体类型与错误包装。

```go
// 章节生成编排：engine 包
type ChapterGenerator interface {
	GenerateChapter(ctx context.Context, in GenerateChapterInput) (*GenerateChapterResult, error)
}

type GenerateChapterInput struct {
	WorkID        string
	VolumeID      string
	ChapterIndex  int
	UserPrompt    string
	Options       GenerateOptions // 温度、模型、是否跑 plan 等
}

// 持久化：store 包
type WorkStore interface {
	GetWork(ctx context.Context, id string) (*Work, error)
	// ...
}

type ChapterStore interface {
	CreateChapterDraft(ctx context.Context, ch *Chapter) error
	FinalizeChapter(ctx context.Context, id string, patch ChapterPatch) error
}

type MemoryStore interface {
	InsertChunks(ctx context.Context, chunks []MemoryChunk) error
}

type VectorIndex interface {
	Upsert(ctx context.Context, docs []VectorDoc) error
	Search(ctx context.Context, q VectorQuery) ([]SearchHit, error)
}
```

---

## 3. HTTP API 形态建议

**同步与异步分离**

- `POST /works`、`POST /works/{id}/chapters:generate` → 返回 `job_id`（202 Accepted）。
- `GET /jobs/{id}` → 状态、进度百分比、错误码、产物章节 ID。
- `GET /works/{id}/chapters/{cid}` → 拉取正文与元数据。

**流式（可选）**

- WebSocket 或 SSE：`/works/{id}/chapters/{cid}/stream` 用于边生成边展示；服务端仍将完整结果持久化后再标记完成，避免网络中断丢文。

**幂等**

- 客户端提供 `Idempotency-Key` header；服务端对同一 key 返回同一 job 结果。

---

## 4. 并发与队列

**典型负载**：生成一章可能数十秒到数分钟；应 **异步化**。

- 使用 Redis Stream、NATS、RabbitMQ 或云托管队列。
- Worker 并发度由 **模型 RPM/TPM 限额** 与 **GPU 并发** 决定，在 `engine` 层做全局令牌桶限流。

**Go 实践**

- HTTP 层只做校验与入队；`worker` 用 `context` 传递取消；对 LLM 调用设置独立超时。
- 避免在请求内开无界 goroutine；用有界 worker pool。

---

## 5. 数据库与事务

**关系型（PostgreSQL）** 适合强一致的作品元数据、版本、任务状态。

**事务边界示例**

- 一章 finalize：`chapters` 行更新 + `memory_chunks` 批量插入 + `jobs` 状态成功，同事务或 Outbox 模式。

**Outbox（推荐）**

- 同一事务写入 `outbox` 表；异步进程投递到向量索引。避免「库已提交但向量未更新」的长期不一致。

---

## 6. LLM 客户端

- 统一封装：重试、超时、可观测（token 用量、延迟）、流式解析。
- **多模型路由**：摘要用小模型、正文用大模型；在配置中切换。
- **Prompt 版本化**：`prompt_template_id` + 参数 JSON 写入 job 记录，便于复现与 A/B。

---

## 7. 配置与安全

- 使用 `Viper` / `envconfig` 等加载环境变量；**密钥不入库**。
- API Key 仅服务端持有；若未来有用户自带 Key，需加密存储与审计。
- 日志脱敏：不打印完整用户正文到 info 级别（可哈希或截断）。

---

## 8. 与前端（Vue）协作

- 现有 `web/` 可通过同源代理或独立域名调用 Go API。
- 认证：Session、JWT 或 OIDC；长篇任务建议 **长连接轮询 + SSE** 组合。

---

## 9. CI 建议

- `go test ./...`、静态检查 `staticcheck`、`golangci-lint`。
- 对 `internal/engine` 编写 **无网络** 单测：mock LLM 返回 fixture。

---

## 10. 演进路径

1. **单体**：`cmd/server` + 内嵌 worker goroutine + PostgreSQL。
2. **拆分 worker**：独立 `cmd/worker` 部署扩缩容。
3. **读写分离 / 缓存**：热门作品的 L0～L2 缓存到 Redis。
4. **多区域**：任务与存储就近；向量索引按作品分片。

更多产品与流程维度见 [production-workflow.md](./production-workflow.md) 与 [long-novel-engine.md](./long-novel-engine.md)。
