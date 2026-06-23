<script setup lang="ts">
import LocalFileTree from '@/components/ide/LocalFileTree.vue'
import type { FsNode } from '@/composables/useLocalWorkspace'

defineProps<{
  tree: FsNode | null
  folderName: string
  currentFilePath: string | null
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string, fileName: string]
  createDir: [parentPath: string, dirName: string]
  deletePath: [path: string]
  closeFolder: []
  openFolder: []
}>()
</script>

<template>
  <LocalFileTree
    :tree="tree"
    :folder-name="folderName"
    :current-file-path="currentFilePath"
    @select-file="(p) => emit('selectFile', p)"
    @create-file="(parentPath, name) => emit('createFile', parentPath, name)"
    @create-dir="(parentPath, name) => emit('createDir', parentPath, name)"
    @delete-path="(p) => emit('deletePath', p)"
    @close-folder="emit('closeFolder')"
    @open-folder="emit('openFolder')"
  />
</template>
