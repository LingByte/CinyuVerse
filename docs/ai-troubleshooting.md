# AI 故障排除

## 启动时未加载配置

**现象：** 终端显示「未找到 .env 文件」或 AI 请求始终失败。

**处理：**

```bash
cp src-tauri/.env.example src-tauri/.env
# 编辑并填入 AI_PROVIDER / AI_BASE_URL / AI_API_KEY / AI_MODEL
npm run dev:tauri   # 必须重启
```

确认终端出现：

```
✅ 成功加载 AI 配置
✅ AI 配置已自动设置到全局变量
```

## 发送消息后无响应或报错

### 1. Ollama 未运行

**现象：** 连接 `localhost:11434` 失败。

```bash
# 确认服务可达
curl http://localhost:11434/api/tags

# 拉取配置中指定的模型
ollama pull qwen2.5
```

### 2. 模型名称错误

**现象：** 404 或 model not found。

检查 `.env` 中 `AI_MODEL` 与 `ollama list` 中的名称一致。

### 3. API Key 无效（云端 API）

**现象：** 401 / 403。

- 重新复制 API Key，避免多余空格
- 确认 `AI_BASE_URL` 与服务商文档一致
- 检查账户余额与配额

### 4. 网络 / 防火墙

**现象：** 超时、连接被拒绝。

- 检查代理与防火墙
- 国内访问 OpenAI 官方 API 可能需要代理
- 可改用国内 OpenAI 兼容接口或本地 Ollama

### 5. .env 格式错误

- 每行 `KEY=VALUE`，不要加引号除非值中含空格
- 修改后必须重启 `npm run dev:tauri`
- 不要用 UTF-8 BOM 保存（Windows 记事本偶发问题）

## 流式输出中断

**现象：** 只显示部分内容后停止。

1. 查看 Tauri 终端 Rust 侧错误日志
2. 检查模型上下文长度是否超限
3. 尝试缩短输入或换更小模型

## Web 模式下 AI 不可用

**说明：** `desktopApi.aiChatStream` 在 Web 预览模式会抛出「仅桌面端可用」。请使用 `npm run dev:tauri`。

## 调试步骤清单

1. [ ] `.env` 存在且四项 AI 变量已填
2. [ ] 重启 `npm run dev:tauri`
3. [ ] 终端有「成功加载 AI 配置」
4. [ ] Ollama / 云端 API 可独立访问
5. [ ] 模型名正确
6. [ ] 在 IDE 中已打开工作区文件夹
7. [ ] 查看 Rust 终端完整错误栈

## 测试连接

在 `src-tauri/` 目录（若脚本存在）：

```bash
node test-ai-connection.cjs
node debug-ai-chat.cjs
```

## 仍无法解决？

1. 记录 Tauri 终端完整错误信息
2. 记录 `.env` 中 `AI_PROVIDER`、`AI_BASE_URL`、`AI_MODEL`（**不要**泄露 Key）
3. 对照 [ai-configuration-guide.md](./ai-configuration-guide.md) 逐项核对

## 相关代码位置

| 层级 | 文件 |
|------|------|
| 前端调用 | `src/services/desktopApi.ts` → `aiChatStream` |
| 前端逻辑 | `src/features/chat/composables/useLocalChat.ts` |
| Rust AI | `src-tauri/src/ai.rs` |
| 配置加载 | `src-tauri/src/config.rs` |
| 命令注册 | `src-tauri/src/main.rs` → `ai_chat_stream` |
