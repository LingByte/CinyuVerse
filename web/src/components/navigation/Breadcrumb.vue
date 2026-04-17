<script setup lang="ts">
defineProps<{ items: { label: string }[] }>()
</script>

<template>
  <nav class="inline-flex items-center gap-2 text-sm text-[var(--cv-color-text-muted)]">
    <template v-for="(item, idx) in items" :key="`${item.label}-${idx}`">
      <span>{{ item.label }}</span>
      <span v-if="idx < items.length - 1">/</span>
    </template>
  </nav>
</template>
