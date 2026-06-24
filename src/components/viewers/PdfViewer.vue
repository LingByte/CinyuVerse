<script setup lang="ts">
defineProps<{
  assetUrl?: string;
}>();
</script>

<template>
  <div
    v-if="!assetUrl"
    class="h-full w-full flex items-center justify-center text-sm text-gray-500"
  >
    No preview
  </div>
  <iframe
    v-else
    :src="assetUrl"
    class="w-full h-full"
    title="PDF Preview"
    style="border: 0"
  />
</template>
