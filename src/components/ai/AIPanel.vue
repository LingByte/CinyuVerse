<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Bot,
  Sparkles,
  Code,
  FileText,
  CheckCircle,
  AlertTriangle,
  Settings,
  Plus,
  Clock,
  ArrowLeft,
  X,
} from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/tauri'
import { useConversationStore } from '@/stores/conversation'
import { renderMarkdown } from '@/utils/markdown'

type FileRef = { path: string; displayPath: string }
type AiEditItem = { path: string; newText: string }
type AiEditPayload = { edits: AiEditItem[] }
type DecomposeMessage = { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }

const props = defineProps<{ rootPath?: string }>()

const store = useConversationStore()
const activeTab = ref<'chat' | 'decompose'>('chat')
const showHistory = ref(false)
const input = ref('')
const decomposeMessages = ref<DecomposeMessage[]>([])
const decomposeLoading = ref(false)
const isConfigured = ref<boolean | null>(null)
const fileRefs = ref<FileRef[]>([])
const filePickerOpen = ref(false)
const filePickerQuery = ref('')
const filePickerItems = ref<FileRef[]>([])
const filePickerBusy = ref(false)
const appliedByMsgId = ref<Record<string, Record<string, boolean>>>({})

const isChatTab = computed(() => activeTab.value === 'chat')
const isDecomposeTab = computed(() => activeTab.value === 'decompose')
const canReferenceFiles = computed(() => Boolean(props.rootPath?.trim()))
const filteredPickerItems = computed(() => {
  const q = filePickerQuery.value.trim().toLowerCase()
  if (!q) return filePickerItems.value
  return filePickerItems.value.filter((it) => it.displayPath.toLowerCase().includes(q))
})

function isAbsolutePath(p: string) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/')
}

function joinPath(parent: string, child: string) {
  if (!parent) return child
  const sep = parent.includes('\\') ? '\\' : '/'
  const p = parent.endsWith('\\') || parent.endsWith('/') ? parent.slice(0, -1) : parent
  const c = child.startsWith('\\') || child.startsWith('/') ? child.slice(1) : child
  return p + sep + c
}

function extractFirstJsonObject(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const jsonFenceMatch = s.match(/```json\s*([\s\S]*?)\s*```/i)
  if (jsonFenceMatch?.[1]) return jsonFenceMatch[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) return s.slice(first, last + 1).trim()
  return ''
}

function tryParseEditsFromAssistant(content: string): AiEditPayload | null {
  const candidate = extractFirstJsonObject(content)
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    if (!parsed || !Array.isArray(parsed.edits)) return null
    const edits = (parsed.edits as Record<string, unknown>[])
      .filter((e) => e && typeof e.path === 'string' && typeof e.newText === 'string')
      .map((e) => ({ path: String(e.path), newText: String(e.newText) }))
    return edits.length ? { edits } : null
  } catch {
    return null
  }
}

async function checkAIConfig() {
  try {
    const config = await invoke('ai_get_config')
    isConfigured.value = !!config
  } catch {
    isConfigured.value = false
  }
}

async function handleNewConversation() {
  try {
    const conversationId = await store.createConversation('新的对话')
    await store.loadConversation(conversationId)
    showHistory.value = false
  } catch (err) {
    console.error('创建会话失败:', err)
  }
}

async function handleSelectConversation(id: string) {
  try {
    await store.loadConversation(id)
    showHistory.value = false
  } catch (err) {
    console.error('加载会话失败:', err)
  }
}

async function handleDeleteConversation(id: string) {
  try {
    await store.deleteConversation(id)
  } catch (err) {
    console.error('删除会话失败:', err)
  }
}

