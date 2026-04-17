<script setup lang="ts">
withDefaults(defineProps<{ type?: 'info' | 'success' | 'warning' | 'error' }>(), { type: 'info' })
</script>

<template>
  <div class="rounded-lg border px-3 py-2 text-sm" :class="{
    'border-sky-300 text-sky-700': type === 'info',
    'border-emerald-300 text-emerald-700': type === 'success',
    'border-amber-300 text-amber-700': type === 'warning',
    'border-rose-300 text-rose-700': type === 'error',
  }"><slot /></div>
</template>
