<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number; max?: number }>(), { max: 5 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <div class="inline-flex gap-1">
    <button
      v-for="idx in props.max"
      :key="idx"
      type="button"
      class="text-xl"
      :class="idx <= modelValue ? 'text-amber-400' : 'text-slate-300'"
      @click="emit('update:modelValue', idx)"
    >
      ★
    </button>
  </div>
</template>
