<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import { useBatchAiRunner } from '@/features/ai/composables/useBatchAiRunner'
import { Loader2, Play, RefreshCw } from 'lucide-vue-next'

const props = defineProps<{ workspaceRoot: string | null }>()

interface AiTaskRecord {
  taskId: string
  kind: string
  status: string
  progress: number
  total: number
  message: string
  createdAt: string
  resultPath?: string
}

const tasks = ref<AiTaskRecord[]>([])
const loading = ref(false)
const { running: batchRunning, activeTaskId: batchActiveTaskId, runBatchLlm } = useBatchAiRunner()
let pollTimer: ReturnType<typeof setInterval> | null = null

function mapTask(raw: Record<string, unknown>): AiTaskRecord {
  return {
    taskId: String(raw.task_id ?? raw.taskId ?? ''),
    kind: String(raw.kind ?? ''),
    status: String(raw.status ?? ''),
    progress: Number(raw.progress ?? 0),
    total: Number(raw.total ?? 0),
    message: String(raw.message ?? ''),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
    resultPath: raw.result_path ? String(raw.result_path) : raw.resultPath ? String(raw.resultPath) : undefined,
  }
}

async function load() {
  if (!props.workspaceRoot || !isDesktop()) return
  loading.value = true
  try {
    const list = await desktopApi.listAiTasks(props.workspaceRoot) as Record<string, unknown>[]
    tasks.value = list.map(mapTask)
  } finally {
    loading.value = false
  }
}

async function enqueue(kind: string) {
  if (!props.workspaceRoot) return
  await desktopApi.enqueueAiTask(props.workspaceRoot, kind)
  await load()
}

async function processTask(task: AiTaskRecord) {
  if (!props.workspaceRoot) return
  if (task.kind === 'batch_polish' || task.kind === 'batch_generate') {
    if (task.status === 'pending') {
      await desktopApi.processAiTask(props.workspaceRoot, task.taskId)
    }
    await runBatchLlm(props.workspaceRoot, task.taskId, task.kind)
    await load()
    return
  }
  await desktopApi.processAiTask(props.workspaceRoot, task.taskId)
  await load()
}

const TASK_KINDS = [
  { id: 'style_extract', label: '提取文风样本' },
  { id: 'plot_audit', label: '剧情审校' },
  { id: 'batch_polish', label: '批量润色队列' },
  { id: 'batch_generate', label: '批量生成队列' },
]

watch(() => props.workspaceRoot, load, { immediate: true })
onMounted(() => {
  pollTimer = setInterval(load, 8000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="task-panel">
    <div v-if="!workspaceRoot" class="empty">请先打开工作区</div>
    <template v-else>
      <div class="toolbar">
        <span class="title">AI 异步任务</span>
        <button type="button" class="icon-btn" title="刷新" @click="load"><RefreshCw :size="14" /></button>
      </div>
      <div class="enqueue-row">
        <button
          v-for="k in TASK_KINDS"
          :key="k.id"
          type="button"
          class="kind-btn"
          @click="enqueue(k.id)"
        >
          + {{ k.label }}
        </button>
      </div>
      <div v-if="loading && !tasks.length" class="empty"><Loader2 :size="16" class="spin" /> 加载中…</div>
      <div v-else-if="!tasks.length" class="empty">暂无任务</div>
      <div v-else class="list">
        <div v-for="t in tasks" :key="t.taskId" class="task-card">
          <div class="task-head">
            <span class="kind">{{ t.kind }}</span>
            <span class="status" :class="t.status">{{ t.status }}</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: t.total ? `${(t.progress / t.total) * 100}%` : '0%' }"
            />
          </div>
          <p class="msg">{{ t.message }}</p>
          <div class="task-foot">
            <span class="time">{{ t.createdAt.slice(0, 16) }}</span>
            <button
              v-if="t.status === 'pending' || t.status === 'awaiting_llm' || (t.status === 'running' && (t.kind === 'batch_polish' || t.kind === 'batch_generate'))"
              type="button"
              class="run-btn"
              :disabled="batchRunning && batchActiveTaskId === t.taskId"
              @click="processTask(t)"
            >
              <Loader2 v-if="batchRunning && batchActiveTaskId === t.taskId" :size="11" class="spin" />
              <Play v-else :size="11" />
              {{ t.status === 'awaiting_llm' || t.kind === 'batch_polish' || t.kind === 'batch_generate' ? '启动 AI 逐章' : '执行' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
}

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-sub);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.enqueue-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.kind-btn {
  padding: 4px 8px;
  border: 1px dashed var(--border);
  border-radius: 4px;
  background: transparent;
  font-size: 10px;
  cursor: pointer;
  color: var(--text-sub);
}

.kind-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--bg-card);
}

.task-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.kind {
  font-weight: 600;
  color: var(--text-main);
}

.status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-hover);
}

.status.completed { color: var(--success, #22c55e); }
.status.running { color: var(--accent); }
.status.awaiting_llm { color: var(--warning); }
.status.failed { color: var(--danger, #ef4444); }

.progress-bar {
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}

.msg {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.task-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.time {
  font-size: 10px;
  color: var(--text-muted);
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  font-size: 10px;
  cursor: pointer;
}

.spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
