import { createApp } from 'vue'
import '@/style/global.css'
import App from '@/App.vue'
import { i18nPlugin } from '@/i18n'
import { installHttpClient } from '@/utils/axios'

const app = createApp(App)
installHttpClient(app)
app.use(i18nPlugin('zh')).mount('#app')
