<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { ProjectOutline, OutlineNode } from '@/types/workspace'
import { EMPTY_OUTLINE, loadWorkspaceJson, saveWorkspaceJson } from '@/utils/localDataStore'

const props = defineProps<{
  workspaceId: string | null
}>()

const emit = defineEmits<{
  jumpChapter: [volId: string, chId: string, title: string]
}>()

const subTab = ref<'tree' | 'timeline'>('tree')
const outline = ref<ProjectOutline>({ ...EMPTY_OUTLINE, volume_nodes: [], timeline: [] })
const saving = ref(false)

function load() {
  if (!props.workspaceId) return
  outline.value = loadWorkspaceJson(props.workspaceId, 'outline', {
    book_outline: '',
    volume_nodes: [],
    timeline: [],
  })
}

async function persist() {
  if (!props.workspaceId) return
  saving.value = true
  try {
    saveWorkspaceJson(props.workspaceId, 'outline', outline.value)
  } finally {
    saving.value = false
  }
}

function jump(node: OutlineNode) {
  if (node.vol_id && node.chapter_id) {
    emit('jumpChapter', node.vol_id, node.chapter_id, node.title)
  }
}

function addTimeline() {
  outline.value.timeline.push({
    id: 'tl_' + Date.now(),
    title: '新事件',
    date_label: '',
    description: '',
    characters: [],
  })
}

function exportMd() {
  const lines = [outline.value.book_outline, '']
  for (const node of outline.value.volume_nodes) {
    lines.push(`## ${node.title}`, node.content)
  }
  downloadText(lines.join('\n'), 'outline.md')
}

function importMd() {
  const text = prompt('粘贴 Markdown 大纲内容：')
  if (!text?.trim() || !props.workspaceId) return
  outline.value = {
    ...outline.value,
    book_outline: text.trim(),
  }
  persist()
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

watch(() => props.workspaceId, load, { immediate: true })
onMounted(load)
</script>

<template>
  <div class="outline-panel">
    <div v-if="!workspaceId" class="empty">请先打开工作区</div>
    <template v-else>
      <div class="toolbar">
        <button :class="{ active: subTab === 'tree' }" @click="subTab = 'tree'">树形大纲</button>
        <button :class="{ active: subTab === 'timeline' }" @click="subTab = 'timeline'">时间线</button>
        <button class="tool-btn" title="导出 Markdown" @click="exportMd">导出</button>
        <button class="tool-btn" @click="importMd">导入</button>
      </div>

      <div v-if="subTab === 'tree'" class="scroll">
        <label class="field-label">全书总大纲</label>
        <textarea v-model="outline.book_outline" class="area" @blur="persist" />

        <div v-for="vol in outline.volume_nodes" :key="vol.id" class="vol-block">
          <input v-model="vol.title" class="field title" @blur="persist" />
          <textarea v-model="vol.content" class="area small" placeholder="分卷大纲" @blur="persist" />
          <div v-for="sec in (vol.children || [])" :key="sec.id" class="sec-row">
            <span class="link" @click="jump(sec)">{{ sec.title }}</span>
            <input v-model="sec.content" class="field" placeholder="章节小节" @blur="persist" />
          </div>
        </div>
      </div>

      <div v-else class="scroll">
        <div v-for="ev in outline.timeline" :key="ev.id" class="tl-card">
          <input v-model="ev.date_label" class="field" placeholder="时间" @blur="persist" />
          <input v-model="ev.title" class="field title" placeholder="事件" @blur="persist" />
          <textarea v-model="ev.description" class="area small" placeholder="描述" @blur="persist" />
          <input
            :value="(ev.characters || []).join(', ')"
            class="field"
            placeholder="人物（逗号分隔）"
            @change="(e) => { ev.characters = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()); persist() }"
          />
        </div>
        <button class="add-btn" @click="addTimeline">+ 添加事件</button>
      </div>

      <div v-if="saving" class="hint">保存中…</div>
    </template>
  </div>
</template>

<style scoped>
.outline-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.empty { padding: 24px 12px; text-align: center; color: var(--text-sub); }

.toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.toolbar button {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
}
.toolbar button.active { border-color: var(--accent); color: var(--accent); }
.tool-btn { margin-left: auto; }

.scroll { flex: 1; overflow-y: auto; padding: 8px; }

.field-label { display: block; font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
.field, .area {
  width: 100%;
  margin-bottom: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  box-sizing: border-box;
}
.area { min-height: 64px; resize: vertical; font-family: inherit; }
.area.small { min-height: 40px; }
.title { font-weight: 600; }

.vol-block {
  margin-top: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
}
.sec-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
  padding-left: 8px;
}
.link {
  flex-shrink: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link:hover { text-decoration: underline; }

.tl-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--bg-card);
}

.add-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  border-radius: 4px;
}
.hint { text-align: center; font-size: 10px; color: var(--text-muted); padding: 4px; }
</style>
