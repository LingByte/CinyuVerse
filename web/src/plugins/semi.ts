import type { App } from 'vue'
import { ConfigProvider } from '@kousum/semi-ui-vue'
import zhCN from '@kousum/semi-ui-vue/dist/locale/source/zh_CN'

export { ConfigProvider, zhCN }

export function installSemi(app: App) {
  app.component('SemiConfigProvider', ConfigProvider)
}
