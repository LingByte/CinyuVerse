<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import LocalFileTreeNode from './LocalFileTreeNode.vue'
import type { FsNode } from '@/types/electron'
import { CODICONS, getFolderColor, getFileColor } from '@/utils/fileIcons'

const props = defineProps<{
  tree: FsNode | null
  folderName: string
  currentFilePath: string | null
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string, fileName: string]
  createDir: [parentPath: string, dirName: string]
  deletePath: [path: string, isDirectory: boolean]
  closeFolder: []
  openFolder: []
  refreshTree: []
}>()

const collapsedDirs = ref<Set<string>>(new Set())
const contextMenu = ref<{ x: number; y: number; node: FsNode } | null>(null)
const folderColor = getFolderColor()
const fileColor = getFileColor('untitled.md')

const creating = ref<{ parentPath: string; isDirectory: boolean } | null>(null)
const newName = ref('')
const createInputEl = ref<HTMLInputElement | null>(null)

let initialLoadDone = false

function collectAllDirs(node: FsNode, set: Set<string>, depth: number) {
  if (depth > 0) set.add(node.path)
  if (node.isDirectory && node.children) {
    for (const child of node.children) {
      collectAllDirs(child, set, depth + 1)
    }
  }
}

watch(() => props.tree, (t) => {
  if (!t) {
    initialLoadDone = false
    collapsedDirs.value = new Set()
    return
  }
  if (!initialLoadDone) {
    initialLoadDone = true
    const set = new Set<string>()
    collectAllDirs(t, set, 0)
    collapsedDirs.value = set
  }
}, { immediate: true })

function toggleDir(path: string) {
  if (collapsedDirs.value.has(path)) collapsedDirs.value.delete(path)
  else collapsedDirs.value.add(path)
}

function isCollapsed(path: string) {
  return collapsedDirs.value.has(path)
}

function collapseAll() {
  if (!props.tree) return
  const set = new Set<string>()
  collectAllDirs(props.tree, set, 0)
  collapsedDirs.value = set
}

function onRightClick(e: MouseEvent, node: FsNode) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, node }
}

function dismissMenu() {
  contextMenu.value = null
}

function handleDelete() {
  if (!contextMenu.value) return
  const { node } = contextMenu.value
  const label = node.isDirectory ? '文件夹' : '文件'
  if (confirm(`确定删除该${label}？`)) {
    emit('deletePath', node.path, node.isDirectory)
  }
  dismissMenu()
}

function startCreate(parentPath: string, isDirectory: boolean) {
  creating.value = { parentPath, isDirectory }
  newName.value = ''
  nextTick(() => {
    createInputEl.value?.focus()
  })
}

function confirmCreate() {
  const name = newName.value.trim()
  if (!name || !creating.value) return
  if (creating.value.isDirectory) {
    emit('createDir', creating.value.parentPath, name)
  } else {
    emit('createFile', creating.value.parentPath, name)
  }
  creating.value = null
}

function cancelCreate() {
  creating.value = null
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmCreate()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelCreate()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (contextMenu.value) { dismissMenu(); return }
    if (creating.value) { cancelCreate(); return }
  }
}
</script>

