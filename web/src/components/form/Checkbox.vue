<script setup lang="ts">
defineProps<{ modelValue: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="inline-flex items-center gap-2 text-sm">
    <input type="checkbox" :checked="modelValue" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span>{{ label }}</span>
  </label>
</template>
