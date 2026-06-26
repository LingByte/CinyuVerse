<script lang="ts">
export type EditorTab = {
  id: string
  path: string
  title: string
  isDirty: boolean
}
</script>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  tabs: EditorTab[]
  activeId: string | null
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
}>()
</script>

<template>
  <div class="tabs-bar">
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab-item"
      :class="{ active: t.id === activeId }"
      :title="t.path"
      @click="emit('activate', t.id)"
    >
      <span class="tab-title">
        {{ t.title }}
        <span v-if="t.isDirty" class="tab-dirty">•</span>
      </span>
      <button type="button" class="tab-close" aria-label="关闭" @click.stop="emit('close', t.id)">
        <X :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tabs-bar {
  display: flex;
  height: 36px;
  flex-shrink: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: transparent;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  max-width: 200px;
  height: 100%;
  padding: 0 10px;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.tab-item:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.tab-item.active {
  background: var(--bg-primary);
  color: var(--text-main);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.tab-dirty {
  color: var(--accent);
  margin-left: 2px;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.tab-close:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
</style>
