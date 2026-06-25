<script setup lang="ts">
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
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
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
