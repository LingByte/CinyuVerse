# 快速开始

## 前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | 必需 |
| Rust | 1.70+ | 必需（[rustup](https://rustup.rs/)） |
| Go | 1.21+ | 仅使用「后端」Story 面板时 |
| Git | 任意 | 克隆仓库时 |

Windows 需 WebView2（Win10/11 通常已内置）。

## 安装

```bash
git clone <your-repo-url>
cd CinyuVerse
npm install
```

## 启动开发环境

**推荐：桌面模式**

```bash
npm run dev:tauri
```

- Vite：`http://localhost:9090/`
- Tauri 自动编译 Rust 并打开桌面窗口
- 首次编译可能需 1～3 分钟

**仅 Web 预览**

```bash
npm run dev
```

Web 模式无法打开本地文件夹，仅适合查看 UI。

**可选：Go Story 后端**

```bash
cd backend
go run ./cmd/server
```

默认 `http://localhost:4567`，供 ActivityBar「后端」面板使用。

## 配置 AI（可选）

```bash
cp src-tauri/.env.example src-tauri/.env
```

编辑 `src-tauri/.env`，例如本地 Ollama：

```env
AI_PROVIDER=Ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=qwen2.5
AI_API_KEY=ollama
```

确保 Ollama 已启动：

```bash
ollama pull qwen2.5
```

配置完成后**重启** `npm run dev:tauri`。详见 [ai-configuration-guide.md](./ai-configuration-guide.md)。

## 第一次使用

1. 欢迎页点击进入 IDE
2. **文件 → 打开文件夹**，选择小说项目目录
3. 左侧目录树点击 `.md` 章节编辑
4. `Ctrl+L` 打开 AI 助手（简易或三层流水线）
5. `Ctrl+,` 打开主题设置

更完整的操作流程见 **[usage-guide.md](./usage-guide.md)**。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev:tauri` | 桌面开发 |
| `npm run dev` | Web 开发 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run build` | 仅构建前端 |
| `npm run build:tauri` | 打包桌面应用 |

## 打包

```bash
npm run build:tauri
```

安装包在 `src-tauri/target/release/bundle/`（平台子目录）。

## 遇到问题？

- 使用说明 → [usage-guide.md](./usage-guide.md)
- AI 无法连接 → [ai-troubleshooting.md](./ai-troubleshooting.md)
- 架构与模块 → [../ARCHITECTURE.md](../ARCHITECTURE.md)
