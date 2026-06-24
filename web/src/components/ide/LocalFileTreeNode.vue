<script setup lang="ts">
import { computed } from 'vue'
import LocalFileTreeNode from './LocalFileTreeNode.vue'
import type { FsNode } from '@/types/electron'
import { getFileColor, getFolderColor } from '@/utils/fileIcons'

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
const fileColor = computed(() => getFileColor(props.node.name))
const folderColor = computed(() => getFolderColor())

function isCollapsed(path: string, collapsed: Set<string>) {
  return collapsed.has(path)
}
</script>

<template>
  <template v-if="isDir">
    <div
      class="explorer-item"
      :class="{ 'explorer-item-active': false }"
      :style="{ paddingLeft: (8 + depth * 16) + 'px' }"
      @click="emit('toggleDir', node.path)"
      @contextmenu="emit('contextmenu', $event, node)"
    >
      <!-- twistie arrow -->
      <span
        class="explorer-twistie"
        :class="{ collapsed: isCollapsed(node.path, collapsedDirs) }"
        @click.stop="emit('toggleDir', node.path)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <!-- folder icon -->
      <span class="explorer-icon" :style="{ color: folderColor }">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
        </svg>
      </span>
      <span class="explorer-label">{{ node.name }}</span>
    </div>
    <template v-if="!isCollapsed(node.path, collapsedDirs)">
      <LocalFileTreeNode
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

  <!-- File node -->
  <div
    v-else
    class="explorer-item"
    :class="{ 'explorer-item-active': isActive }"
    :style="{ paddingLeft: (8 + depth * 16 + 12) + 'px' }"
    @click="emit('selectFile', node.path)"
    @contextmenu="emit('contextmenu', $event, node)"
  >
    <!-- file icon -->
    <span class="explorer-icon" :style="{ color: fileColor }">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 2h6l4 4v8H3V2z" fill="currentColor" opacity="0.8"/>
        <path d="M9 2v4h4" fill="none" stroke="var(--bg-secondary)" stroke-width="1"/>
      </svg>
    </span>
    <span class="explorer-label">{{ node.name }}</span>
  </div>
</template>

<style scoped>
/* ===== VSCode explorerviewlet.css + tree.css ===== */

.explorer-item {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  height: 22px;
  line-height: 22px;
  cursor: pointer;
  color: var(--text-secondary);
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

/* twistie: 16px wide */
.explorer-twistie {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transform: translateX(3px);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.explorer-twistie svg {
  width: 10px;
  height: 10px;
}

.explorer-twistie.collapsed svg {
  transform: rotate(-90deg);
}

.explorer-twistie:hover {
  color: var(--text-primary);
}

/* icon: 16px, 6px gap to label */
.explorer-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
}

.explorer-icon svg {
  width: 16px;
  height: 16px;
}

/* label */
.explorer-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
</style>
