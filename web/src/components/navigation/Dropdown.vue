<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ items: { key: string; label: string }[] }>()
const emit = defineEmits<{ select: [key: string] }>()
const open = ref(false)
</script>

<template>
  <div class="relative inline-flex">
    <button type="button" class="rounded-lg border border-[var(--cv-color-border)] px-3 py-2 text-sm" @click="open = !open">
      <slot>下拉菜单</slot>
    </button>
    <div v-if="open" class="absolute top-[calc(100%+8px)] z-20 min-w-36 rounded-lg border border-[var(--cv-color-border)] bg-white p-1">
      <button v-for="item in items" :key="item.key" class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--cv-color-primary-soft)]" @click="emit('select', item.key); open = false">
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
