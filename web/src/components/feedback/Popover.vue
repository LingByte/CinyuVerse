<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ content: string }>()
const open = ref(false)
</script>

<template>
  <span class="relative inline-flex" @mouseenter="open = true" @mouseleave="open = false">
    <slot />
    <div v-if="open" class="absolute left-0 top-[calc(100%+8px)] z-20 rounded bg-slate-900 px-2 py-1 text-xs text-white">
      {{ content }}
    </div>
  </span>
</template>
