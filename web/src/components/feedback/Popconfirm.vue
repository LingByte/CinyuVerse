<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ title: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const open = ref(false)
</script>

<template>
  <span class="relative inline-flex">
    <span @click="open = true"><slot /></span>
    <div v-if="open" class="absolute left-0 top-[calc(100%+8px)] z-20 w-52 rounded-lg border bg-white p-2 text-xs shadow">
      <div class="mb-2">{{ title }}</div>
      <div class="inline-flex gap-2">
        <button type="button" @click="open = false; emit('cancel')">取消</button>
        <button type="button" @click="open = false; emit('confirm')">确认</button>
      </div>
    </div>
  </span>
</template>
