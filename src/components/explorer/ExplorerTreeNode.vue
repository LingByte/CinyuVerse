<script setup lang="ts">
import { computed } from 'vue'
import ExplorerTreeNode from './ExplorerTreeNode.vue'
import type { FsNode } from '@/core/types/desktop'
import FileTreeIcon from './FileTreeIcon.vue'

const props = defineProps<{
  node: FsNode
  depth: number
  currentFilePath: string | null
  collapsedDirs: Set<string>
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  toggleDir: [path: string]
  contextmenu: [event: MouseEvent, node: FsNode]
}>()

const isActive = computed(() => props.currentFilePath === props.node.path)
const isDir = computed(() => props.node.isDirectory)
const isOpen = computed(() => !props.collapsedDirs.has(props.node.path))

function isCollapsed(path: string, collapsed: Set<string>) {
  return collapsed.has(path)
}
</script>

<template>
  <template v-if="isDir">
    <div
      class="explorer-item"
      :style="{ paddingLeft: (12 + depth * 18) + 'px' }"
      @click="emit('toggleDir', node.path)"
      @contextmenu="emit('contextmenu', $event, node)"
    >
      <span class="explorer-icon">
        <FileTreeIcon :name="node.name" is-directory :is-open="isOpen" />
      </span>
      <span class="explorer-label">{{ node.name }}</span>
    </div>
    <template v-if="!isCollapsed(node.path, collapsedDirs)">
      <ExplorerTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :current-file-path="currentFilePath"
        :collapsed-dirs="collapsedDirs"
        @select-file="(p) => emit('selectFile', p)"
        @toggle-dir="(p) => emit('toggleDir', p)"
        @contextmenu="(e, n) => emit('contextmenu', e, n)"
      />
    </template>
  </template>

  <div
    v-else
    class="explorer-item"
    :class="{ 'explorer-item-active': isActive }"
    :style="{ paddingLeft: (12 + depth * 18) + 'px' }"
    @click="emit('selectFile', node.path)"
    @contextmenu="emit('contextmenu', $event, node)"
  >
    <span class="explorer-icon">
      <FileTreeIcon :name="node.name" />
    </span>
    <span class="explorer-label">{{ node.name }}</span>
  </div>
</template>

<style scoped>
.explorer-item {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  height: 26px;
  line-height: 26px;
  cursor: pointer;
  color: var(--text-secondary);
  margin: 1px 6px 1px 2px;
  border-radius: 6px;
  padding-right: 8px;
}

.explorer-item:hover {
  background: var(--bg-hover);
}

.explorer-item-active {
  background: var(--bg-active) !important;
}

.explorer-item-active .explorer-label {
  color: var(--text-main);
}

.explorer-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
}

.explorer-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
</style>
