<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useLocalAiPipeline } from '@/features/ai/composables/useLocalAiPipeline'
import { useLocalChat } from '@/features/chat/composables/useLocalChat'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import {
  MessageSquare,
  Layers,
  Loader2,
  ArrowUp,
  Pin,
  X,
  Sparkles,
  Plus,
} from 'lucide-vue-next'
import MarkdownContent from '@/components/ai/MarkdownContent.vue'

export interface PipelineTrigger {
  id: number
  mode: 'simple' | 'tier3'
  instruction: string
  chapterPath?: string
  chapterContent?: string
  onComplete?: (text: string) => void | Promise<void>
}

const props = defineProps<{
  workspaceRoot: string | null
  workspaceId?: string | null
  currentChapterPath?: string | null
  pipelineTrigger?: PipelineTrigger | null
}>()

const emit = defineEmits<{
  insert: [text: string]
  chapterWritten: [path: string, content: string]
}>()

type Mode = 'simple' | 'tier3'

const mode = ref<Mode>('simple')
const instruction = ref('')
const pipelineStages = ref<{ stage: string; content: string }[]>([])
const chatEndRef = ref<HTMLDivElement>()

const workspaceIdRef = computed(() => props.workspaceId ?? null)
const workspaceNameRef = computed(() => props.workspaceRoot?.split(/[/\\]/).pop() ?? '工作区')
const chat = useLocalChat(workspaceIdRef, workspaceNameRef)

const pipeline = useLocalAiPipeline()
const { busy, lockedContext, removeLockedSnippet } = pipeline
const pinSnippet = ref('')

const displayMessages = computed(() =>
  chat.messages.value.filter((m) => m.role === 'user' || m.role === 'assistant'),
)

const canSend = computed(
  () =>
    !!props.workspaceRoot
    && !!props.workspaceId
    && isDesktop()
    && instruction.value.trim()
    && !busy.value
    && !chat.sending.value,
)

const inputPlaceholder = computed(() => {
  if (!props.workspaceRoot) return '请先打开工作区文件夹…'
  if (!props.workspaceId) return '请先打开工作区文件夹…'
  if (mode.value === 'tier3') return '创作指导（可选）— 大纲→正文→校对'
  return '对话：规划、续写、问答…'
})

function scrollToBottom() {
  nextTick(() => chatEndRef.value?.scrollIntoView({ behavior: 'smooth' }))
}

function pinSelection() {
  const t = pinSnippet.value.trim()
  if (t) pipeline.addLockedSnippet(t)
  pinSnippet.value = ''
}

async function runPipeline(opts: {
  text: string
  mode: Mode
  chapterPath?: string
  chapterContent?: string
  onComplete?: (text: string) => void | Promise<void>
}) {
  if (!props.workspaceRoot) return
  const chapterPath = opts.chapterPath ?? props.currentChapterPath ?? ''

  if (opts.mode === 'tier3') {
    pipelineStages.value = []
    const result = await pipeline.runThreeTierPipeline({
      workspaceRoot: props.workspaceRoot,
      chapterPath,
      instruction: opts.text,
      chapterContent: opts.chapterContent,
      onStage: (stage, content) => {
        pipelineStages.value.push({ stage, content })
        scrollToBottom()
      },
      taskId: chapterPath ? `pipe_${Date.now()}` : undefined,
    })
    if (result) {
      await chat.appendConversationPair(opts.text, result)
      if (opts.onComplete) {
        await opts.onComplete(result)
      } else if (chapterPath && !chapterPath.startsWith('cinyuverse://')) {
        emit('chapterWritten', chapterPath, result)
      }
    }
  } else {
    const built = await desktopApi.buildWritingPrompt({
      workspace_root: props.workspaceRoot!,
      user_instruction: opts.text,
      chapter_path: chapterPath || undefined,
    })
    const reply = await desktopApi.aiChatStream({
      model: 'default',
      messages: [
        { role: 'system', content: built.system_prompt },
        { role: 'user', content: built.user_prompt },
      ],
    }, () => {})
    const trimmed = reply.trim()
    if (trimmed) {
      await chat.appendConversationPair(opts.text, trimmed)
      if (opts.onComplete) await opts.onComplete(trimmed)
    }
  }
  scrollToBottom()
}

async function handleSend() {
  if (!canSend.value || !props.workspaceRoot) return
  const text = instruction.value.trim()
  instruction.value = ''
  scrollToBottom()
  await runPipeline({ text, mode: mode.value })
}

function newChatSession() {
  void chat.createNewSession()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
}

