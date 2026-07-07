<script setup lang="ts">
import { ref, watch } from 'vue'
import type { VersionEntry } from '@/core/types/workspace'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

const props = defineProps<{
  workspaceRoot: string | null
  filePath: string | null
}>()

const emit = defineEmits<{
  restore: [content: string]
}>()

const versions = ref<VersionEntry[]>([])
const loading = ref(false)

async function load() {
  if (!props.workspaceRoot || !props.filePath || !isDesktop()) {
    versions.value = []
    return
  }
  loading.value = true
  try {
    const raw = await desktopApi.listVersions(props.workspaceRoot, props.filePath)
    versions.value = (raw as Array<Record<string, unknown>>).map((v) => ({
      id: String(v.id),
      filePath: String(v.file_path ?? v.filePath ?? ''),
      createdAt: String(v.created_at ?? v.createdAt ?? ''),
      label: String(v.label ?? ''),
      size: Number(v.size ?? 0),
    }))
  } finally {
    loading.value = false
  }
}

async function restore(id: string) {
  if (!props.workspaceRoot || !props.filePath) return
  const content = await desktopApi.restoreVersion(props.workspaceRoot, props.filePath, id)
  emit('restore', content)
}

watch(() => [props.workspaceRoot, props.filePath], load, { immediate: true })
</script>

<template>
  <div class="version-panel">
    <div class="header">
      <span>版本历史</span>
      <button type="button" class="refresh" :disabled="loading" @click="load">刷新</button>
    </div>
    <div v-if="!filePath" class="empty">打开章节文件后查看快照</div>
    <div v-else-if="loading" class="empty">加载中…</div>
    <div v-else-if="versions.length === 0" class="empty">暂无历史版本（保存时自动快照）</div>
    <ul v-else class="list">
      <li v-for="v in versions" :key="v.id" class="item">
        <div class="meta">
          <span class="label">{{ v.label }}</span>
          <span class="time">{{ new Date(v.createdAt).toLocaleString() }}</span>
        </div>
        <button type="button" class="restore-btn" @click="restore(v.id)">恢复</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.version-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  color: var(--text-main);
}

.refresh {
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
}

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
}

.list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--bg-card);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.label {
  font-weight: 500;
  color: var(--text-main);
}

.time {
  font-size: 10px;
  color: var(--text-muted);
}

.restore-btn {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
}
</style>
