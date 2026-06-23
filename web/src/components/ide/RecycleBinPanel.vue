<script setup lang="ts">
import { ref, watch } from 'vue'
import { listTrash, restoreTrash } from '@/api/ide'
import type { TrashItem } from '@/api/ide'

const props = defineProps<{ workspaceId: string | null }>()
const emit = defineEmits<{ restored: [] }>()

const items = ref<TrashItem[]>([])
const loading = ref(false)

async function load() {
  if (!props.workspaceId) {
    items.value = []
    return
  }
  loading.value = true
  try {
    items.value = await listTrash(props.workspaceId)
  } finally {
    loading.value = false
  }
}

async function restore(id: string) {
  if (!props.workspaceId) return
  await restoreTrash(props.workspaceId, id)
  await load()
  emit('restored')
}

function formatDate(s: string) {
  return new Date(s).toLocaleString()
}

function daysLeft(expires: string) {
  const ms = new Date(expires).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

watch(() => props.workspaceId, load, { immediate: true })
</script>

<template>
  <div class="recycle-panel">
    <div class="header">回收站（7 天内可恢复）</div>
    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!workspaceId" class="empty">请先打开工作区</div>
    <div v-else-if="items.length === 0" class="empty">回收站为空</div>
    <div v-else class="list">
      <div v-for="item in items" :key="item.id" class="item">
        <div class="item-title">{{ item.title }}</div>
        <div class="item-meta">
          {{ item.type === 'volume' ? '卷' : '章节' }} · {{ formatDate(item.deleted_at) }}
          · 剩余 {{ daysLeft(item.expires_at) }} 天
        </div>
        <button class="restore-btn" @click="restore(item.id)">恢复</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recycle-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-secondary);
  font-size: 12px;
}

.header {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-sub);
  border-bottom: 1px solid var(--border);
}

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-sub);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
}

.item-title {
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}

.item-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.restore-btn {
  padding: 4px 10px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
}
.restore-btn:hover {
  background: var(--accent-light);
}
</style>
