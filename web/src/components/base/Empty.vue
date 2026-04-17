<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '暂无数据',
  description: '当前没有可展示内容',
})
</script>

<template>
  <div class="grid place-items-center gap-2 rounded-xl border border-dashed border-[var(--cv-color-border)] p-6 text-center">
    <div class="text-sm font-bold text-[var(--cv-color-text)]">{{ title }}</div>
    <div class="text-xs text-[var(--cv-color-text-muted)]">{{ description }}</div>
  </div>
</template>
