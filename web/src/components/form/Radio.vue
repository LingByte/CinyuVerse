<script setup lang="ts">
defineProps<{ modelValue: string; value: string; label?: string; name?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="inline-flex items-center gap-2 text-sm">
    <input type="radio" :name="name" :value="value" :checked="modelValue === value" @change="emit('update:modelValue', value)" />
    <span>{{ label ?? value }}</span>
  </label>
</template>
