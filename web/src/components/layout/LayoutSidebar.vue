<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WorkspaceNavItem } from '@/config/workspace-nav'

/** @deprecated 请使用 WorkspaceNavItem，保留别名以兼容旧引用 */
export type SidebarMenuItem = WorkspaceNavItem

const props = defineProps<{
  collapsed: boolean
  /** 与顶栏同源，建议传入 WORKSPACE_NAV_ITEMS */
  items: WorkspaceNavItem[]
}>()

const route = useRoute()
const router = useRouter()

const selectedKeys = computed(() => {
  const name = route.name
  if (typeof name !== 'string') {
    return props.items[0] ? [props.items[0].key] : []
  }
  const hit = props.items.find((i) => i.routeName === name)
  return hit ? [hit.key] : props.items[0] ? [props.items[0].key] : []
})

function onMenuItemClick(key: string) {
  const item = props.items.find((i) => i.key === key)
  if (item) {
    void router.push({ name: item.routeName })
  }
}
</script>

<template>
  <a-layout-sider
    class="layout-sidebar"
    :width="220"
    :collapsed="collapsed"
    :collapsible="false"
    breakpoint="lg"
  >
    <a-menu
      :selected-keys="selectedKeys"
      :collapsed="collapsed"
      @menu-item-click="onMenuItemClick"
    >
      <a-menu-item v-for="it in items" :key="it.key">
        <span class="layout-sidebar__item-inner">
          <component :is="it.icon" v-if="it.icon" :size="18" :stroke-width="1.75" class="layout-sidebar__icon" />
          <span class="layout-sidebar__label">{{ it.label }}</span>
        </span>
      </a-menu-item>
    </a-menu>
  </a-layout-sider>
</template>

<style scoped>
.layout-sidebar {
  border-right: 1px solid var(--color-border-2);
}
.layout-sidebar :deep(.arco-layout-sider-children) {
  overflow: auto;
}
.layout-sidebar__item-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.layout-sidebar__icon {
  flex-shrink: 0;
  color: var(--color-text-2);
}
.layout-sidebar__label {
  min-width: 0;
}
</style>
