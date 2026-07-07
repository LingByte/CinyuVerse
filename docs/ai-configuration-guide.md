# AI 服务配置指南

CinyuVerse 的 AI 对话由 **Rust 后端**（`src-tauri/src/ai.rs`）发起，前端通过 `desktopApi.aiChatStream()` 接收流式事件。配置写在 `src-tauri/.env` 中。

## 创建配置文件

```bash
cp src-tauri/.env.example src-tauri/.env
```

也可将 `.env` 放在仓库根目录，Rust 配置加载器会按优先级查找（见 `src-tauri/src/config.rs`）。

## 配置项说明

| 变量 | 说明 | 示例 |
|------|------|------|
| `AI_PROVIDER` | 提供方类型 | `Ollama` 或 `OpenAI` |
| `AI_BASE_URL` | API 基地址 | `http://localhost:11434` |
| `AI_API_KEY` | API 密钥 | `ollama`（本地可填占位） |
| `AI_MODEL` | 模型名称 | `qwen2.5` |

## 方案一：本地 Ollama（推荐入门）

1. 安装 [Ollama](https://ollama.ai/)
2. 拉取模型：

```bash
ollama pull qwen2.5
```

3. 配置 `src-tauri/.env`：

```env
AI_PROVIDER=Ollama
AI_BASE_URL=http://localhost:11434
AI_API_KEY=ollama
AI_MODEL=qwen2.5
```

4. 重启应用：`npm run dev:tauri`

## 方案二：OpenAI 官方

```env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

## 方案三：OpenAI 兼容 API

适用于通义千问、DeepSeek、Moonshot 等兼容接口。

**通义千问（DashScope 兼容模式）示例：**

```env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=your-dashscope-api-key
AI_MODEL=qwen-turbo
```

**DeepSeek 示例：**

```env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=your-deepseek-key
AI_MODEL=deepseek-chat
```

## 验证配置

启动 `npm run dev:tauri` 后，终端应出现：

```
✅ 成功加载 AI 配置
✅ AI 配置已自动设置到全局变量
```

在 IDE 中 `Ctrl+L` 打开 AI 面板，发送测试消息。若失败，见 [ai-troubleshooting.md](./ai-troubleshooting.md)。

也可在 `src-tauri/` 目录运行测试脚本（若存在）：

```bash
node test-ai-connection.cjs
```

## 前端如何调用

```
AiChatPanel
  → useLocalChat().sendMessage()
  → desktopApi.aiChatStream({ model, messages }, onChunk)
  → invoke('ai_chat_stream')
  → 监听事件：ai-chat-chunk / ai-chat-end / ai-chat-error
```

模型列表与 prompt 模板在前端 Pinia store 中管理：

- `src/features/chat/stores/llmStore.ts`
- `src/features/chat/config/promptTemplates.ts`

## 安全提示

- 勿将含真实 API Key 的 `.env` 提交到 Git（已在 `.gitignore` 中）
- 分享截图时注意遮挡密钥

## 相关文档

- [ai-panel-usage.md](./ai-panel-usage.md) — 面板功能说明
- [ai-troubleshooting.md](./ai-troubleshooting.md) — 故障排除
