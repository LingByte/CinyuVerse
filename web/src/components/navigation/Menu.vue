<script setup lang="ts">
defineProps<{ items: { key: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <nav class="grid gap-1">
    <button
      v-for="item in items"
      :key="item.key"
      class="rounded-lg px-3 py-2 text-left text-sm"
      :class="item.key === modelValue ? 'bg-[var(--cv-color-primary-soft)] text-[var(--cv-color-primary-strong)]' : ''"
      @click="emit('update:modelValue', item.key)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>
