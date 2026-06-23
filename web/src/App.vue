<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Toaster } from 'vue-sonner'
import Landing from '@/pages/Landing.vue'
import IdeWorkspace from '@/pages/IdeWorkspace.vue'
import InspirationPage from '@/pages/InspirationPage.vue'
import BackgroundLayer from '@/components/ide/BackgroundLayer.vue'

const appMode = ref<'landing' | 'ide' | 'inspiration'>('landing')

onMounted(() => {
  const p = new URLSearchParams(window.location.search)
  if (p.get('mode') === 'inspiration') {
    appMode.value = 'inspiration'
  }
})

function enterIDE() {
  appMode.value = 'ide'
}
</script>

<template>
  <BackgroundLayer v-if="appMode !== 'inspiration'" />
  <InspirationPage v-if="appMode === 'inspiration'" />
  <Landing v-else-if="appMode === 'landing'" @enter-ide="enterIDE" />
  <IdeWorkspace v-else />
  <Toaster position="top-center" rich-colors :duration="4000" />
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app {
  height: 100%; width: 100%; overflow: hidden;
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
}
html:not([data-has-bg-image]) body,
html:not([data-has-bg-image]) #app {
  background: var(--bg-primary);
}
</style>
