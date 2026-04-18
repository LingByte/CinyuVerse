<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconMenuFold, IconMenuUnfold } from '@arco-design/web-vue/es/icon'
import type { WorkspaceNavItem } from '@/config/workspace-nav'

const props = defineProps<{
  title: string
  sidebarCollapsed: boolean
  /** 与侧栏同源的工作台导航，选中态与 route.name 对齐 */
  navItems?: WorkspaceNavItem[]
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
}>()

const route = useRoute()
const router = useRouter()

const activeNavKey = computed(() => {
  const name = route.name
  if (typeof name !== 'string' || !props.navItems?.length) {
    return ''
  }
  const hit = props.navItems.find((n) => n.routeName === name)
  return hit?.key ?? ''
})

function goNav(item: WorkspaceNavItem) {
  void router.push({ name: item.routeName })
}
</script>

<template>
  <a-layout-header class="layout-header">
    <div class="layout-header__left">
      <a-space :size="12" align="center">
        <a-button type="text" class="layout-header__trigger" @click="emit('toggle-sidebar')">
          <template #icon>
            <component :is="sidebarCollapsed ? IconMenuUnfold : IconMenuFold" />
          </template>
        </a-button>
        <div class="layout-header__title">{{ title }}</div>
      </a-space>
    </div>

    <nav v-if="navItems?.length" class="layout-header__nav" aria-label="工作台导航">
      <a-button
        v-for="it in navItems"
        :key="it.key"
        type="text"
        class="layout-header__nav-item"
        :class="{ 'layout-header__nav-item--active': activeNavKey === it.key }"
        @click="goNav(it)"
      >
        <span class="layout-header__nav-inner">
          <component :is="it.icon" v-if="it.icon" :size="16" :stroke-width="1.75" class="layout-header__nav-icon" />
          {{ it.label }}
        </span>
      </a-button>
    </nav>

    <div class="layout-header__right">
      <slot name="extra" />
    </div>
  </a-layout-header>
</template>

<style scoped>
.layout-header {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  padding: 0 20px 0 12px;
  border-bottom: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}
.layout-header__left {
  flex-shrink: 0;
  min-width: 0;
}
.layout-header__trigger {
  color: var(--color-text-2);
}
.layout-header__title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.layout-header__nav {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  padding: 0 8px;
}
.layout-header__nav-item {
  color: var(--color-text-2);
  font-size: 14px;
  border-radius: 6px;
  flex-shrink: 0;
}
.layout-header__nav-item:hover {
  color: rgb(var(--primary-6));
  background: var(--color-fill-2);
}
.layout-header__nav-item--active {
  color: rgb(var(--primary-6));
  font-weight: 500;
  background: var(--color-primary-light-1);
}
.layout-header__nav-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.layout-header__nav-icon {
  flex-shrink: 0;
  opacity: 0.85;
}
.layout-header__right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
