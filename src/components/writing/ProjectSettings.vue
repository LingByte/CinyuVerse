<script setup lang="ts">
import { ref, watch } from 'vue'
import { useProjectMetaStore } from '@/features/workspace/stores/projectMetaStore'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const meta = useProjectMetaStore()
const saving = ref(false)

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'serializing', label: '连载中' },
  { value: 'completed', label: '已完结' },
]

watch(() => props.visible, (v) => {
  if (v) meta.dirty = true
})

async function save() {
  saving.value = true
  try {
    await meta.saveAll()
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="settings-overlay" @click.self="emit('close')">
    <div class="settings-dialog">
      <header class="settings-header">
        <h2>项目设置</h2>
        <button type="button" class="close-btn" @click="emit('close')">✕</button>
      </header>

      <div class="settings-body">
        <section>
          <h3>书稿信息</h3>
          <label class="field">
            <span>书名</span>
            <input v-model="meta.project.bookName" type="text" />
          </label>
          <label class="field">
            <span>作者</span>
            <input v-model="meta.project.author" type="text" />
          </label>
          <label class="field">
            <span>题材</span>
            <input v-model="meta.project.genre" type="text" />
          </label>
          <label class="field">
            <span>状态</span>
            <select v-model="meta.project.status">
              <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>目标字数</span>
            <input v-model.number="meta.project.targetWords" type="number" min="0" />
          </label>
        </section>

        <section>
          <h3>世界观与文风</h3>
          <label class="field">
            <span>世界观</span>
            <textarea v-model="meta.project.worldView" rows="3" />
          </label>
          <label class="field">
            <span>文风要求</span>
            <textarea v-model="meta.project.style" rows="2" />
          </label>
          <label class="field">
            <span>文风样本</span>
            <textarea v-model="meta.project.styleSample" rows="4" placeholder="粘贴代表性章节片段" />
          </label>
        </section>

        <section>
          <h3>写作规则</h3>
          <label class="field">
            <span>叙事基调</span>
            <input v-model="meta.writingRules.tone" type="text" />
          </label>
          <label class="field">
            <span>视角</span>
            <input v-model="meta.writingRules.pov" type="text" placeholder="第一人称 / 第三人称" />
          </label>
          <label class="field">
            <span>规则（每行一条）</span>
            <textarea
              :value="meta.writingRules.rules.join('\n')"
              rows="4"
              @input="(e) => meta.writingRules.rules = (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean)"
            />
          </label>
        </section>

        <section>
          <h3>禁词表</h3>
          <label class="field">
            <span>禁词（逗号或换行分隔）</span>
            <textarea
              :value="meta.bannedWords.join('\n')"
              rows="3"
              @input="(e) => meta.bannedWords = (e.target as HTMLTextAreaElement).value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)"
            />
          </label>
        </section>
      </div>

      <footer class="settings-footer">
        <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
        <button type="button" class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存到 .cinyuverse' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: color-mix(in srgb, #000 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.settings-dialog {
  width: min(520px, 100%);
  max-height: 90vh;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px color-mix(in srgb, #000 25%, transparent);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.settings-header h2 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main);
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-body h3 {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-sub);
}

.field input,
.field select,
.field textarea {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
}

.btn-primary,
.btn-secondary {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border);
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn-secondary {
  background: transparent;
  color: var(--text-sub);
}
</style>
