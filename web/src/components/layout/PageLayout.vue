<script setup lang="ts">
import WorkspaceBreadcrumb from '@/components/layout/WorkspaceBreadcrumb.vue'
import type { WorkspaceBreadcrumbTrailItem } from '@/components/layout/WorkspaceBreadcrumb.vue'

defineProps<{
  /** 页面主标题（大标题区模式） */
  title?: string
  /** 副标题 / 说明文案（大标题区模式） */
  subtitle?: string
  /** 若传入则顶部使用紧凑面包屑，替代大标题 hero */
  breadcrumbTrail?: WorkspaceBreadcrumbTrailItem[]
  /** 面包屑右侧说明小字 */
  breadcrumbHint?: string
}>()
</script>

<template>
  <div class="page-layout">
    <header v-if="breadcrumbTrail?.length" class="page-layout__crumb-wrap">
      <div class="page-layout__crumb-inner">
        <WorkspaceBreadcrumb :trail="breadcrumbTrail" :hint="breadcrumbHint" />
      </div>
    </header>
    <header v-else-if="title" class="page-layout__hero">
      <div class="page-layout__hero-inner">
        <div class="page-layout__title-block">
          <h1 class="page-layout__title">{{ title }}</h1>
          <p v-if="subtitle" class="page-layout__subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.extra" class="page-layout__hero-extra">
          <slot name="extra" />
        </div>
      </div>
    </header>
    <div class="page-layout__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-layout {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.page-layout__crumb-wrap {
  flex-shrink: 0;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border-2);
}

.page-layout__crumb-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 24px 0;
  box-sizing: border-box;
}

.page-layout__hero {
  flex-shrink: 0;
  background: linear-gradient(180deg, var(--color-fill-2) 0%, var(--color-bg-2) 100%);
  border-bottom: 1px solid var(--color-border-2);
}

.page-layout__hero-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 24px 22px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
}

.page-layout__title-block {
  min-width: 0;
}

.page-layout__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--color-text-1);
  letter-spacing: 0.02em;
}

.page-layout__subtitle {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text-3);
  max-width: 640px;
}

.page-layout__hero-extra {
  flex-shrink: 0;
  padding-top: 2px;
}

.page-layout__body {
  flex: 1;
  padding: 24px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
</style>
