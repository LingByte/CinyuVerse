<script setup lang="ts">
import type { ActivityBarItem } from '@/types/activity-bar'

const props = defineProps<{
  items: ActivityBarItem[]
  activeId: string
  onActiveChange: (id: string) => void
}>()

function isActive(item: ActivityBarItem) {
  return item.active ?? item.id === props.activeId
}

function handleClick(item: ActivityBarItem) {
  if (item.disabled) return
  if (item.onSelect) item.onSelect()
  else props.onActiveChange(item.id)
}
</script>

<template>
  <aside class="activity-bar">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="activity-btn"
      :class="{ active: isActive(item) }"
      :disabled="item.disabled"
      :aria-label="item.label"
      :title="item.label"
      @click="handleClick(item)"
    >
      <span v-if="isActive(item)" class="activity-indicator" />
      <component :is="item.icon" v-if="item.icon" class="activity-icon" />
    </button>
  </aside>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  width: 48px;
  flex-shrink: 0;
  background: transparent;
}

.activity-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.activity-btn:hover:not(:disabled) {
  color: var(--text-main);
  background: var(--bg-hover);
}

.activity-btn.active {
  color: var(--text-main);
}

.activity-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.activity-indicator {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
}

.activity-icon {
  width: 20px;
  height: 20px;
}
</style>
