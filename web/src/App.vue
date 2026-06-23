<script setup lang="ts">
import { ref } from 'vue'
import Landing from '@/pages/Landing.vue'
import IdeWorkspace from '@/pages/IdeWorkspace.vue'
import BackgroundLayer from '@/components/ide/BackgroundLayer.vue'

const currentPage = ref<'landing' | 'ide'>('landing')
const initialWorkspaceId = ref<string | null>(null)

function enterIDE() {
  initialWorkspaceId.value = null
  currentPage.value = 'ide'
}
</script>

<template>
  <BackgroundLayer />
  <Landing
    v-if="currentPage === 'landing'"
    @enter-ide="enterIDE"
  />
  <IdeWorkspace v-else :initial-workspace-id="initialWorkspaceId" />
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

html:not([data-has-bg-image]) body,
html:not([data-has-bg-image]) #app {
  background: var(--bg-primary);
}
</style>
