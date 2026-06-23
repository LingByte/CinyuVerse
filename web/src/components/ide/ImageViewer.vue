<script setup lang="ts">
const props = defineProps<{
  base64: string
  mimeType: string
  fileName: string
}>()
</script>

<template>
  <div class="image-viewer">
    <div class="image-container">
      <img
        :src="`data:${mimeType};base64,${base64}`"
        :alt="fileName"
        class="preview-image"
      />
    </div>
    <div class="image-info">
      <span>{{ fileName }}</span>
    </div>
  </div>
</template>

<style scoped>
.image-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  background: repeating-conic-gradient(
      var(--bg-secondary) 0% 25%,
      transparent 0% 50%
    )
    50% / 20px 20px;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.image-info {
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
