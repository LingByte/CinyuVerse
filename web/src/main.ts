import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ArcoVue from '@arco-design/web-vue'
import '@arco-design/web-vue/dist/arco.css'
import '@/styles/base.css'

import App from '@/App.vue'
import router from '@/router'

const root = document.getElementById('app')
if (!root) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<pre style="padding:16px;font-family:system-ui">Fatal: 找不到 #app，请检查 index.html</pre>',
  )
} else {
  const app = createApp(App)
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue]', info, err)
  }
  app.use(createPinia())
  app.use(router)
  app.use(ArcoVue)
  router.onError((err) => {
    console.error('[Vue Router]', err)
  })
  app.mount(root)
}
