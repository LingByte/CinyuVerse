<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; type?: 'info' | 'success' | 'warning' | 'error' }>(), { type: 'info', description: '' })
</script>

<template>
  <div class="rounded-lg border px-3 py-2 text-sm" :class="{
    'border-sky-300 bg-sky-50': type === 'info',
    'border-emerald-300 bg-emerald-50': type === 'success',
    'border-amber-300 bg-amber-50': type === 'warning',
    'border-rose-300 bg-rose-50': type === 'error',
  }">
    <div class="font-semibold">{{ title }}</div>
    <div v-if="description" class="mt-1 text-xs">{{ description }}</div>
  </div>
</template>
