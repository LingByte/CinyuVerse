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
  <Transition name="ai-drawer">
    <aside v-if="open" class="ai-drawer" role="complementary" aria-label="AI 助手">
      <div class="ai-drawer-header">
        <span class="ai-drawer-title">AI 助手</span>
        <button type="button" class="ai-drawer-close" title="关闭 (⌘L / Ctrl+L)" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>
      <div class="ai-drawer-body">
        <slot />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.ai-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: min(420px, 92vw);
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.22);
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

.ai-drawer-enter-active,
.ai-drawer-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.22s ease;
}

.ai-drawer-enter-from,
.ai-drawer-leave-to {
  transform: translateX(100%);
  opacity: 0.85;
}
</style>
