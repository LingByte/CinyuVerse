<script setup lang="ts">
import { ref, watch } from 'vue'
import { listChapterSnapshots, getChapterSnapshot, restoreChapterSnapshot } from '@/api/ide'
import type { ChapterSnapshot } from '@/api/ide'

const props = defineProps<{
  visible: boolean
  workspaceId: string | null
  volId: string
  chId: string
  currentContent: string
}>()

const emit = defineEmits<{
  close: []
  restore: [content: string]
}>()

const snapshots = ref<ChapterSnapshot[]>([])
const selectedId = ref('')
const previewContent = ref('')
const loading = ref(false)

async function load() {
  if (!props.visible || !props.workspaceId || !props.volId || !props.chId) return
  loading.value = true
  try {
    snapshots.value = await listChapterSnapshots(props.workspaceId, props.volId, props.chId)
  } finally {
    loading.value = false
  }
}

async function preview(id: string) {
  if (!props.workspaceId) return
  selectedId.value = id
  previewContent.value = await getChapterSnapshot(props.workspaceId, props.volId, props.chId, id)
}

async function doRestore() {
  if (!props.workspaceId || !selectedId.value) return
  const content = await restoreChapterSnapshot(props.workspaceId, props.volId, props.chId, selectedId.value)
  emit('restore', content)
  emit('close')
}

function diffLines(a: string, b: string) {
  const al = a.split('\n')
  const bl = b.split('\n')
  const max = Math.max(al.length, bl.length)
  const out: { type: 'same' | 'add' | 'del'; text: string }[] = []
  for (let i = 0; i < max; i++) {
    const la = al[i] ?? ''
    const lb = bl[i] ?? ''
    if (la === lb) {
      if (la) out.push({ type: 'same', text: la })
    } else {
      if (la) out.push({ type: 'del', text: la })
      if (lb) out.push({ type: 'add', text: lb })
    }
  }
  return out
}

watch(() => [props.visible, props.chId], load, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="hist-overlay" @click.self="emit('close')">
      <div class="hist-modal">
        <div class="hist-header">
          <h3>章节历史版本</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>

        <div v-if="loading" class="empty">加载中…</div>
        <div v-else-if="snapshots.length === 0" class="empty">暂无历史快照（保存章节后自动创建）</div>
        <template v-else>
          <div class="snap-list">
            <button
              v-for="s in snapshots"
              :key="s.id"
              class="snap-item"
              :class="{ active: selectedId === s.id }"
              @click="preview(s.id)"
            >
              {{ new Date(s.created_at).toLocaleString() }} · {{ s.word_count }} 字
            </button>
          </div>

          <div v-if="previewContent" class="diff-area">
            <div class="diff-title">与当前版本对比</div>
            <div class="diff-content">
              <div
                v-for="(line, i) in diffLines(previewContent, currentContent)"
                :key="i"
                class="diff-line"
                :class="line.type"
              >{{ line.type === 'del' ? '- ' : line.type === 'add' ? '+ ' : '  ' }}{{ line.text }}</div>
            </div>
            <button class="restore-btn" @click="doRestore">回滚到此版本</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.hist-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hist-modal {
  width: min(640px, 94vw);
  max-height: 85vh;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  color: var(--text-main);
}

.hist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.hist-header h3 { margin: 0; font-size: 15px; }
.close-btn { border: none; background: none; font-size: 20px; cursor: pointer; color: var(--text-sub); }

.empty { padding: 24px; text-align: center; color: var(--text-sub); font-size: 13px; }

.snap-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.snap-item {
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}
.snap-item.active { border-color: var(--accent); color: var(--accent); }

.diff-title { font-size: 12px; color: var(--text-sub); margin-bottom: 6px; }
.diff-content {
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 8px;
  font-family: monospace;
  font-size: 11px;
  margin-bottom: 10px;
}
.diff-line.same { color: var(--text-muted); }
.diff-line.add { color: #3fb950; }
.diff-line.del { color: var(--danger); }

.restore-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}
</style>
