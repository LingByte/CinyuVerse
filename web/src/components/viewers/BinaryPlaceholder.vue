<script setup lang="ts">
defineProps<{
  fileName: string
  extension: string
}>()
</script>

<template>
  <div class="binary-placeholder">
    <div class="placeholder-content">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="file-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p class="file-name">{{ fileName }}</p>
      <p class="file-hint">二进制文件不支持预览。</p>
      <p class="file-ext">.{{ extension }}</p>
    </div>
  </div>
</template>

<style scoped>
.binary-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}

.file-icon {
  opacity: 0.4;
}

.file-name {
  font-size: 14px;
  margin: 0;
  color: var(--text-secondary);
}

.file-hint {
  font-size: 12px;
  margin: 0;
}

.file-ext {
  font-size: 11px;
  margin: 0;
  opacity: 0.5;
  background: var(--bg-secondary);
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
</style>
