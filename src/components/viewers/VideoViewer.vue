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
  <div v-else class="h-full w-full flex items-center justify-center bg-black">
    <video controls :src="assetUrl" class="max-w-full max-h-full" />
  </div>
</template>
