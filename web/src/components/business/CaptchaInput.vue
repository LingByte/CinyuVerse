<script setup lang="ts">
defineProps<{ modelValue: string; code?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <input class="min-h-10 rounded-lg border border-[var(--cv-color-border)] px-3" :value="modelValue" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    <span class="rounded bg-slate-100 px-2 py-1 font-mono text-sm tracking-widest">{{ code ?? 'A7K9' }}</span>
  </div>
</template>
