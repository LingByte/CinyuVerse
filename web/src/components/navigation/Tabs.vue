<script setup lang="ts">
defineProps<{ items: { key: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="inline-flex rounded-lg border border-[var(--cv-color-border)] p-1">
    <button
      v-for="item in items"
      :key="item.key"
      class="rounded-md px-3 py-1.5 text-sm"
      :class="item.key === modelValue ? 'bg-[var(--cv-color-primary)] text-white' : ''"
      @click="emit('update:modelValue', item.key)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
