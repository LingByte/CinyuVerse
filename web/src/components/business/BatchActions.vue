<script setup lang="ts">
defineProps<{ selectedCount: number }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <div class="flex items-center justify-between rounded-lg border border-[var(--cv-color-border)] p-2 text-sm">
    <span>已选 {{ selectedCount }} 项</span>
    <button type="button" class="text-rose-600" @click="emit('remove')">批量删除</button>
  </div>
</template>
