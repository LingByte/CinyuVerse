<script setup lang="ts">
import { ref, watch } from 'vue'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import { Archive, RefreshCw, HardDrive } from 'lucide-vue-next'

const props = defineProps<{ workspaceRoot: string | null }>()

interface BackupEntry {
  path: string
  fileName: string
  sizeBytes: number
  createdAt: string
  incremental: boolean
}

const backups = ref<BackupEntry[]>([])
const loading = ref(false)
const status = ref('')

function mapBackup(raw: Record<string, unknown>): BackupEntry {
  return {
    path: String(raw.path ?? ''),
    fileName: String(raw.file_name ?? raw.fileName ?? ''),
    sizeBytes: Number(raw.size_bytes ?? raw.sizeBytes ?? 0),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
    incremental: Boolean(raw.incremental),
  }
}

async function load() {
  if (!props.workspaceRoot || !isDesktop()) return
  loading.value = true
  try {
    const list = await desktopApi.listBackups(props.workspaceRoot) as Record<string, unknown>[]
    backups.value = list.map(mapBackup)
  } finally {
    loading.value = false
  }
}

async function createBackup() {
  if (!props.workspaceRoot) return
  status.value = '备份中…'
  try {
    const result = await desktopApi.backupWorkspaceIncremental(props.workspaceRoot)
    const changed = result.changedFiles ?? result.changed_files ?? 0
    if (result.skipped) {
      status.value = `无变更文件（已跟踪 ${result.totalTracked ?? result.total_tracked ?? 0} 个）`
    } else {
      status.value = `增量备份：${result.path.split(/[/\\]/).pop()}（${changed} 个变更文件）`
    }
    await load()
  } catch (e: unknown) {
    status.value = e instanceof Error ? e.message : '备份失败'
  }
}

async function createFullBackup() {
  if (!props.workspaceRoot) return
  status.value = '全量打包中…'
  try {
    const name = `full_${new Date().toISOString().slice(0, 10)}.zip`
    const dest = `${props.workspaceRoot}/.cinyuverse/backups/${name}`
    await desktopApi.backupWorkspace(props.workspaceRoot, dest)
    status.value = `全量备份：${name}`
    await load()
  } catch (e: unknown) {
    status.value = e instanceof Error ? e.message : '备份失败'
  }
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

watch(() => props.workspaceRoot, load, { immediate: true })
</script>

<template>
  <div class="backup-panel">
    <div v-if="!workspaceRoot" class="empty">请先打开工作区</div>
    <template v-else>
      <div class="toolbar">
        <span class="title">备份管理</span>
        <button type="button" class="icon-btn" @click="load"><RefreshCw :size="14" /></button>
      </div>
      <div class="actions">
        <button type="button" class="action-btn" @click="createBackup">
          <Archive :size="14" /> 增量备份
        </button>
        <button type="button" class="action-btn" @click="createFullBackup">
          <HardDrive :size="14" /> 全书打包
        </button>
      </div>
      <p v-if="status" class="status">{{ status }}</p>
      <div class="list">
        <div v-for="b in backups" :key="b.path" class="backup-row">
          <div class="name">{{ b.fileName }}</div>
          <div class="meta">
            <span>{{ formatSize(b.sizeBytes) }}</span>
            <span>{{ b.incremental ? '增量' : '全量' }}</span>
            <span>{{ b.createdAt.slice(0, 16) }}</span>
          </div>
          <code class="path">{{ b.path }}</code>
        </div>
        <div v-if="!backups.length && !loading" class="empty-list">暂无备份，点击上方创建</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.backup-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
}

.empty, .empty-list {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-sub);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.title {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-sub);
}

.icon-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
}

.actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-sub);
}

.action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.status {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--accent);
  margin: 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.backup-row {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
  background: var(--bg-card);
}

.name {
  font-weight: 600;
  margin-bottom: 4px;
}

.meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.path {
  font-size: 9px;
  color: var(--text-muted);
  word-break: break-all;
}
</style>
