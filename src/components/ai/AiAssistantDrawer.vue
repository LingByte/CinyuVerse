<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <aside
    class="ai-drawer"
    :class="{ 'ai-drawer--open': open }"
    role="complementary"
    aria-label="AI 助手"
    :aria-hidden="!open"
  >
    <div class="ai-drawer-inner">
      <div class="ai-drawer-header">
        <span class="ai-drawer-title">AI 助手</span>
        <button type="button" class="ai-drawer-close" title="关闭 (⌘L / Ctrl+L)" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>
      <div class="ai-drawer-body">
        <slot />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-drawer {
  flex-shrink: 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  border-left: 1px solid transparent;
  transition:
    width 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    border-color 0.2s ease;
}

.ai-drawer--open {
  width: min(420px, 40vw);
  border-left-color: var(--border);
}

.ai-drawer-inner {
  display: flex;
  flex-direction: column;
  width: min(420px, 40vw);
  height: 100%;
  background: transparent;
}

.ai-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ai-drawer-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  letter-spacing: 0.02em;
}

.ai-drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.ai-drawer-close:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.ai-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
