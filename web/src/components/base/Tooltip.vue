<script setup lang="ts">
import { ref } from 'vue'
withDefaults(defineProps<{ content: string }>(), {})
const open = ref(false)
</script>

<template>
  <span class="relative inline-flex" @mouseenter="open = true" @mouseleave="open = false" @focusin="open = true" @focusout="open = false">
    <slot />
    <span
      v-if="open"
      role="tooltip"
      class="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white"
    >
      {{ content }}
    </span>
  </span>
</template>
