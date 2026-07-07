<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'

const props = defineProps<{
  open: boolean
  loading?: boolean
  stage?: 'idle' | 'pick-folder' | 'creating' | 'generating'
  error?: string
  isLibrary?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [payload: { title: string; brief: string }]
}>()

const title = ref('')
const brief = ref('')

watch(() => props.open, (open) => {
  if (open) {
    title.value = ''
    brief.value = ''
  }
})

function close() {
  if (props.loading) return
  emit('update:open', false)
}

function submit() {
  const trimmed = title.value.trim()
  if (!trimmed || props.loading) return
  emit('confirm', { title: trimmed, brief: brief.value.trim() })
}

const loadingLabel = computed(() => {
  switch (props.stage) {
    case 'pick-folder':
      return '请选择保存位置…'
    case 'creating':
      return '创建书籍文件夹…'
    case 'generating':
      return '生成世界观设定…'
    default:
      return '创建中…'
  }
})
</script>

<template>
  <Dialog :open="open" title="新建书籍" @update:open="emit('update:open', $event)">
    <div class="dialog-body">
      <p v-if="isLibrary" class="hint">新书将保存在当前书库的 <code>books/</code> 目录下。</p>
      <p v-else class="hint">填写书名后，将选择保存位置并创建书籍项目文件夹。</p>

      <label class="field-label">
        书名
        <input
          v-model="title"
          class="field"
          placeholder="例如：星河旅人"
          autofocus
          @keydown.enter="submit"
        />
      </label>

      <label class="field-label">
        简介 / 设定
        <span class="optional">（可选，连接 AI 后端时用于生成世界观）</span>
        <textarea
          v-model="brief"
          class="field area"
          rows="4"
          placeholder="故事背景、主角设定等…"
        />
      </label>

      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <button type="button" class="btn" :disabled="loading" @click="close">取消</button>
        <button
          type="button"
          class="btn primary"
          :disabled="loading || !title.trim()"
          @click="submit"
        >
          {{ loading ? loadingLabel : '创建书籍' }}
        </button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px 8px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-sub);
  line-height: 1.5;
}

.hint code {
  font-size: 11px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-main);
}

.optional {
  font-size: 11px;
  color: var(--text-sub);
  font-weight: normal;
}

.field {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-main);
  font-size: 13px;
}

.field.area {
  resize: vertical;
  min-height: 88px;
  font-family: inherit;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #f87171;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
}

.btn {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  border-color: transparent;
  background: var(--accent, #6366f1);
  color: #fff;
}
</style>
