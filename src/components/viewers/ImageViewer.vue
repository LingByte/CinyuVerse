<script setup lang="ts">
import { ref } from 'vue';

export type ImageViewerProps = {
  src?: string;
  alt: string;
};

defineProps<ImageViewerProps>();

const error = ref('');
</script>

<template>
  <div v-if="!src" class="text-sm text-gray-500">No preview</div>
  <div v-else-if="error" class="text-xs text-gray-600 whitespace-pre-wrap">
    Failed to render image.
    {{ '\n' }}
    {{ error }}
  </div>
  <img
    v-else
    :src="src"
    :alt="alt"
    class="max-w-full max-h-full object-contain"
    @error="
      error =
        'The image URL could not be loaded. This is often caused by missing Tauri FS permissions or an unsupported image format.'
    "
  />
</template>
