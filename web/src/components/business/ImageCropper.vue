<script setup lang="ts">
defineProps<{ src?: string }>()
</script>

<template>
  <div class="grid gap-2">
    <div class="rounded-lg border border-dashed border-[var(--cv-color-border)] p-4 text-xs text-[var(--cv-color-text-muted)]">
      简易裁剪占位组件（可对接 cropper.js）
    </div>
    <img v-if="src" :src="src" alt="crop source" class="max-h-48 rounded-lg object-cover" />
  </div>
</template>
