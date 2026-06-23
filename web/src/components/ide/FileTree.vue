<script setup lang="ts">
import { ref } from 'vue'
import type { WorkspaceDetail } from '@/api/ide'

const props = defineProps<{
  workspace: WorkspaceDetail | null
}>()

const emit = defineEmits<{
  selectChapter: [volId: string, chId: string, title: string]
  createWorkspace: [name: string]
  createVolume: [name: string]
  createChapter: [volId: string, title: string]
  deleteWorkspace: []
  deleteVolume: [volId: string]
  deleteChapter: [volId: string, chId: string]
}>()

const collapsedVolumes = ref<Set<string>>(new Set())
const newName = ref('')
const showNewInput = ref<'workspace' | 'volume' | { volId: string } | null>(null)
const contextMenu = ref<{ x: number; y: number; type: string; id?: string; volId?: string } | null>(null)

function toggleVolume(volId: string) {
  if (collapsedVolumes.value.has(volId)) {
    collapsedVolumes.value.delete(volId)
  } else {
    collapsedVolumes.value.add(volId)
  }
}

function startNewInput(type: 'workspace' | 'volume' | { volId: string }) {
  newName.value = ''
  showNewInput.value = type
}

function confirmNewInput() {
  const name = newName.value.trim()
  if (!name) {
    showNewInput.value = null
    return
  }
  if (showNewInput.value === 'workspace') {
    emit('createWorkspace', name)
  } else if (showNewInput.value === 'volume') {
    emit('createVolume', name)
  } else if (typeof showNewInput.value === 'object') {
    emit('createChapter', showNewInput.value.volId, name)
  }
  showNewInput.value = null
}

function onRightClick(e: MouseEvent, type: string, id?: string, volId?: string) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, type, id, volId }
}

function dismissContextMenu() {
  contextMenu.value = null
}

function handleContextAction(action: string) {
  if (!contextMenu.value) return
  const { type, id, volId } = contextMenu.value
  if (action === 'newChapter' && volId) {
    startNewInput({ volId })
  } else if (action === 'delete') {
    if (type === 'volume' && id) emit('deleteVolume', id)
    else if (type === 'chapter' && volId && id) emit('deleteChapter', volId, id)
  }
  dismissContextMenu()
}
</script>

<template>
  <div class="file-tree" @click="dismissContextMenu">
    <!-- Header -->
    <div class="tree-header">
      <span class="tree-title">资源管理器</span>
      <div class="tree-actions">
        <button v-if="!workspace" class="tree-btn" title="新建工作区" @click="startNewInput('workspace')">+</button>
        <button v-else class="tree-btn" title="关闭工作区" @click="$emit('deleteWorkspace')">x</button>
      </div>
    </div>

    <!-- New workspace / volume / chapter input -->
    <div v-if="showNewInput" class="new-input-bar">
      <input
        v-model="newName"
        :placeholder="
          showNewInput === 'workspace' ? '工作区名称...' :
          showNewInput === 'volume' ? '卷名...' : '章节标题...'
        "
        class="new-input"
        @keyup.enter="confirmNewInput"
        @keyup.escape="showNewInput = null"
        @blur="confirmNewInput"
        autofocus
      />
    </div>

    <!-- Empty state -->
    <div v-if="!workspace" class="tree-empty">
      <p>新建或打开一个工作区</p>
      <button class="create-btn" @click="startNewInput('workspace')">新建工作区</button>
    </div>

    <!-- Tree content -->
    <div v-else class="tree-content">
      <div
        class="tree-item root-item"
        @contextmenu="onRightClick($event, 'workspace', workspace.id)"
      >
        <span class="tree-icon folder-icon"/>
        <span class="tree-label">{{ workspace.book_name }}</span>
      </div>

      <template v-for="vol in workspace.volumes" :key="vol.id">
        <div
          class="tree-item volume-item"
          @click="toggleVolume(vol.id)"
          @contextmenu="onRightClick($event, 'volume', vol.id)"
        >
          <span class="tree-arrow">{{ collapsedVolumes.has(vol.id) ? '▸' : '▾' }}</span>
          <svg class="tree-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/><path d="M2 10h20" stroke-width="1"/></svg>
          <span class="tree-label">{{ vol.name }}</span>
        </div>

        <template v-if="!collapsedVolumes.has(vol.id)">
          <div
            v-for="ch in vol.chapters"
            :key="ch.id"
            class="tree-item chapter-item"
            @click="$emit('selectChapter', vol.id, ch.id, ch.title)"
            @contextmenu="onRightClick($event, 'chapter', ch.id, vol.id)"
          >
            <svg class="tree-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span class="tree-label">{{ ch.title }}</span>
            <span class="word-count">{{ ch.word_count }}字</span>
          </div>

          <div class="tree-item add-item" @click="startNewInput({ volId: vol.id })">
            <span class="tree-icon add-icon">+</span>
            <span class="tree-label hint">添加章节...</span>
          </div>
        </template>
      </template>

      <div class="tree-item add-item" @click="startNewInput('volume')">
        <span class="tree-icon add-icon">+</span>
        <span class="tree-label hint">添加卷...</span>
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <template v-if="contextMenu.type === 'volume'">
          <div class="context-item" @click="handleContextAction('newChapter')">新建章节</div>
          <div class="context-item danger" @click="handleContextAction('delete')">删除卷</div>
        </template>
        <template v-else-if="contextMenu.type === 'chapter'">
          <div class="context-item danger" @click="handleContextAction('delete')">删除章节</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-sub);
}

.tree-actions {
  display: flex;
  gap: 4px;
}

.tree-btn {
  background: none;
  border: none;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.tree-btn:hover { background: var(--bg-hover); color: var(--text-main); }

.new-input-bar {
  padding: 8px 12px;
}

.new-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-main);
  padding: 5px 8px;
  font-size: 12px;
  outline: none;
}
.new-input:focus { border-color: var(--accent); }

.tree-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-sub);
  font-size: 12px;
}

.create-btn {
  margin-top: 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.create-btn:hover { background: var(--accent-hover); }

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-item {
  display: flex;
  align-items: center;
  padding: 3px 8px;
  cursor: pointer;
  gap: 4px;
  border-radius: 0 4px 4px 0;
  margin: 0 4px 0 0;
}
.tree-item:hover { background: var(--bg-hover); }

.root-item {
  font-weight: 600;
  padding: 5px 8px;
}

.volume-item {
  padding-left: 12px;
}

.chapter-item {
  padding-left: 36px;
}

.add-item {
  padding-left: 36px;
  opacity: 0.5;
}
.add-item:hover { opacity: 1; }

.tree-arrow {
  width: 14px;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tree-icon {
  flex-shrink: 0;
  font-size: 13px;
}

.tree-svg-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--text-sub);
}

.add-icon {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-sub);
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tree-label.hint {
  color: var(--text-sub);
  font-style: italic;
}

.word-count {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Context menu */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.context-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-main);
}
.context-item:hover { background: var(--accent); color: #fff; }
.context-item.danger { color: var(--danger); }
.context-item.danger:hover { background: var(--danger); color: #fff; }
</style>
