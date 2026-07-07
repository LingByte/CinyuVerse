<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import { X, Check } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  workspaceRoot: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const tab = ref<'llm' | 'prompt' | 'plugin'>('llm')

interface LlmProfile {
  id: string
  label: string
  provider: string
  baseUrl: string
  model: string
  active: boolean
}

interface PromptTemplate {
  id: string
  name: string
  category: string
  systemPrompt: string
  userPrompt: string
}

interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
}

const llmProfiles = ref<LlmProfile[]>([])
const templates = ref<PromptTemplate[]>([])
const plugins = ref<PluginManifest[]>([])
const editTemplate = ref<PromptTemplate | null>(null)
const status = ref('')

function mapLlm(r: Record<string, unknown>): LlmProfile {
  return {
    id: String(r.id),
    label: String(r.label),
    provider: String(r.provider),
    baseUrl: String(r.base_url ?? r.baseUrl ?? ''),
    model: String(r.model),
    active: Boolean(r.active),
  }
}

function mapTpl(r: Record<string, unknown>): PromptTemplate {
  return {
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    systemPrompt: String(r.system_prompt ?? r.systemPrompt ?? ''),
    userPrompt: String(r.user_prompt ?? r.userPrompt ?? ''),
  }
}

function mapPlugin(r: Record<string, unknown>): PluginManifest {
  return {
    id: String(r.id),
    name: String(r.name),
    version: String(r.version),
    description: String(r.description),
    enabled: Boolean(r.enabled),
  }
}

async function loadAll() {
  if (!props.workspaceRoot || !isDesktop()) return
  const [llm, tpl, plug] = await Promise.all([
    desktopApi.listLlmProviders(props.workspaceRoot),
    desktopApi.listPromptTemplates(props.workspaceRoot),
    desktopApi.listPlugins(props.workspaceRoot),
  ])
  llmProfiles.value = (llm as Record<string, unknown>[]).map(mapLlm)
  templates.value = (tpl as Record<string, unknown>[]).map(mapTpl)
  plugins.value = (plug as Record<string, unknown>[]).map(mapPlugin)
}

async function activateLlm(id: string) {
  if (!props.workspaceRoot) return
  await desktopApi.setActiveLlmProvider(props.workspaceRoot, id)
  status.value = `已切换至 ${id}`
  await loadAll()
}

async function saveTemplate() {
  if (!props.workspaceRoot || !editTemplate.value) return
  const t = editTemplate.value
  await desktopApi.savePromptTemplate(props.workspaceRoot, {
    id: t.id || `tpl_${Date.now()}`,
    name: t.name,
    category: t.category,
    system_prompt: t.systemPrompt,
    user_prompt: t.userPrompt,
    created_at: '',
    updated_at: '',
  })
  editTemplate.value = null
  await loadAll()
}

async function togglePlugin(id: string, enabled: boolean) {
  if (!props.workspaceRoot) return
  await desktopApi.setPluginEnabled(props.workspaceRoot, id, enabled)
  await loadAll()
}

const activeLlm = computed(() => llmProfiles.value.find((p) => p.active))

watch(() => props.visible, (v) => {
  if (v) void loadAll()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @click.self="emit('close')">
      <div class="hub">
        <header>
          <h3>扩展与模型</h3>
          <span v-if="activeLlm" class="active-tag">{{ activeLlm.label }}</span>
          <button type="button" class="close" @click="emit('close')"><X :size="16" /></button>
        </header>
        <div class="tabs">
          <button :class="{ active: tab === 'llm' }" @click="tab = 'llm'">LLM 模型</button>
          <button :class="{ active: tab === 'prompt' }" @click="tab = 'prompt'">Prompt 模板</button>
          <button :class="{ active: tab === 'plugin' }" @click="tab = 'plugin'">插件</button>
        </div>
        <div class="body">
          <p v-if="status" class="status">{{ status }}</p>

          <div v-if="tab === 'llm'" class="section">
            <div v-for="p in llmProfiles" :key="p.id" class="card" :class="{ active: p.active }">
              <div class="card-head">
                <strong>{{ p.label }}</strong>
                <button v-if="!p.active" type="button" class="link-btn" @click="activateLlm(p.id)">启用</button>
                <Check v-else :size="14" class="check" />
              </div>
              <div class="meta">{{ p.model }} · {{ p.provider }}</div>
              <code class="url">{{ p.baseUrl }}</code>
            </div>
          </div>

          <div v-else-if="tab === 'prompt'" class="section">
            <button
              type="button"
              class="add-btn"
              @click="editTemplate = { id: '', name: '新模板', category: 'writing', systemPrompt: '', userPrompt: '' }"
            >
              + 新建模板
            </button>
            <div v-if="editTemplate" class="edit-form">
              <input v-model="editTemplate.name" placeholder="名称" />
              <input v-model="editTemplate.category" placeholder="分类" />
              <textarea v-model="editTemplate.systemPrompt" placeholder="System Prompt" rows="3" />
              <textarea v-model="editTemplate.userPrompt" placeholder="User Prompt（可用 {{selection}}）" rows="3" />
              <div class="form-actions">
                <button type="button" @click="editTemplate = null">取消</button>
                <button type="button" class="primary" @click="saveTemplate">保存</button>
              </div>
            </div>
            <div v-for="t in templates" :key="t.id" class="card" @click="editTemplate = { ...t }">
              <strong>{{ t.name }}</strong>
              <span class="meta">{{ t.category }}</span>
            </div>
          </div>

          <div v-else class="section">
            <p class="hint">将插件放入 `.cinyuverse/plugins/插件名/plugin.json`</p>
            <div v-for="p in plugins" :key="p.id" class="card">
              <div class="card-head">
                <strong>{{ p.name }}</strong>
                <label class="toggle">
                  <input type="checkbox" :checked="p.enabled" @change="togglePlugin(p.id, ($event.target as HTMLInputElement).checked)" />
                  启用
                </label>
              </div>
              <div class="meta">v{{ p.version }} — {{ p.description }}</div>
            </div>
            <p v-if="!plugins.length" class="empty">暂无插件</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: color-mix(in srgb, #000 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hub {
  width: min(520px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

header h3 {
  margin: 0;
  flex: 1;
  font-size: 14px;
}

.active-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.close {
  border: none;
  background: transparent;
  cursor: pointer;
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
}

.tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}

.card.active {
  border-color: var(--accent);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
}

.check {
  margin-left: auto;
  color: var(--accent);
}

.meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.url {
  font-size: 9px;
  color: var(--text-muted);
  display: block;
  margin-top: 4px;
  word-break: break-all;
}

.add-btn {
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
}

.edit-form input,
.edit-form textarea {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  font-family: inherit;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-actions .primary {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.hint, .empty, .status {
  font-size: 11px;
  color: var(--text-muted);
}

.toggle {
  margin-left: auto;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