<template>
  <div class="file-tree" @click="dismissMenu" @keydown="onKeydown">
    <div class="file-tree-header">
      <span class="header-title">资源管理器</span>
      <div class="header-actions" v-if="tree">
        <button
          class="action-btn"
          title="新建文件..."
          @click.stop="startCreate(tree.path, false)"
          v-html="CODICONS.newFile"
        />
        <button
          class="action-btn"
          title="新建文件夹..."
          @click.stop="startCreate(tree.path, true)"
          v-html="CODICONS.newFolder"
        />
        <button
          class="action-btn"
          title="刷新资源管理器"
          @click.stop="emit('refreshTree')"
          v-html="CODICONS.refresh"
        />
        <button
          class="action-btn"
          title="折叠所有文件夹"
          @click.stop="collapseAll"
          v-html="CODICONS.collapseAll"
        />
      </div>
    </div>

    <div v-if="!tree" class="welcome-view">
      <div class="welcome-view-content">
        <p class="welcome-message">你尚未打开文件夹。</p>
        <div class="button-container">
          <button class="open-folder-btn" @click="emit('openFolder')">
            打开文件夹
          </button>
        </div>
      </div>
    </div>

    <div v-else class="explorer-body">
      <div
        class="explorer-item root-folder"
        :style="{ paddingLeft: '8px' }"
        @click="toggleDir(tree.path)"
        @contextmenu="onRightClick($event, tree)"
      >
        <span
          class="explorer-twistie"
          :class="{ collapsed: isCollapsed(tree.path) }"
          @click.stop="toggleDir(tree.path)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="explorer-icon" :style="{ color: folderColor }">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
          </svg>
        </span>
        <span class="explorer-label root-label">{{ folderName }}</span>
      </div>

      <div
        v-if="creating"
        class="explorer-item"
        :style="{ paddingLeft: '24px' }"
      >
        <span class="explorer-icon" :style="{ color: creating.isDirectory ? folderColor : fileColor }">
          <svg v-if="creating.isDirectory" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h6l4 4v8H3V2z" fill="currentColor" opacity="0.8"/>
            <path d="M9 2v4h4" fill="none" stroke="var(--bg-primary)" stroke-width="1"/>
          </svg>
        </span>
        <input
          ref="createInputEl"
          v-model="newName"
          class="inline-create-input"
          :placeholder="creating.isDirectory ? '文件夹名' : '文件名（如 chapter.md）'"
          @keydown="onInputKeydown"
          @blur="cancelCreate"
          @click.stop
        />
      </div>

      <template v-if="!isCollapsed(tree.path)">
        <LocalFileTreeNode
          v-for="child in tree.children"
          :key="child.path"
          :node="child"
          :depth="1"
          :current-file-path="currentFilePath"
          :collapsed-dirs="collapsedDirs"
          @select-file="(p) => emit('selectFile', p)"
          @toggle-dir="toggleDir"
          @contextmenu="onRightClick"
        />
      </template>

      <div style="height: 22px" />
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <template v-if="contextMenu.node.isDirectory">
          <button class="context-item" @click="startCreate(contextMenu.node.path, false); dismissMenu()">
            <span class="context-item-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 2h6l4 4v8H3V2z" fill="currentColor" opacity="0.8"/>
                <path d="M9 2v4h4" fill="none" stroke="var(--bg-primary)" stroke-width="1"/>
              </svg>
            </span>
            新建文件
          </button>
          <button class="context-item" @click="startCreate(contextMenu.node.path, true); dismissMenu()">
            <span class="context-item-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1.5 3.5h4.5l1 1.5H14.5v7.5H1.5V3.5z" fill="currentColor" opacity="0.9"/>
              </svg>
            </span>
            新建文件夹
          </button>
          <div class="context-divider" />
        </template>
        <button class="context-item context-item-danger" @click="handleDelete">
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
  outline: none;
}

.file-tree-header {
  height: 35px;
  min-height: 35px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  cursor: default;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-sub);
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.1s;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.action-btn :deep(svg) {
  width: 16px;
  height: 16px;
}

.welcome-view {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.welcome-view-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px;
  box-sizing: border-box;
}

.welcome-message {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-sub);
  text-align: center;
}

.button-container {
  width: 100%;
  max-width: 260px;
  margin-top: 10px;
}

.open-folder-btn {
  width: 100%;
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.open-folder-btn:hover {
  background: var(--accent-hover);
}

.explorer-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.inline-create-input {
  flex: 1;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-family: inherit;
  font-size: 12px;
  line-height: 22px;
  outline: none;
  min-width: 0;
}

.inline-create-input::placeholder {
  color: var(--text-muted);
  font-size: 12px;
}

.explorer-item {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  height: 22px;
  line-height: 22px;
  cursor: pointer;
  margin: 0 4px 0 0;
  border-radius: 0 4px 4px 0;
}

.explorer-item:hover {
  background: var(--bg-hover);
}

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
  color: var(--text-main);
}

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

.explorer-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.root-label {
  font-weight: 600;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  padding: 4px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
  text-align: left;
}

.context-item:hover {
  background: var(--accent);
  color: #fff;
}

.context-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.context-item-icon svg {
  width: 16px;
  height: 16px;
}

.context-item-danger {
  color: var(--danger) !important;
}

.context-item-danger:hover {
  background: var(--danger);
  color: #fff !important;
}

.context-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--border);
}
</style>
