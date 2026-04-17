<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number; min?: number; max?: number; step?: number }>(), { min: 0, max: 100, step: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <input
    type="range"
    class="w-full"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :value="modelValue"
    @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
  />
</template>
