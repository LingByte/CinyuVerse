<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

export interface WorkspaceBreadcrumbTrailItem {
  label: string
  /** 不传则为纯文本（当前页） */
  to?: RouteLocationRaw
}

defineProps<{
  /** 当前页之前的链路，不含「工作台」；最后一项一般为当前页 */
  trail: WorkspaceBreadcrumbTrailItem[]
  /** 面包屑右侧灰色说明一行 */
  hint?: string
}>()
</script>

<template>
  <div class="ws-bc">
    <a-breadcrumb class="ws-bc__crumb">
      <a-breadcrumb-item>
        <RouterLink :to="{ name: 'home' }">工作台</RouterLink>
      </a-breadcrumb-item>
      <a-breadcrumb-item v-for="(it, idx) in trail" :key="idx">
        <RouterLink v-if="it.to" :to="it.to">{{ it.label }}</RouterLink>
        <template v-else>{{ it.label }}</template>
      </a-breadcrumb-item>
    </a-breadcrumb>
    <span v-if="hint" class="ws-bc__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.ws-bc {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border-2);
}
.ws-bc__crumb {
  font-size: 13px;
}
.ws-bc__crumb :deep(a) {
  color: var(--color-text-2);
  text-decoration: none;
}
.ws-bc__crumb :deep(a:hover) {
  color: rgb(var(--primary-6));
}
.ws-bc__hint {
  font-size: 12px;
  color: var(--color-text-3);
  line-height: 1.4;
}
</style>
