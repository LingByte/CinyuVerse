/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 前缀，默认 `/api`（与 Vite 代理一致） */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
