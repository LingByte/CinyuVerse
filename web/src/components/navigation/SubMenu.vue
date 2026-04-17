<script setup lang="ts">
import { ref } from 'vue'
withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), { defaultOpen: false })
const open = ref(false)
</script>

<template>
  <section class="rounded-lg border border-[var(--cv-color-border)]">
    <button type="button" class="w-full px-3 py-2 text-left text-sm font-semibold" @click="open = !open">{{ title }}</button>
    <div v-if="open || defaultOpen" class="grid gap-1 px-2 pb-2">
      <slot />
    </div>
  </section>
</template>