async function loadProjectFiles() {
  if (!props.rootPath) return
  filePickerBusy.value = true
  try {
    const entries = await invoke<unknown[]>('read_directory_tree', { path: props.rootPath, maxDepth: 8 })
    const out: FileRef[] = []
    const excluded = new Set(['node_modules', 'target', 'dist', 'build', '.git', '.next', '.turbo', '.cache', '.idea', '.vscode'])
    const walk = (nodes: unknown[]) => {
      for (const n of nodes ?? []) {
        const item = n as Record<string, unknown>
        const p = typeof item.path === 'string' ? item.path : ''
        const t = typeof item.type === 'string' ? item.type : typeof item.entry_type === 'string' ? item.entry_type : ''
        const isDir = t === 'directory' || Array.isArray(item.children)
        if (isDir) {
          const name = typeof item.name === 'string' && item.name ? String(item.name) : p.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? ''
          if (name && excluded.has(name)) continue
          if (Array.isArray(item.children)) walk(item.children)
          continue
        }
        if (!p) continue
        const rel = props.rootPath && p.startsWith(props.rootPath) ? p.slice(props.rootPath.length).replace(/^\//, '') : p
        out.push({ path: p, displayPath: rel || p })
      }
    }
    walk(Array.isArray(entries) ? entries : [])
    out.sort((a, b) => a.displayPath.localeCompare(b.displayPath))
    filePickerItems.value = out
  } catch (e) {
    console.error('Failed to load project files for reference:', e)
    filePickerItems.value = []
  } finally {
    filePickerBusy.value = false
  }
}

function toggleFileRef(refItem: FileRef) {
  const exists = fileRefs.value.some((x) => x.path === refItem.path)
  fileRefs.value = exists ? fileRefs.value.filter((x) => x.path !== refItem.path) : [...fileRefs.value, refItem]
}

async function buildAiContentWithRefs(raw: string) {
  const base = raw.trim()
  if (!base) return ''
  if (!fileRefs.value.length) return base
  const blocks: string[] = []
  for (const r of fileRefs.value) {
    try {
      const text = await invoke<unknown>('read_file', { path: r.path })
      const s = typeof text === 'string' ? text : String(text ?? '')
      const truncated = s.length > 12000
      blocks.push(`--- FILE: ${r.displayPath}${truncated ? ' (TRUNCATED)' : ''} ---\n${truncated ? s.slice(0, 12000) : s}`)
    } catch {
      blocks.push(`--- FILE: ${r.displayPath} (FAILED TO READ) ---`)
    }
  }
  return (
    'You are editing a codebase. The user referenced these files. Use them as context.\n' +
    'Always reply in normal human language first (explain what you will change and why).\n' +
    'If you propose changes to files, append a single JSON object at the END of your response inside a ```json code block with schema: {"edits": [{"path": string, "newText": string}]}.\n' +
    'Each newText must be the full updated file content. Paths should be relative to the project root when possible.\n' +
    'Do not output multiple edits blocks; output at most one JSON code block.\n\n' +
    blocks.join('\n\n') +
    '\n\n--- USER MESSAGE ---\n' +
    base
  )
}

function resolveEditPath(p: string) {
  const raw = String(p ?? '').trim()
  if (!raw) return ''
  if (isAbsolutePath(raw)) return raw
  if (!props.rootPath) return raw
  return joinPath(props.rootPath, raw)
}

async function applyEdit(msgId: string, edit: AiEditItem) {
  const abs = resolveEditPath(edit.path)
  if (!abs) return
  await invoke('write_file', { path: abs, content: edit.newText })
  appliedByMsgId.value = {
    ...appliedByMsgId.value,
    [msgId]: { ...(appliedByMsgId.value[msgId] ?? {}), [edit.path]: true },
  }
}

function buildDisplayContentWithRefs(raw: string) {
  const base = raw.trim()
  if (!fileRefs.value.length) return base
  return `${base}\n\nReferenced files:\n${fileRefs.value.map((r) => `@${r.displayPath}`).join('\n')}`
}

async function handleSendMessage() {
  if (!input.value.trim() || store.isLoading) return
  const messageContent = input.value.trim()
  input.value = ''
  try {
    await store.sendMessage(await buildAiContentWithRefs(messageContent), {
      displayContent: buildDisplayContentWithRefs(messageContent),
    })
  } catch (err) {
    console.error('发送消息失败:', err)
    input.value = messageContent
  }
}

async function decomposeRequirement() {
  if (!input.value.trim()) return
  decomposeMessages.value.push({ id: Date.now().toString(), role: 'user', content: input.value, timestamp: new Date() })
  const req = input.value
  input.value = ''
  decomposeLoading.value = true
  try {
    const requirement = await invoke('analyze_requirement', {
      requirementText: req,
      projectContext: { project_root: '', project_type: 'web', tech_stack: ['rust', 'typescript', 'vue'], existing_files: [], dependencies: [] },
    })
    const tasks = (await invoke('simple_decompose_requirement', { requirement })) as Record<string, unknown>[]
    let taskContent = `📋 **任务拆解结果**\n\n`
    tasks.forEach((task, index) => {
      taskContent += `## 任务 ${index + 1}: ${task.title}\n`
      taskContent += `- **类型**: ${task.task_type}\n- **优先级**: ${task.priority}\n- **预估时间**: ${task.estimated_time} 分钟\n`
      taskContent += `- **描述**: ${task.description}\n- **需要文件**: ${(task.required_files as string[]).join(', ')}\n`
      taskContent += `- **验收标准**: ${(task.acceptance_criteria as string[]).join(', ')}\n\n`
    })
    decomposeMessages.value.push({ id: (Date.now() + 1).toString(), role: 'assistant', content: taskContent, timestamp: new Date() })
  } catch (error) {
    decomposeMessages.value.push({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `❌ **任务拆解失败**\n\n\`\`\`\n${error}\n\`\`\``,
      timestamp: new Date(),
    })
  } finally {
    decomposeLoading.value = false
  }
}

function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (isChatTab.value) void handleSendMessage()
    else if (isDecomposeTab.value) void decomposeRequirement()
  }
}

