<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 bg-black/30" @click.self="emit('close')">
    <aside class="absolute right-0 top-0 h-full w-[420px] max-w-full bg-white p-4">
      <header class="mb-2 text-base font-semibold">{{ title }}</header>
      <slot />
    </aside>
  </div>
</template>
