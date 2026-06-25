<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'

export type RightActivityBarItem = {
  id: string
  label: string
  icon?: Component
  disabled?: boolean
}

export type RightPanelContent = {
  id: string
  title: string
  minWidth?: number
  defaultWidth?: number
}

const props = defineProps<{
  items: RightActivityBarItem[]
  panels: RightPanelContent[]
  activeId: string | null
  onActiveChange: (id: string | null) => void
}>()

const isCollapsed = ref(false)
const panelWidth = ref<Record<string, number>>({})
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)
const activePanelRef = ref<string | null>(null)

const activePanel = computed(() => props.panels.find((p) => p.id === props.activeId))

function getPanelWidth(panelId: string) {
  const panel = props.panels.find((p) => p.id === panelId)
  const storedWidth = panelWidth.value[panelId]
  if (storedWidth) return storedWidth
  const defaultWidth = panel?.defaultWidth || 340
  const minWidth = panel?.minWidth || 260
  return Math.max(defaultWidth, minWidth)
}

const currentWidth = computed(() => (props.activeId ? getPanelWidth(props.activeId) : 0))

function handleMouseDown(e: MouseEvent) {
  if (!props.activeId) return
  e.preventDefault()
  e.stopPropagation()
  dragStartX.value = e.clientX
  dragStartWidth.value = getPanelWidth(props.activeId)
  activePanelRef.value = props.activeId

  const onMove = (ev: MouseEvent) => {
    isDragging.value = true
    const deltaX = dragStartX.value - ev.clientX
    const panel = props.panels.find((p) => p.id === activePanelRef.value)
    const minWidth = panel?.minWidth || 260
    const maxWidth = window.innerWidth * 0.5
    const finalWidth = Math.max(minWidth, Math.min(dragStartWidth.value + deltaX, maxWidth))
    if (activePanelRef.value) {
      panelWidth.value = { ...panelWidth.value, [activePanelRef.value]: finalWidth }
    }
  }

  const stopDrag = () => {
    isDragging.value = false
    activePanelRef.value = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', stopDrag)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', stopDrag)
}

onUnmounted(() => {
  isDragging.value = false
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

watch(
  () => props.activeId,
  (activeId) => {
    if (activeId && isCollapsed.value) isCollapsed.value = false
  },
)

function handleItemClick(item: RightActivityBarItem) {
  if (item.disabled) return
  props.onActiveChange(item.id)
}
</script>

<template>
  <div class="right-shell">
    <div
      v-if="isDragging"
      class="resize-overlay"
      @mouseup="isDragging = false"
    />

    <aside
      v-if="activeId && activePanel && !isCollapsed"
      class="right-panel"
      :style="{ width: currentWidth + 'px', minWidth: (activePanel.minWidth || 260) + 'px' }"
    >
      <div class="right-panel-header">
        <span class="right-panel-title">{{ activePanel.title }}</span>
        <div class="right-panel-actions">
          <button type="button" class="icon-btn" title="折叠" @click="toggleCollapse">
            <ChevronRight :size="16" />
          </button>
          <button type="button" class="icon-btn" title="关闭" @click="onActiveChange(null)">
            <X :size="16" />
          </button>
        </div>
      </div>
      <div class="right-panel-body">
        <slot :name="activePanel.id" />
      </div>
      <div
        class="resize-handle-left"
        :class="{ dragging: isDragging }"
        @mousedown.stop="handleMouseDown"
      />
    </aside>

    <aside v-if="isCollapsed && activeId" class="right-rail">
      <button type="button" class="rail-btn" title="展开" @click="isCollapsed = false">
        <ChevronLeft :size="18" />
      </button>
    </aside>

    <aside class="right-rail">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="rail-btn"
        :class="{ active: item.id === activeId }"
        :disabled="item.disabled"
        :title="item.label"
        @click="handleItemClick(item)"
      >
        <span v-if="item.id === activeId" class="rail-indicator" />
        <component :is="item.icon" v-if="item.icon" :size="20" />
      </button>
    </aside>
  </div>
</template>

<style scoped>
.right-shell {
  display: flex;
  position: relative;
  flex-shrink: 0;
  height: 100%;
}

.resize-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  cursor: ew-resize;
}

.right-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
}

.right-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.right-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.right-panel-actions {
  display: flex;
  gap: 2px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.right-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.resize-handle-left {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
}

.resize-handle-left:hover,
.resize-handle-left.dragging {
  background: var(--accent);
  opacity: 0.5;
}

.right-rail {
  display: flex;
  flex-direction: column;
  width: 48px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
}

.rail-btn {
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
}

.rail-btn:hover:not(:disabled),
.rail-btn.active {
  color: var(--text-main);
  background: var(--bg-hover);
}

.rail-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rail-indicator {
  position: absolute;
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px 0 0 2px;
  background: var(--accent);
}
</style>
