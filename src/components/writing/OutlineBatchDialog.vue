<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  selectedCount: number
  volumeOptions: { id: string; title: string; dirPath: string | null }[]
}>()

const emit = defineEmits<{
  close: []
  rename: [template: string]
  move: [destDir: string]
  moveToVolume: [volumeId: string]
  toDraft: []
  toFinal: []
}>()

const tab = ref<'rename' | 'move' | 'archive'>('rename')
const renameTemplate = ref('{title}')
const moveDest = ref('')
const targetVolumeId = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      tab.value = 'rename'
      renameTemplate.value = '{title}'
      moveDest.value = ''
      targetVolumeId.value = props.volumeOptions[0]?.id ?? ''
    }
  },
)

const canSubmit = computed(() => {
  if (props.selectedCount === 0) return false
  if (tab.value === 'rename') return renameTemplate.value.trim().length > 0
  if (tab.value === 'move') return moveDest.value.trim().length > 0 || targetVolumeId.value.length > 0
  return true
})

function submit() {
  if (!canSubmit.value) return
  if (tab.value === 'rename') {
    emit('rename', renameTemplate.value.trim())
  } else if (tab.value === 'move') {
    if (targetVolumeId.value) {
      emit('moveToVolume', targetVolumeId.value)
    } else {
      emit('move', moveDest.value.trim())
    }
  } else if (tab.value === 'archive') {
    emit('toDraft')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="batch-dialog-backdrop" @click="emit('close')">
      <div class="batch-dialog" @click.stop>
        <header class="batch-dialog-header">
          <h3>批量操作</h3>
          <span class="count">已选 {{ selectedCount }} 个章节</span>
          <button type="button" class="close-btn" @click="emit('close')">×</button>
        </header>

        <div class="tabs">
          <button :class="{ active: tab === 'rename' }" @click="tab = 'rename'">重命名</button>
          <button :class="{ active: tab === 'move' }" @click="tab = 'move'">移动</button>
          <button :class="{ active: tab === 'archive' }" @click="tab = 'archive'">归档</button>
        </div>

        <div v-if="tab === 'rename'" class="panel">
          <label>命名模板</label>
          <input v-model="renameTemplate" class="field" placeholder="{title} 或 第{n}章_{title}" />
          <p class="hint">{title} = 原标题，{n} = 序号（从 1 起）</p>
        </div>

        <div v-else-if="tab === 'move'" class="panel">
          <label>移动到分卷目录</label>
          <select v-model="targetVolumeId" class="field">
            <option value="">（手动指定路径）</option>
            <option v-for="v in volumeOptions" :key="v.id" :value="v.id">
              {{ v.title }}{{ v.dirPath ? '' : '（未绑定目录）' }}
            </option>
          </select>
          <label>或目标文件夹绝对路径</label>
          <input v-model="moveDest" class="field" placeholder="C:\...\卷二" :disabled="!!targetVolumeId" />
        </div>

        <div v-else class="panel">
          <p class="hint">将选中章节的物理文件迁移至 `.cinyuverse/drafts/` 或 `.cinyuverse/final/`，并更新大纲状态。</p>
          <div class="archive-actions">
            <button type="button" class="action-btn" @click="emit('toDraft')">移入草稿库</button>
            <button type="button" class="action-btn primary" @click="emit('toFinal')">定稿归档</button>
          </div>
        </div>

        <footer v-if="tab !== 'archive'" class="batch-dialog-footer">
          <button type="button" class="cancel-btn" @click="emit('close')">取消</button>
          <button type="button" class="submit-btn" :disabled="!canSubmit" @click="submit">执行</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: color-mix(in srgb, #000 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-dialog {
  width: min(420px, 92vw);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 16px 48px color-mix(in srgb, #000 30%, transparent);
}

.batch-dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.batch-dialog-header h3 {
  margin: 0;
  font-size: 14px;
  flex: 1;
}

.count {
  font-size: 11px;
  color: var(--text-muted);
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-sub);
}

.tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
}

.panel {
  padding: 12px 14px;
}

.panel label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  margin-top: 8px;
}

.panel label:first-child {
  margin-top: 0;
}

.field {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
}

.hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}

.archive-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-sub);
}

.action-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}

.batch-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
}

.cancel-btn,
.submit-btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.cancel-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-sub);
}

.submit-btn {
  border: none;
  background: var(--accent);
  color: #fff;
}

.submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
