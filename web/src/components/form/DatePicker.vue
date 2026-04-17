<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    type="date"
    class="w-full min-h-11 rounded-xl border border-[var(--cv-color-border)] bg-[var(--cv-color-surface)] px-3.5"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
