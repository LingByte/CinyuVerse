<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ExplorerTreeNode from './ExplorerTreeNode.vue'
import FileTreeIcon from './FileTreeIcon.vue'
import type { FsNode } from '@/core/types/desktop'
import type { ChapterMeta } from '@/core/types/story'
import type { LibraryBookEntry } from '@/services/bookProjectStore'
import {
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronsDownUp,
  Trash2,
  PenLine,
  Loader2,
  BookPlus,
  Bot,
  Wifi,
  WifiOff,
} from 'lucide-vue-next'
import { useShellSyncStore } from '@/features/shell/stores/shellSyncStore'

const props = defineProps<{
  tree: FsNode | null
  folderName: string
  currentFilePath: string | null
  isBookProject?: boolean
  isLibrary?: boolean
  bookChapters?: ChapterMeta[]
  libraryBooks?: LibraryBookEntry[]
  backendConnected?: boolean
  writing?: boolean
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string, fileName: string]
  createDir: [parentPath: string, dirName: string]
  deletePath: [path: string, isDirectory: boolean]
  closeFolder: []
  openFolder: []
  createBook: []
  writeNext: []
  openAiPanel: []
  openChapter: [chapterNum: number]
  openLibraryBook: [path: string]
  refreshTree: []
}>()

const shellSync = useShellSyncStore()

const contextMenu = ref<{ x: number; y: number; node: FsNode } | null>(null)
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
    shellSync.collapsedDirs = new Set()
    return
  }
  if (!initialLoadDone) {
    initialLoadDone = true
    const set = new Set<string>()
    collectAllDirs(t, set, 0)
    for (const p of set) shellSync.setDirCollapsed(p, true)
  }
}, { immediate: true })

function toggleDir(path: string) {
  shellSync.toggleDir(path)
}

function isCollapsed(path: string) {
  return shellSync.isDirCollapsed(path)
}

