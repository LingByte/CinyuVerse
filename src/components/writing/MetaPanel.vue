<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import type { CharacterCard, GlossaryEntry } from '@/core/types/workspace'
import { loadWorkspaceData, saveWorkspaceData } from '@/features/workspace/utils/localDataStore'
import { useShellSyncStore } from '@/features/shell/stores/shellSyncStore'
import { useProjectMetaStore } from '@/features/workspace/stores/projectMetaStore'
import { Trash2, Plus } from 'lucide-vue-next'

const props = defineProps<{ workspaceId: string | null; workspaceRoot?: string | null }>()

const shellSync = useShellSyncStore()
const metaStore = useProjectMetaStore()
const subTab = ref<'characters' | 'glossary'>('characters')
const characters = ref<CharacterCard[]>([])
const glossary = ref<GlossaryEntry[]>([])
const saving = ref(false)
const search = ref('')
const highlightId = ref<string | null>(null)

async function load() {
  if (!props.workspaceId) return
  characters.value = await loadWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'characters', [])
  glossary.value = await loadWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'glossary', [])
  for (const c of characters.value) {
    if (!c.id) c.id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  }
  for (const g of glossary.value) {
    if (!g.id) g.id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  }
  metaStore.characters = [...characters.value]
  metaStore.glossary = [...glossary.value]
}

async function persistCharacters() {
  if (!props.workspaceId) return
  saving.value = true
  try {
    await saveWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'characters', characters.value)
    metaStore.characters = [...characters.value]
  } finally {
    saving.value = false
  }
}

async function persistGlossary() {
  if (!props.workspaceId) return
  saving.value = true
  try {
    await saveWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'glossary', glossary.value)
    metaStore.glossary = [...glossary.value]
  } finally {
    saving.value = false
  }
}

function addCharacter() {
  characters.value.push({
    id: `c_${Date.now()}`,
    name: '新人物',
    age: '',
    identity: '',
    personality: '',
    relations: '',
    storyline: '',
    dialogue_style: '',
  })
}

function addGlossary() {
  glossary.value.push({
    id: `g_${Date.now()}`,
    term: '新词条',
    category: '世界观',
    definition: '',
  })
}

function removeCharacter(i: number) {
  characters.value.splice(i, 1)
  persistCharacters()
}

function removeGlossaryEntry(g: GlossaryEntry) {
  glossary.value = glossary.value.filter((x) => x !== g)
  persistGlossary()
}

const filteredGlossary = () => {
  const q = search.value.trim().toLowerCase()
  if (!q) return glossary.value
  return glossary.value.filter(
    (g) => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q),
  )
}

function scrollToCard(id: string) {
  nextTick(() => {
    const el = document.getElementById(`meta-card-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightId.value = id
    window.setTimeout(() => {
      if (highlightId.value === id) highlightId.value = null
    }, 2400)
  })
}

function focusCharacter(id: string) {
  subTab.value = 'characters'
  scrollToCard(id)
}

function focusGlossary(id: string) {
  subTab.value = 'glossary'
  scrollToCard(id)
}

function applyFocus(focus: { tab: 'characters' | 'glossary'; id: string }) {
  if (focus.tab === 'characters') focusCharacter(focus.id)
  else focusGlossary(focus.id)
}

defineExpose({ focusCharacter, focusGlossary, applyFocus })

watch(
  () => shellSync.metaFocus,
  (focus) => {
    if (!focus) return
    applyFocus(focus)
    shellSync.clearMetaFocus()
  },
)

watch(() => props.workspaceId, load, { immediate: true })
onMounted(load)
</script>

<template>
  <div class="meta-panel">
    <div v-if="!workspaceId" class="empty">请先打开工作区</div>
    <template v-else>
      <div class="sub-tabs">
        <button :class="{ active: subTab === 'characters' }" @click="subTab = 'characters'">人物卡</button>
        <button :class="{ active: subTab === 'glossary' }" @click="subTab = 'glossary'">世界观词条</button>
      </div>

      <div v-if="subTab === 'characters'" class="panel-scroll">
        <div
          v-for="(c, i) in characters"
          :id="`meta-card-${c.id || i}`"
          :key="c.id || i"
          class="card"
          :class="{ highlighted: highlightId === (c.id || String(i)) }"
        >
          <div class="card-head">
            <input v-model="c.name" class="field title-field" placeholder="姓名" @blur="persistCharacters" />
            <button class="icon-btn danger" title="删除" @click="removeCharacter(i)"><Trash2 :size="14" /></button>
          </div>
          <input v-model="c.age" class="field" placeholder="年龄" @blur="persistCharacters" />
          <input v-model="c.identity" class="field" placeholder="身份" @blur="persistCharacters" />
          <textarea v-model="c.personality" class="field area" placeholder="性格" @blur="persistCharacters" />
          <textarea v-model="c.relations" class="field area" placeholder="人物关系" @blur="persistCharacters" />
          <textarea v-model="c.storyline" class="field area" placeholder="故事线" @blur="persistCharacters" />
          <textarea v-model="c.dialogue_style" class="field area" placeholder="对话风格预设" @blur="persistCharacters" />
        </div>
        <button class="add-btn" @click="addCharacter"><Plus :size="14" /> 添加人物</button>
      </div>

      <div v-else class="panel-scroll">
        <input v-model="search" class="search" placeholder="搜索词条..." />
        <div
          v-for="(g, i) in filteredGlossary()"
          :id="`meta-card-${g.id || i}`"
          :key="g.id || i"
          class="card"
          :class="{ highlighted: highlightId === (g.id || String(i)) }"
        >
          <div class="card-head">
            <input v-model="g.term" class="field title-field" placeholder="词条名" @blur="persistGlossary" />
            <button class="icon-btn danger" @click="removeGlossaryEntry(g)"><Trash2 :size="14" /></button>
          </div>
          <input v-model="g.category" class="field" placeholder="分类（势力/地点/物品）" @blur="persistGlossary" />
          <textarea v-model="g.definition" class="field area" placeholder="解释说明" @blur="persistGlossary" />
        </div>
        <button class="add-btn" @click="addGlossary"><Plus :size="14" /> 添加词条</button>
      </div>

      <div v-if="saving" class="save-hint">保存中…</div>
    </template>
  </div>
</template>

<style scoped>
.meta-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-secondary);
  font-size: 12px;
}

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-sub);
}

.sub-tabs {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.sub-tabs button {
  flex: 1;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
}
.sub-tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--bg-card);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.card.highlighted {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.card-head {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.field {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  margin-bottom: 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  font-family: inherit;
}

.title-field {
  font-weight: 600;
  flex: 1;
}

.area {
  min-height: 48px;
  resize: vertical;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.icon-btn.danger:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 12px;
}
.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.search {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
}

.save-hint {
  padding: 4px 8px;
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}
</style>
