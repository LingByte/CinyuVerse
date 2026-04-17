<script setup lang="ts">
defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    class="w-full min-h-10 rounded-lg border border-[var(--cv-color-border)] px-3"
    :placeholder="placeholder ?? '请输入关键词'"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
