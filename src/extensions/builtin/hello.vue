<script setup lang="ts">
defineProps<{
  rootPath: string;
}>();
</script>

<template>
  <div class="h-full flex flex-col bg-white">
    <div class="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800">
      Hello Extension
    </div>
    <div class="p-3 text-xs text-gray-600 whitespace-pre-wrap">
      {{ rootPath ? `Workspace: ${rootPath}` : 'Open a folder to see rootPath.' }}
    </div>
  </div>
</template>
