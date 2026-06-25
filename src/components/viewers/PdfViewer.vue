<script setup lang="ts">
import { FileType } from 'lucide-vue-next'

defineProps<{
  base64: string
  fileName: string
}>()
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-container">
      <object
        :data="`data:application/pdf;base64,${base64}`"
        type="application/pdf"
        class="pdf-object"
      >
        <div class="pdf-fallback">
          <FileType :size="48" :stroke-width="1.5" />
          <p class="pdf-text">PDF 预览</p>
          <p class="pdf-name">{{ fileName }}</p>
        </div>
      </object>
    </div>
    <div class="pdf-toolbar">
      <span>{{ fileName }}</span>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.pdf-container {
  flex: 1;
  overflow: auto;
}

.pdf-object {
  width: 100%;
  height: 100%;
  border: none;
}

.pdf-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  gap: 8px;
}

.pdf-text {
  font-size: 14px;
  margin: 0;
}

.pdf-name {
  font-size: 12px;
  opacity: 0.7;
  margin: 0;
}

.pdf-toolbar {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-sub);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}
</style>