async function extractStyle() {
  if (!props.workspaceRoot) return
  await desktopApi.extractStyleSample(props.workspaceRoot)
  await chat.appendConversationPair(
    '提取文风样本',
    '已从现有章节提取文风样本并写入 `.cinyuverse/project.json`。',
  )
  scrollToBottom()
}

watch(() => pipeline.error.value, (err) => {
  if (err) void chat.appendConversationPair('（系统）', `⚠ ${err}`)
})

watch(() => chat.error.value, (err) => {
  if (err) scrollToBottom()
})

watch(() => displayMessages.value.length, scrollToBottom)

watch(
  () => props.pipelineTrigger,
  (trigger) => {
    if (!trigger) return
    mode.value = trigger.mode
    instruction.value = trigger.instruction
    scrollToBottom()
    void runPipeline({
      text: trigger.instruction,
      mode: trigger.mode,
      chapterPath: trigger.chapterPath,
      chapterContent: trigger.chapterContent,
      onComplete: trigger.onComplete,
    })
  },
)
</script>

<template>
  <div class="workspace-ai">
    <div class="ai-toolbar">
      <div class="mode-segment">
        <button type="button" class="mode-btn" :class="{ active: mode === 'simple' }" @click="mode = 'simple'">
          <MessageSquare :size="13" /><span>对话</span>
        </button>
        <button type="button" class="mode-btn" :class="{ active: mode === 'tier3' }" @click="mode = 'tier3'">
          <Layers :size="13" /><span>创作</span>
        </button>
      </div>
      <button type="button" class="tool-mini" title="新对话" @click="newChatSession">
        <Plus :size="13" />
      </button>
      <button type="button" class="tool-mini" title="提取文风样本" @click="extractStyle">
        <Sparkles :size="13" />
      </button>
    </div>

    <div class="context-lock">
      <div class="lock-head">
        <Pin :size="12" />
        <span>锁定上下文片段（{{ lockedContext.snippets.length }}）</span>
      </div>
      <div class="lock-input-row">
        <input v-model="pinSnippet" class="lock-input" placeholder="粘贴关键设定/片段后点击固定…" />
        <button type="button" class="lock-add" @click="pinSelection">固定</button>
      </div>
      <div v-for="(s, i) in lockedContext.snippets" :key="i" class="lock-chip">
        <span>{{ s.slice(0, 80) }}{{ s.length > 80 ? '…' : '' }}</span>
        <button type="button" @click="removeLockedSnippet(i)"><X :size="10" /></button>
      </div>
    </div>

    <div class="chat-scroll">
      <p v-if="chat.sessionTitle" class="session-title">{{ chat.sessionTitle }}</p>
      <div v-for="(m, i) in displayMessages" :key="m.id ?? i" class="msg" :class="m.role">
        <MarkdownContent v-if="m.role === 'assistant'" :content="m.content" />
        <p v-else>{{ m.content }}</p>
        <div v-if="m.role === 'assistant'" class="msg-actions">
          <button type="button" @click="emit('insert', m.content)">插入编辑器</button>
        </div>
      </div>
      <div v-for="(st, i) in pipelineStages" :key="'st' + i" class="stage-card">
        <div class="stage-label">{{ st.stage }}</div>
        <MarkdownContent :content="st.content.slice(0, 600) + (st.content.length > 600 ? '…' : '')" />
      </div>
      <div v-if="busy || chat.sending.value" class="busy-row">
        <Loader2 :size="14" class="spin" /> 生成中…
      </div>
      <div ref="chatEndRef" />
    </div>

    <div class="composer">
      <textarea
        v-model="instruction"
        class="composer-input"
        :placeholder="inputPlaceholder"
        rows="2"
        @keydown="onKeydown"
      />
      <button type="button" class="send-btn" :disabled="!canSend" @click="handleSend">
        <ArrowUp :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-ai {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.ai-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.mode-segment {
  display: flex;
  gap: 2px;
  flex: 1;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}

.mode-btn.active {
  background: var(--bg-card);
  color: var(--accent);
}

.tool-mini {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

.context-lock {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.lock-head {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.lock-input-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.lock-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 11px;
}

.lock-add {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
  color: var(--accent);
}

.lock-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-sub);
}

.lock-chip button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.session-title {
  font-size: 10px;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.msg {
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.msg.user p {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text-main);
}

.msg-actions {
  margin-top: 6px;
}

.msg-actions button {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--accent);
}

.stage-card {
  margin-bottom: 8px;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  font-size: 11px;
}

.stage-label {
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.busy-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.composer {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border);
}

.composer-input {
  flex: 1;
  resize: none;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
