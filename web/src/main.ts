import { createApp } from 'vue'
import './style/global.css'
import App from './App.vue'
import { i18nPlugin } from './i18n'

createApp(App).use(i18nPlugin('zh')).mount('#app')
