import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@kousum/semi-ui-vue/dist/_base/base.css'
import '@/style/global.css'
import '@/assets/themes.css'
import App from '@/App.vue'
import { i18nPlugin } from '@/i18n'
import { installHttpClient } from '@/utils/axios'
import { useThemeStore } from '@/stores/themeStore'
import { useEditorSchemeStore } from '@/stores/editorSchemeStore'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

installHttpClient(app)
app.use(i18nPlugin('zh'))

useEditorSchemeStore(pinia)
const themeStore = useThemeStore(pinia)

app.mount('#app')
themeStore.applyTheme()
