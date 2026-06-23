<script setup lang="ts">
import { ref } from 'vue'
import FileTree from '@/components/ide/FileTree.vue'
import MetaPanel from '@/components/ide/MetaPanel.vue'
import OutlinePanel from '@/components/ide/OutlinePanel.vue'
import RecycleBinPanel from '@/components/ide/RecycleBinPanel.vue'
import type { WorkspaceDetail } from '@/api/ide'

defineProps<{
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
  restored: []
  jumpChapter: [volId: string, chId: string, title: string]
}>()

const tab = ref<'tree' | 'meta' | 'outline' | 'trash'>('tree')

function onRestored() {
  emit('restored')
}
</script>

<template>
  <div class="left-sidebar">
    <div class="sidebar-tabs">
      <button class="tab-btn" :class="{ active: tab === 'tree' }" @click="tab = 'tree'">目录</button>
      <button class="tab-btn" :class="{ active: tab === 'meta' }" @click="tab = 'meta'">设定</button>
      <button class="tab-btn" :class="{ active: tab === 'outline' }" @click="tab = 'outline'">大纲</button>
      <button class="tab-btn" :class="{ active: tab === 'trash' }" @click="tab = 'trash'">回收站</button>
    </div>
    <div class="sidebar-body">
      <FileTree
        v-show="tab === 'tree'"
        :workspace="workspace"
        @select-chapter="(...a) => emit('selectChapter', ...a)"
        @create-workspace="(n) => emit('createWorkspace', n)"
        @create-volume="(n) => emit('createVolume', n)"
        @create-chapter="(v, t) => emit('createChapter', v, t)"
        @delete-workspace="emit('deleteWorkspace')"
        @delete-volume="(id) => emit('deleteVolume', id)"
        @delete-chapter="(v, c) => emit('deleteChapter', v, c)"
      />
      <MetaPanel v-if="tab === 'meta'" :workspace-id="workspace?.id ?? null" />
      <OutlinePanel
        v-if="tab === 'outline'"
        :workspace-id="workspace?.id ?? null"
        @jump-chapter="(...a) => emit('jumpChapter', ...a)"
      />
      <RecycleBinPanel
        v-if="tab === 'trash'"
        :workspace-id="workspace?.id ?? null"
        @restored="onRestored"
      />
    </div>
  </div>
</template>

<style scoped>
.left-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 背景/边框由内部 FileTree 承担，避免壁纸模式下多一层不透明遮罩 */
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
