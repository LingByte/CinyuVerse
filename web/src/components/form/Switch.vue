<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="relative h-6 w-11 rounded-full transition"
    :class="modelValue ? 'bg-[var(--cv-color-primary)]' : 'bg-slate-300'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute top-0.5 size-5 rounded-full bg-white transition"
      :class="modelValue ? 'left-[22px]' : 'left-0.5'"
    />
  </button>
</template>
