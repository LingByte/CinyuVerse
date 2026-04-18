# CinyuVerse Web

Vue 3 + TypeScript + Vite + Pinia + Vue Router + Arco Design Vue。

## 开发

```bash
cd web
npm install
npm run dev
```

默认开发服务器：`http://127.0.0.1:5173`。`/api` 已配置代理到 `http://127.0.0.1:8080`（可在 `vite.config.ts` 中修改）。

## 构建

```bash
npm run build
npm run preview
```

## 路径别名

源码中使用 `@/` 指向 `src/`，已在 `vite.config.ts` 与 `tsconfig.json` 中配置。

## HTTP 与 AI 对话 API

- `src/utils/request.ts`：axios 实例，基址默认 `VITE_API_BASE` 或 `/api`；响应拦截器解包 `{ code, data, msg }`（`code === 200`）。
- `src/types/`：`api.ts`（信封）、`chat.ts`（会话/消息/对话请求体，与 Go handler 字段对齐）。
- `src/api/ai/`：`chat.ts`、`sessions.ts`、`stream.ts`（SSE）；`recognize.ts`：`POST /recognize` 附件识别（`multipart/form-data` 字段 `file`）。
- `src/api/novels.ts`：小说 CRUD、搜索、AI 草稿、封面上传、恢复（`GET/POST /novels`、`GET/PUT/DELETE /novels/:id`、`GET /novels/search`、`POST /novels/generate`、`POST /novels/cover/upload`、`POST /novels/:id/restore`）。联调说明见工作台 **小说管理** 页折叠区。
- 灵感中心：`/inspiration` 进入后自动打开「上次会话」或列表最新一条，否则新建会话；侧栏与会话列表、删除、新建对接后端；输入区支持「附件识别」并将识别文本与输入一并发送。

环境变量放在 **`web/.env`**（Vite 默认从 `web/` 根目录加载），示例见 **`web/.env.example`**：`VITE_API_BASE=/api`。

## 布局

- `src/layouts/MainLayout.vue`：工作台（顶栏 + 侧栏 + `<router-view />`）。顶栏右侧有 **灵感中心**，进入类 ChatGPT 的独立壳层。
- `src/layouts/InspirationLayout.vue`：**灵感中心**（顶栏返回 + 会话侧栏 + 主对话区）。
- `src/config/workspace-nav.ts`：`WORKSPACE_NAV_ITEMS`（当前仅 **小说管理**），**顶栏与侧栏共用**，与 `route.name` 对齐。
- `src/components/layout/`：`LayoutHeader`、`LayoutSidebar`、`AppShellLayout`、`PageLayout`。
- 业务页建议用 `PageLayout` 包一层，统一标题区与内容宽度。
