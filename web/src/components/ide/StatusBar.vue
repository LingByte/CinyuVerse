<script setup lang="ts">
defineProps<{
  wordCount: number
  chapterCount: number
  volumeCount: number
  connected: boolean
  streaming: boolean
  saveStatus: string
}>()

const emit = defineEmits<{
  exportTxt: []
  exportMd: []
}>()
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">
        <span class="status-dot" :class="{ connected }"/>{{ connected ? '已连接' : '未连接' }}
      </span>
      <span v-if="streaming" class="status-item streaming"><span class="spinner-sm"/>AI 生成中…</span>
      <span class="status-item">{{ wordCount.toLocaleString() }} 字</span>
      <span class="status-item">{{ volumeCount }} 卷 / {{ chapterCount }} 章</span>
    </div>
    <div class="status-right">
      <span class="status-item save-status">{{ saveStatus }}</span>
      <button class="status-btn" title="导出 TXT" @click="$emit('exportTxt')">导出 TXT</button>
      <button class="status-btn" title="导出 Markdown" @click="$emit('exportMd')">导出 MD</button>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-sub);
}

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-item {
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
}
.status-dot.connected {
  background: var(--success);
}

.spinner-sm {
  width: 10px;
  height: 10px;
  border: 1.5px solid color-mix(in oklab, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-item.streaming {
  color: var(--warning);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.save-status {
  font-style: italic;
}

.status-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-sub);
  padding: 1px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
}
.status-btn:hover { border-color: var(--accent); color: var(--text-main); }
</style>
