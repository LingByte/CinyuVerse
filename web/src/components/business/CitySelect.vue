<script setup lang="ts">
const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都']
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <select class="min-h-10 rounded-lg border border-[var(--cv-color-border)] px-3" :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
    <option value="">请选择城市</option>
    <option v-for="city in cities" :key="city" :value="city">{{ city }}</option>
  </select>
</template>
