<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import Landing from '@/pages/Landing.vue'
import IdeShell from '@/pages/IdeShell.vue'
import InspirationPage from '@/pages/InspirationPage.vue'
import { useThemeStore } from '@/features/theme/stores/themeStore'

const appMode = ref<'landing' | 'ide' | 'inspiration'>('landing')
const detachPanel = ref<'ai' | 'outline' | null>(null)
const themeStore = useThemeStore()

function syncAppModeAttr(mode: 'landing' | 'ide' | 'inspiration') {
  const root = document.documentElement
  const inIde = mode === 'ide'
  const onLanding = mode === 'landing'

  root.toggleAttribute('data-ide-mode', inIde)
  root.toggleAttribute('data-landing-mode', onLanding)

  if (inIde) {
    if (themeStore.backgroundImage) {
      root.setAttribute('data-has-bg-image', '')
    } else {
      root.removeAttribute('data-has-bg-image')
    }
    themeStore.applyTheme()
  } else {
    root.removeAttribute('data-has-bg-image')
    root.style.removeProperty('--wp-panel-alpha')
    root.style.removeProperty('--wp-panel-blur')
  }
}

onMounted(() => {
  const p = new URLSearchParams(window.location.search)
  if (p.get('mode') === 'inspiration') {
    appMode.value = 'inspiration'
    syncAppModeAttr('inspiration')
    return
  }
  if (p.get('mode') === 'detach') {
    appMode.value = 'ide'
    const panel = p.get('panel')
    if (panel === 'ai' || panel === 'outline') detachPanel.value = panel
  }
  syncAppModeAttr(appMode.value)
})

watch(appMode, (mode) => {
  syncAppModeAttr(mode)
})

watch(
  () => themeStore.backgroundImage,
  () => {
    if (appMode.value === 'ide') syncAppModeAttr('ide')
  },
)

function enterIDE() {
  detachPanel.value = null
  appMode.value = 'ide'
}
</script>

<template>
  <InspirationPage v-if="appMode === 'inspiration'" />
  <Landing
    v-else-if="appMode === 'landing'"
    @enter-ide="enterIDE"
  />
  <IdeShell
    v-else
    :detach-panel="detachPanel"
  />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
}

html:not([data-has-bg-image]):not([data-ide-mode]):not([data-landing-mode]) body,
html:not([data-has-bg-image]):not([data-ide-mode]):not([data-landing-mode]) #app {
  background: var(--bg-primary);
}

html[data-landing-mode],
html[data-landing-mode] body,
html[data-landing-mode] #app {
  background: #ffffff !important;
  color: #0f172a;
}

html[data-ide-mode],
html[data-ide-mode] body,
html[data-ide-mode] #app {
  background: transparent !important;
}
</style>
