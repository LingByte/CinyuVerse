<script setup lang="ts">
defineProps<{ items: string[]; current: number }>()
</script>

<template>
  <ol class="flex items-center gap-2">
    <li v-for="(item, idx) in items" :key="item" class="inline-flex items-center gap-2 text-sm">
      <span class="grid size-6 place-items-center rounded-full border" :class="idx <= current ? 'bg-[var(--cv-color-primary)] text-white' : ''">{{ idx + 1 }}</span>
      <span>{{ item }}</span>
    </li>
  </ol>
</template>
