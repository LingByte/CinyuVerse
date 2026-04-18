<script setup lang="ts">
import { useRouter } from 'vue-router'
import { AppShellLayout } from '@/components/layout'
import { WORKSPACE_NAV_ITEMS } from '@/config/workspace-nav'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const router = useRouter()

function goInspiration() {
  void router.push({ name: 'inspiration-root' })
}
</script>

<template>
  <AppShellLayout
    :title="appStore.title"
    :menu-items="WORKSPACE_NAV_ITEMS"
    :header-nav-items="WORKSPACE_NAV_ITEMS"
  >
    <template #header-extra>
      <a-button type="primary" @click="goInspiration">灵感中心</a-button>
    </template>
    <router-view />
  </AppShellLayout>
</template>
