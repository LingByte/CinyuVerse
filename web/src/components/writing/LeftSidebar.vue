<script setup lang="ts">
import { ref } from 'vue'
import LocalFileTree from '@/components/explorer/ExplorerTree.vue'
import MetaPanel from '@/components/writing/MetaPanel.vue'
import OutlinePanel from '@/components/writing/OutlinePanel.vue'
import type { FsNode } from '@/core/types/desktop'
import type { WorkspaceDetail } from '@/core/types/workspace'

defineProps<{
  tree: FsNode | null
  folderName: string
  currentFilePath: string | null
  workspace: WorkspaceDetail | null
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string, fileName: string]
  createDir: [parentPath: string, dirName: string]
  deletePath: [path: string, isDirectory: boolean]
  closeFolder: []
  openFolder: []
  refreshTree: []
  jumpChapter: [volId: string, chId: string, title: string]
}>()

const tab = ref<'tree' | 'meta' | 'outline'>('tree')
</script>

<template>
  <div class="left-sidebar">
    <div class="sidebar-tabs">
      <button class="tab-btn" :class="{ active: tab === 'tree' }" @click="tab = 'tree'">目录</button>
      <button class="tab-btn" :class="{ active: tab === 'meta' }" @click="tab = 'meta'">设定</button>
      <button class="tab-btn" :class="{ active: tab === 'outline' }" @click="tab = 'outline'">大纲</button>
    </div>
    <div class="sidebar-body">
      <LocalFileTree
        v-show="tab === 'tree'"
        :tree="tree"
        :folder-name="folderName"
        :current-file-path="currentFilePath"
        @select-file="(p) => emit('selectFile', p)"
        @create-file="(parentPath, name) => emit('createFile', parentPath, name)"
        @create-dir="(parentPath, name) => emit('createDir', parentPath, name)"
        @delete-path="(p, isDir) => emit('deletePath', p, isDir)"
        @close-folder="emit('closeFolder')"
        @open-folder="emit('openFolder')"
        @refresh-tree="emit('refreshTree')"
      />
      <MetaPanel v-if="tab === 'meta'" :workspace-id="workspace?.id ?? null" />
      <OutlinePanel
        v-if="tab === 'outline'"
        :workspace-id="workspace?.id ?? null"
        @jump-chapter="(...a) => emit('jumpChapter', ...a)"
      />
    </div>
  </div>
</template>

<style scoped>
.left-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.tab-btn {
  flex: 1;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
}
.tab-btn.active {
  color: var(--accent);
  box-shadow: inset 0 -2px 0 var(--accent);
}
.tab-btn:hover:not(.active) {
  background: var(--bg-hover);
}

.sidebar-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
