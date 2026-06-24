import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/style/global.css'
import '@/assets/themes.css'
import App from '@/App.vue'
import { useThemeStore } from '@/stores/themeStore'
import { useEditorSchemeStore } from '@/stores/editorSchemeStore'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

useEditorSchemeStore(pinia)
const themeStore = useThemeStore(pinia)

app.mount('#app')
themeStore.applyTheme()