function markdownHtml(content: string) {
  return renderMarkdown(content)
}

async function toggleFilePicker() {
  if (!canReferenceFiles.value) return
  filePickerOpen.value = !filePickerOpen.value
  if (filePickerOpen.value && !filePickerItems.value.length && !filePickerBusy.value) {
    await loadProjectFiles()
  }
}

onMounted(() => {
  void checkAIConfig()
})
</script>

<template>
  <div v-if="showHistory" class="flex flex-col h-full bg-white">
    <div class="flex items-center gap-3 p-3 border-b border-gray-200">
      <button type="button" class="p-1 text-gray-400 hover:text-gray-600 transition-colors" @click="showHistory = false">
        <ArrowLeft class="w-4 h-4" />
      </button>
      <h3 class="font-semibold text-gray-900">会话历史</h3>
    </div>
    <div class="flex-1 overflow-y-auto p-3">
      <div v-if="!store.conversations.length" class="text-center text-gray-500 py-8">
        <Clock class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p class="text-sm">还没有会话历史</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="conversation in store.conversations"
          :key="conversation.id"
          class="p-3 rounded-lg cursor-pointer transition-colors"
          :class="store.currentConversation?.id === conversation.id ? 'bg-blue-100 border border-blue-200' : 'bg-white hover:bg-gray-50 border border-gray-200'"
          @click="handleSelectConversation(conversation.id)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-medium text-gray-900 truncate">{{ conversation.title }}</h4>
              <p class="text-xs text-gray-500 mt-1">{{ conversation.messages.length }} 条消息 · {{ new Date(conversation.updated_at * 1000).toLocaleDateString() }}</p>
            </div>
            <button type="button" class="p-1 text-gray-400 hover:text-red-600 transition-colors" @click.stop="handleDeleteConversation(conversation.id)">
              <Settings class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="isConfigured === false" class="flex flex-col h-full bg-white">
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="text-center max-w-md">
        <AlertTriangle class="w-16 h-16 mx-auto mb-4 text-amber-500" />
        <h3 class="text-lg font-semibold text-gray-900 mb-2">AI 服务未配置</h3>
        <p class="text-gray-600 mb-4">请先配置 AI 服务才能使用聊天功能。</p>
      </div>
    </div>
  </div>

  <div v-else-if="isConfigured === null" class="flex flex-col h-full bg-white">
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-500">
        <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p class="text-sm">正在检查 AI 配置...</p>
      </div>
    </div>
  </div>

  <div v-else class="flex flex-col h-full bg-white">
    <div class="flex items-center justify-between p-3 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <Bot class="w-5 h-5 text-blue-600" />
        <h3 class="font-semibold text-gray-900">AI Assistant</h3>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="isChatTab">
          <button type="button" class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="新建会话" @click="handleNewConversation"><Plus class="w-4 h-4" /></button>
          <button type="button" class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="会话历史" @click="showHistory = true"><Clock class="w-4 h-4" /></button>
        </template>
        <div v-if="isConfigured" class="flex items-center gap-1 text-green-600"><CheckCircle class="w-4 h-4" /><span class="text-xs">已连接</span></div>
        <button type="button" class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="重新检查配置" @click="checkAIConfig"><Settings class="w-4 h-4" /></button>
      </div>
    </div>

    <div class="flex border-b border-gray-200">
      <button type="button" class="flex-1 px-3 py-2 text-sm font-medium" :class="isChatTab ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'" @click="activeTab = 'chat'">
        <div class="flex items-center justify-center gap-2"><Sparkles class="w-4 h-4" />AI 聊天</div>
      </button>
      <button type="button" class="flex-1 px-3 py-2 text-sm font-medium" :class="isDecomposeTab ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'" @click="activeTab = 'decompose'">
        <div class="flex items-center justify-center gap-2"><FileText class="w-4 h-4" />任务拆解</div>
      </button>
    </div>

    <template v-if="isChatTab">
      <div v-if="store.currentConversation" class="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <p class="text-sm font-medium text-gray-900 truncate">{{ store.currentConversation.title }}</p>
        <p class="text-xs text-gray-500">{{ store.currentConversation.messages.length }} 条消息</p>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div v-if="!store.currentConversation" class="text-center text-gray-500 py-8">
          <Bot class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p class="text-sm">点击右上角 + 创建新会话开始对话</p>
        </div>
        <div v-else-if="!store.currentConversation.messages.length" class="text-center text-gray-500 py-8">
          <Bot class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p class="text-sm">开始与 GoPilot 代码助手对话吧！</p>
        </div>
        <template v-else>
          <div
            v-for="message in store.currentConversation!.messages"
            :key="message.id"
            class="flex gap-3"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
          <div v-if="message.role === 'assistant'" class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Bot class="w-4 h-4 text-blue-600" /></div>
          <div class="max-w-[80%] rounded-lg px-3 py-2" :class="message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'">
            <div class="text-sm">
              <template v-if="message.role === 'assistant'">
                <div v-if="tryParseEditsFromAssistant(String(message.content ?? ''))" class="mb-2 rounded-md border border-blue-200 bg-blue-50 p-2">
                  <div class="text-xs font-medium text-blue-800 mb-1">Edits</div>
                  <div v-for="(e, idx) in tryParseEditsFromAssistant(String(message.content ?? ''))!.edits" :key="e.path + '_' + idx" class="flex items-center justify-between gap-2 mb-1">
                    <div class="text-[11px] text-blue-900 truncate">{{ e.path }}</div>
                    <button type="button" class="text-[11px] px-2 py-1 rounded border" :class="appliedByMsgId[message.id]?.[e.path] ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'" :disabled="!!appliedByMsgId[message.id]?.[e.path]" @click="applyEdit(message.id, e)">
                      {{ appliedByMsgId[message.id]?.[e.path] ? 'Applied' : 'Apply' }}
                    </button>
                  </div>
                </div>
                <div class="prose prose-sm max-w-none" v-html="markdownHtml(message.content)" />
              </template>
              <div v-else class="whitespace-pre-wrap">{{ message.content }}</div>
            </div>
            <div class="text-xs opacity-70 mt-1">{{ new Date(message.timestamp * 1000).toLocaleTimeString() }}</div>
          </div>
          <div v-if="message.role === 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center"><span class="text-white text-sm font-medium">U</span></div>
        </div>
        <div v-if="store.isLoading" class="flex gap-3 justify-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Bot class="w-4 h-4 text-blue-600" /></div>
          <div class="bg-gray-100 rounded-lg px-3 py-2"><div class="flex items-center gap-1"><div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" /><div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.12s" /><div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.24s" /></div></div>
        </div>
        </template>
      </div>
      <div class="border-t border-gray-200 p-3">
        <div v-if="fileRefs.length" class="mb-2 flex flex-wrap gap-1">
          <button v-for="r in fileRefs" :key="r.path" type="button" class="text-[11px] px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100" @click="toggleFileRef(r)">@{{ r.displayPath }}</button>
        </div>
        <div v-if="filePickerOpen" class="mb-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div class="p-2 border-b border-gray-200">
            <input v-model="filePickerQuery" type="text" :placeholder="filePickerBusy ? 'Loading...' : 'Search files...'" class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" :disabled="filePickerBusy" />
          </div>
          <div class="max-h-52 overflow-auto p-1">
            <div v-if="filePickerBusy" class="p-2 text-xs text-gray-500">Loading...</div>
            <div v-else-if="!filteredPickerItems.length" class="p-2 text-xs text-gray-500">No files</div>
            <button v-for="it in filteredPickerItems.slice(0, 200)" :key="it.path" type="button" class="w-full text-left px-2 py-1.5 rounded text-xs" :class="fileRefs.some((x) => x.path === it.path) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'" @click="toggleFileRef(it)">{{ fileRefs.some((x) => x.path === it.path) ? '✓ ' : '' }}{{ it.displayPath }}</button>
          </div>
        </div>
        <div class="flex gap-2 items-start">
          <input v-model="input" type="text" :placeholder="store.currentConversation ? '输入消息...' : '请先创建会话'" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50" :disabled="store.isLoading" @keypress="handleKeyPress" />
          <button type="button" class="px-2.5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50" :disabled="!canReferenceFiles || store.isLoading" @click="toggleFilePicker"><FileText class="w-4 h-4 text-gray-700" /></button>
          <button type="button" class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2" :disabled="!input.trim() && !store.isLoading" @click="store.isLoading ? store.cancelCurrentSend() : handleSendMessage()">
            <X v-if="store.isLoading" class="w-4 h-4" /><Sparkles v-else class="w-4 h-4" />
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div v-if="!decomposeMessages.length" class="text-center text-gray-500 py-8"><FileText class="w-12 h-12 mx-auto mb-3 text-gray-300" /><p class="text-sm">输入需求，AI 将为您拆解为具体任务。</p></div>
        <template v-else>
        <div
          v-for="message in decomposeMessages"
          :key="message.id"
          class="flex gap-3"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div v-if="message.role === 'assistant'" class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Bot class="w-4 h-4 text-blue-600" /></div>
          <div class="max-w-[80%] rounded-lg px-3 py-2" :class="message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'">
            <div v-if="message.role === 'assistant'" class="prose prose-sm max-w-none text-sm" v-html="markdownHtml(message.content)" />
            <div v-else class="text-sm whitespace-pre-wrap">{{ message.content }}</div>
            <div class="text-xs opacity-70 mt-1">{{ message.timestamp.toLocaleTimeString() }}</div>
          </div>
          <div v-if="message.role === 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center"><span class="text-white text-sm font-medium">U</span></div>
        </div>
        </template>
        <div v-if="decomposeLoading" class="flex gap-3 justify-start"><div class="bg-gray-100 rounded-lg px-3 py-2"><div class="flex items-center gap-1"><div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" /></div></div></div>
      </div>
      <div class="border-t border-gray-200 p-3">
        <div class="flex gap-2">
          <input v-model="input" type="text" placeholder="输入需求，AI 将为您拆解为具体任务..." class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" :disabled="decomposeLoading" @keypress="handleKeyPress" />
          <button type="button" class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" :disabled="decomposeLoading || !input.trim()" @click="decomposeRequirement"><Code class="w-4 h-4" /></button>
        </div>
        <div class="mt-2 text-xs text-gray-500">💡 提示：输入需求后，AI 将自动拆解为具体的开发任务</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import 'highlight.js/styles/github.css';
</style>

<style>
@keyframes aiDotPulse {
  0% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-3px); opacity: 1; }
  60%, 100% { transform: translateY(0); opacity: 0.45; }
}
</style>
