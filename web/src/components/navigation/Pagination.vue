<script setup lang="ts">
const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ 'update:page': [value: number] }>()
const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
</script>

<template>
  <div class="inline-flex items-center gap-2 text-sm">
    <button :disabled="page <= 1" @click="emit('update:page', page - 1)">上一页</button>
    <span>{{ page }} / {{ totalPages }}</span>
    <button :disabled="page >= totalPages" @click="emit('update:page', page + 1)">下一页</button>
  </div>
</template>
