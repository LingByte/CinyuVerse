<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" @click.self="emit('close')">
    <section class="w-full max-w-lg rounded-xl bg-white p-4">
      <header class="mb-2 text-base font-semibold">{{ title }}</header>
      <slot />
    </section>
  </div>
</template>
