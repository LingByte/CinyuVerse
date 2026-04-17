<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number; min?: number; max?: number; step?: number }>(), { step: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <input
    type="number"
    class="w-full min-h-11 rounded-xl border border-[var(--cv-color-border)] bg-[var(--cv-color-surface)] px-3.5"
    :value="modelValue"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
  />
</template>
