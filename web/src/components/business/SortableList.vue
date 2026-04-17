<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ items: string[] }>()
const emit = defineEmits<{ reorder: [items: string[]] }>()
const dragIndex = ref(-1)

const onDrop = (index: number) => {
  if (dragIndex.value < 0 || dragIndex.value === index) return
  const next = [...props.items]
  const [moved] = next.splice(dragIndex.value, 1)
  next.splice(index, 0, moved)
  emit('reorder', next)
  dragIndex.value = -1
}
</script>

<template>
  <ul class="grid gap-2">
    <li
      v-for="(item, idx) in items"
      :key="item"
      draggable="true"
      class="cursor-move rounded border px-3 py-2 text-sm"
      @dragstart="dragIndex = idx"
      @dragover.prevent
      @drop="onDrop(idx)"
    >
      {{ item }}
    </li>
  </ul>
</template>