function collapseAll() {
  if (!props.tree) return
  const set = new Set<string>()
  collectAllDirs(props.tree, set, 0)
  for (const p of set) shellSync.setDirCollapsed(p, true)
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
      <span class="header-title">{{ folderName || '工作区' }}</span>
      <div class="header-actions" v-if="tree">
        <button
          class="action-btn"
          title="新建文件..."
          @click.stop="startCreate(tree.path, false)"
        >
          <FilePlus :size="16" :stroke-width="1.75" />
        </button>
        <button
          class="action-btn"
          title="新建文件夹..."
          @click.stop="startCreate(tree.path, true)"
        >
          <FolderPlus :size="16" :stroke-width="1.75" />
        </button>
        <button
          class="action-btn"
          title="刷新资源管理器"
          @click.stop="emit('refreshTree')"
        >
          <RefreshCw :size="16" :stroke-width="1.75" />
        </button>
        <button
          class="action-btn"
          title="折叠所有文件夹"
          @click.stop="collapseAll"
        >
          <ChevronsDownUp :size="16" :stroke-width="1.75" />
        </button>
        <button
          class="action-btn ai-header-btn"
          title="打开 AI 创作助手 (Ctrl+L)"
          @click.stop="emit('openAiPanel')"
        >
          <Bot :size="16" :stroke-width="1.75" />
        </button>
      </div>
    </div>

    <div v-if="!tree" class="welcome-view">
      <div class="welcome-view-content">
        <p class="welcome-message">打开书籍文件夹，或新建书籍并选择保存位置。</p>
        <p class="welcome-sub">含 <code>cinyuverse/book.json</code> 的文件夹会被识别为书籍项目。</p>
        <div class="button-container">
          <button class="open-folder-btn" @click="emit('openFolder')">
            打开文件夹
          </button>
          <button class="open-folder-btn secondary" @click.stop="emit('createBook')">
            <BookPlus :size="14" />
            新建书籍…
          </button>
        </div>
      </div>
    </div>

    <div v-else class="explorer-body">
      <div v-if="libraryBooks?.length" class="book-section">
        <div class="section-label">书库中的书籍</div>
        <button
          v-for="book in libraryBooks"
          :key="book.path"
          class="chapter-row"
          @click="emit('openLibraryBook', book.path)"
        >
          <span>{{ book.title }}</span>
          <span class="row-meta">{{ book.id }}</span>
        </button>
      </div>

      <div class="ai-section">
        <div class="section-label">AI 创作</div>
        <div class="ai-card">
          <div class="book-toolbar">
            <span class="conn" :class="{ ok: backendConnected }">
              <Wifi v-if="backendConnected" :size="11" />
              <WifiOff v-else :size="11" />
              {{ backendConnected ? '后端已连接' : '后端未连接' }}
            </span>
          </div>

          <div class="ai-actions">
            <button class="ai-btn" @click="emit('openAiPanel')">
              <Bot :size="13" />
              打开 AI 助手
            </button>

            <template v-if="isBookProject">
              <button
                class="ai-btn primary"
                :disabled="!backendConnected || writing"
                @click="emit('writeNext')"
              >
                <Loader2 v-if="writing" :size="13" class="spin" />
                <PenLine v-else :size="13" />
                写下一章
              </button>
            </template>
            <template v-else>
              <button class="ai-btn primary" @click.stop="emit('createBook')">
                <BookPlus :size="13" />
                {{ isLibrary ? '在书库中新建书籍' : '新建书籍…' }}
              </button>
            </template>
          </div>

          <p v-if="!isBookProject" class="ai-hint">
            <template v-if="isLibrary">
              当前为书库项目。新建书籍将保存在 <code>books/</code> 下。
            </template>
            <template v-else>
              当前为普通文件夹。点击「新建书籍」选择保存位置以开始 AI 创作。
            </template>
          </p>
          <p v-else-if="!backendConnected" class="ai-hint">
            启动后端后可使用 AI 写章：<code>cd backend && go run cmd/server/main.go</code>
          </p>
        </div>

        <template v-if="isBookProject">
          <div class="section-label">章节</div>
          <button
            v-for="ch in bookChapters"
            :key="ch.number"
            class="chapter-row"
            @click="emit('openChapter', ch.number)"
          >
            <span>第{{ ch.number }}章 {{ ch.title }}</span>
            <span class="row-meta">{{ ch.wordCount }}字</span>
          </button>
          <p v-if="!bookChapters?.length" class="section-empty">暂无章节，点击「写下一章」开始创作</p>
        </template>

        <div class="section-divider" />
      </div>
      <div
        class="explorer-item root-folder"
        :style="{ paddingLeft: '12px' }"
        @click="toggleDir(tree.path)"
        @contextmenu="onRightClick($event, tree)"
      >
        <span class="explorer-icon">
          <FileTreeIcon :name="folderName" is-directory :is-open="!isCollapsed(tree.path)" />
        </span>
        <span class="explorer-label root-label">{{ folderName }}</span>
      </div>

      <div
        v-if="creating"
        class="explorer-item"
        :style="{ paddingLeft: (12 + 18) + 'px' }"
      >
        <span class="explorer-icon">
          <FileTreeIcon
            :name="creating.isDirectory ? 'folder' : 'untitled.md'"
            :is-directory="creating.isDirectory"
          />
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
        <ExplorerTreeNode
          v-for="child in tree.children"
          :key="child.path"
          :node="child"
          :depth="1"
          :current-file-path="currentFilePath"
          :collapsed-dirs="shellSync.collapsedDirs"
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
            <span class="context-item-icon"><FilePlus :size="14" :stroke-width="1.75" /></span>
            新建文件
          </button>
          <button class="context-item" @click="startCreate(contextMenu.node.path, true); dismissMenu()">
            <span class="context-item-icon"><FolderPlus :size="14" :stroke-width="1.75" /></span>
            新建文件夹
          </button>
          <div class="context-divider" />
        </template>
        <button class="context-item context-item-danger" @click="handleDelete">
          <span class="context-item-icon"><Trash2 :size="14" :stroke-width="1.75" /></span>
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
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
  outline: none;
}

.file-tree-header {
  height: 38px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
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

.open-folder-btn.secondary {
  margin-top: 8px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-main);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.open-folder-btn.secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}

.welcome-sub {
  margin: 8px 0 0;
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
}

.welcome-sub code {
  font-size: 10px;
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: 3px;
}

.ai-section,
.book-section {
  padding: 0 8px 8px;
}

.ai-card {
  margin: 0 4px 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in oklab, var(--accent) 6%, var(--bg-secondary));
}

.ai-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 11px;
  cursor: pointer;
}
.ai-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
}
.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-hint {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-muted);
}
.ai-hint code {
  font-size: 9px;
  background: var(--bg-input);
  padding: 1px 3px;
  border-radius: 3px;
}

.ai-header-btn {
  color: var(--accent) !important;
}
.ai-header-btn:hover {
  background: color-mix(in oklab, var(--accent) 12%, transparent) !important;
}

.section-label {
  padding: 4px 4px 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}

.book-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 4px 8px;
}

.conn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--danger);
}
.conn.ok { color: var(--success); }

.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  font-size: 10px;
  cursor: pointer;
}
.mini-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.chapter-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 8px;
  margin: 1px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}
.chapter-row:hover { background: var(--bg-hover); }

.row-meta {
  font-size: 10px;
  color: var(--text-muted);
}

.section-empty {
  margin: 0;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.section-divider {
  height: 1px;
  margin: 8px 4px;
  background: var(--border);
}

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.explorer-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 4px 12px;
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
  height: 26px;
  line-height: 26px;
  cursor: pointer;
  margin: 1px 6px 1px 2px;
  border-radius: 6px;
  padding-right: 8px;
}

.explorer-item:hover {
  background: var(--bg-hover);
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
