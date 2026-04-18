<script setup lang="ts">
import { ref } from 'vue'
import LayoutHeader from '@/components/layout/LayoutHeader.vue'
import LayoutSidebar from '@/components/layout/LayoutSidebar.vue'
import type { WorkspaceNavItem } from '@/config/workspace-nav'

defineProps<{
  title: string
  /** 与顶栏同源 */
  menuItems: WorkspaceNavItem[]
  headerNavItems?: WorkspaceNavItem[]
}>()

const sidebarCollapsed = ref(false)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<template>
  <a-layout class="app-shell">
    <LayoutHeader
      :title="title"
      :sidebar-collapsed="sidebarCollapsed"
      :nav-items="headerNavItems ?? menuItems"
      @toggle-sidebar="toggleSidebar"
    >
      <template #extra>
        <slot name="header-extra" />
      </template>
    </LayoutHeader>
    <a-layout class="app-shell__body">
      <LayoutSidebar :collapsed="sidebarCollapsed" :items="menuItems" />
      <a-layout-content class="app-shell__content">
        <slot />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.app-shell {
  height: 100%;
  min-height: 100%;
}
.app-shell__body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
}
.app-shell__content {
  flex: 1 1 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--color-fill-1);
}
</style>
