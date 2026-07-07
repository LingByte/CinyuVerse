<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStoryAgent, type PipelineAction } from '@/features/story/composables/useStoryAgent'
import { useStoryStore } from '@/features/story/stores/storyStore'
import { parseStoryChapterPath } from '@/core/types/story'
import {
  BookOpen,
  Loader2,
  ArrowUp,
  PenLine,
  ListChecks,
  FileEdit,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  ChevronDown,
  MessageSquare,
  Wrench,
  ChevronRight,
} from 'lucide-vue-next'
import MarkdownContent from '@/components/ai/MarkdownContent.vue'

const props = defineProps<{
  currentChapterPath?: string | null
  currentChapterNum?: number | null
  folderOpen?: boolean
  isBookProject?: boolean
  isLibrary?: boolean
}>()

const emit = defineEmits<{
  insert: [text: string]
  chapterWritten: [bookId: string, chapterNum: number, title: string, content: string]
  createBook: []
}>()

const currentChapterNumRef = computed(() => {
  if (props.currentChapterNum != null && props.currentChapterNum > 0) {
    return props.currentChapterNum
  }
  if (!props.currentChapterPath) return null
  const parsed = parseStoryChapterPath(props.currentChapterPath)
  return parsed?.chapterNum ?? null
})

const storyStore = useStoryStore()
const agent = useStoryAgent(currentChapterNumRef)

const books = computed(() => storyStore.books ?? [])

const instruction = ref('')
const error = ref('')
const panelMode = ref<'agent' | 'pipeline'>('agent')
const showBookMenu = ref(false)
const showToolLog = ref(false)
const chatEndRef = ref<HTMLDivElement>()
const textareaRef = ref<HTMLTextAreaElement>()

const pipelineActions: { id: PipelineAction; label: string; icon: typeof PenLine; desc: string; needsChapter?: boolean }[] = [
  { id: 'write-next', label: '写下一章', icon: PenLine, desc: '完整流水线：规划→写作→审核→修订' },
  { id: 'plan', label: '规划章节', icon: ListChecks, desc: '生成本章意图与备忘录' },
  { id: 'draft', label: '起草', icon: FileEdit, desc: '仅生成正文，不跑审核' },
  { id: 'audit', label: '审核', icon: ShieldCheck, desc: '33+ 维度质量审核', needsChapter: true },
  { id: 'revise', label: '修订', icon: RefreshCw, desc: '根据审核结果自动修订', needsChapter: true },
  { id: 'polish', label: '润色', icon: Sparkles, desc: '轻量语言润色', needsChapter: true },
]

const visibleMessages = computed(() =>
  agent.messages.value.filter((m) => m.role === 'user' || m.role === 'assistant'),
)

const canSend = computed(
  () =>
    panelMode.value === 'agent'
    && storyStore.connected
    && storyStore.currentBookId
    && instruction.value.trim()
    && !storyStore.busy,
)

const statusText = computed(() => {
  if (!props.folderOpen) return '未打开文件夹'
  if (!props.isBookProject) return props.isLibrary ? '书库 · 选择或新建书籍' : '待新建书籍'
  if (!storyStore.connected) return '后端离线'
  if (!storyStore.currentBookId) return '未识别书籍'
  const book = storyStore.currentBook?.title ?? storyStore.currentBookId
  return book
})

const busyLabel = computed(() =>
  storyStore.agentRunning ? '智能体思考中…' : '流水线执行中…',
)

const inputPlaceholder = computed(() => {
  if (!storyStore.connected) return '后端未连接'
  if (!storyStore.currentBookId) return '请先在左侧选择书籍…'
  if (panelMode.value === 'pipeline') return '可选：补充写作指导…'
  return 'Ask anything — 规划章节、续写、审核设定…'
})

async function handleSend() {
  if (!canSend.value) return
  const text = instruction.value.trim()
  instruction.value = ''
  resetTextareaHeight()
  error.value = ''
  try {
    await agent.sendInstruction(text)
    scrollToBottom()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '发送失败'
  }
}

async function runAction(action: PipelineAction) {
  if (!storyStore.connected || !storyStore.currentBookId || storyStore.busy) return
  error.value = ''
  try {
    const out = await agent.runPipeline(action, guidance.value.trim())
    if (action === 'write-next' && storyStore.currentBookId && out && typeof out === 'object' && 'content' in out) {
      const result = out as { chapterNumber: number; title: string; content: string }
      emit('chapterWritten', storyStore.currentBookId, result.chapterNumber, result.title, result.content)
    }
    if (typeof out === 'string') {
      agent.lastResult.value = out
    } else if (out && typeof out === 'object') {
      agent.lastResult.value = JSON.stringify(out, null, 2)
    }
    scrollToBottom()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

function useQuickPrompt(text: string) {
  instruction.value = text
  nextTick(() => {
    textareaRef.value?.focus()
    autoResizeTextarea()
  })
}

function onKeydown(e: KeyboardEvent) {
  if (panelMode.value !== 'agent') return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
}

function autoResizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function resetTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
}

function scrollToBottom() {
  nextTick(() => chatEndRef.value?.scrollIntoView({ behavior: 'smooth' }))
}

watch(() => agent.messages.value.length, scrollToBottom)
watch(() => agent.eventLogs.value.length, () => {
  if (storyStore.busy) showToolLog.value = true
  scrollToBottom()
})
watch(() => storyStore.busy, (busy) => {
  if (busy) showToolLog.value = true
})
</script>

<template>
  <div class="agent-panel ai-chat" @click="showBookMenu = false">
    <!-- Compact toolbar -->
    <div class="ai-toolbar">
      <div class="mode-segment">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: panelMode === 'agent' }"
          title="智能对话"
          @click="panelMode = 'agent'"
        >
          <MessageSquare :size="13" />
          <span>对话</span>
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: panelMode === 'pipeline' }"
          title="创作流水线"
          @click="panelMode = 'pipeline'"
        >
          <Wrench :size="13" />
          <span>创作</span>
        </button>
      </div>

      <div class="book-select-wrap" @click.stop>
        <button
          type="button"
          class="book-pill"
          :disabled="!storyStore.connected"
          @click="showBookMenu = !showBookMenu"
        >
          <BookOpen :size="12" />
          <span class="book-label">{{ statusText }}</span>
          <ChevronDown :size="11" class="book-chevron" />
        </button>
        <div v-if="showBookMenu && books.length > 0" class="book-menu">
          <button
            v-for="b in books"
            :key="b.id"
            type="button"
            class="book-option"
            :class="{ active: b.id === storyStore.currentBookId }"
            @click="storyStore.selectBook(b.id); showBookMenu = false"
          >
            <span class="book-option-title">{{ b.title }}</span>
            <span class="book-option-meta">{{ b.genre }}</span>
          </button>
        </div>
      </div>

      <span class="conn-dot" :class="{ ok: storyStore.connected }" :title="storyStore.connected ? '已连接' : '离线'" />
    </div>

    <!-- Thread -->
    <div class="ai-thread">
      <div v-if="agent.loadingSession.value" class="thread-hint">
        <Loader2 :size="14" class="spin" /> 加载历史…
      </div>

    <!-- Offline / setup hints -->
    <div v-if="!props.folderOpen" class="offline-banner">
      <p>请先在左侧打开或新建书籍文件夹</p>
    </div>

    <div v-else-if="!props.isBookProject" class="offline-banner">
      <p v-if="props.isLibrary">请从左侧书库打开一本书，或新建书籍</p>
      <p v-else>当前文件夹不是书籍项目</p>
      <p class="sub">
        <template v-if="props.isLibrary">新书将保存在 <code>books/</code> 目录下</template>
        <template v-else>新建书籍并选择保存位置，或打开含 <code>cinyuverse/book.json</code> 的文件夹</template>
      </p>
      <button class="retry-btn" @click="emit('createBook')">
        {{ props.isLibrary ? '在书库中新建书籍' : '新建书籍…' }}
      </button>
    </div>

    <div v-else-if="!storyStore.connected" class="offline-banner">
      <p>后端未连接（{{ storyStore.baseUrl }}）</p>
      <p class="sub">启动：<code>cd backend && go run cmd/server/main.go</code></p>
      <button class="retry-btn" @click="storyStore.ping()">重试</button>
    </div>

      <div v-else-if="visibleMessages.length === 0 && !storyStore.busy" class="empty-state">
        <div class="empty-icon"><Sparkles :size="22" /></div>
        <h3 class="empty-title">有什么可以帮你？</h3>
        <p class="empty-desc">
          {{ panelMode === 'agent'
            ? '用自然语言驱动写作：规划、续写、审核、读取设定'
            : '选择下方工具执行单步写作流水线' }}
        </p>
        <div v-if="panelMode === 'agent'" class="suggestions">
          <button
            v-for="q in agent.quickPrompts"
            :key="q.label"
            type="button"
            class="suggestion-chip"
            @click="useQuickPrompt(q.text)"
          >
            {{ q.label }}
          </button>
        </div>
      </div>

      <template v-else>
        <div
          v-for="(msg, i) in visibleMessages"
          :key="i"
          class="ai-msg"
          :class="msg.role === 'user' ? 'ai-msg--user' : 'ai-msg--assistant'"
        >
          <div v-if="msg.role === 'assistant'" class="ai-msg-avatar">
            <Sparkles :size="13" />
          </div>
          <div class="ai-msg-body">
            <MarkdownContent
              v-if="msg.role === 'assistant'"
              class="ai-msg-content"
              :content="msg.content"
            />
            <div v-else class="ai-msg-content ai-msg-content--user">{{ msg.content }}</div>
          </div>
        </div>
      </template>

      <!-- Tool activity (collapsible) -->
      <div v-if="agent.eventLogs.value.length > 0" class="tool-log">
        <button type="button" class="tool-log-toggle" @click="showToolLog = !showToolLog">
          <ChevronRight :size="12" class="tool-log-chevron" :class="{ open: showToolLog }" />
          <Loader2 v-if="storyStore.busy" :size="12" class="spin" />
          <span>{{ storyStore.busy ? busyLabel : '工具调用记录' }}</span>
          <span class="tool-log-count">{{ agent.eventLogs.value.length }}</span>
        </button>
        <div v-if="showToolLog" class="tool-log-body">
          <div v-for="(ev, i) in agent.eventLogs.value" :key="'ev-' + i" class="tool-log-line">
            <span class="ev-type">{{ ev.type }}</span>
            <span v-if="ev.agent" class="ev-agent">{{ ev.agent }}</span>
            <span class="ev-msg">{{ ev.message }}</span>
          </div>
        </div>
      </div>

      <div v-if="storyStore.busy && agent.eventLogs.value.length === 0" class="typing-indicator">
        <span class="typing-dot" />
        <span class="typing-dot" />
        <span class="typing-dot" />
      </div>

      <div v-if="error || storyStore.lastError" class="thread-error">
        {{ error || storyStore.lastError }}
      </div>
      <div ref="chatEndRef" />
    </div>

    <!-- Pipeline mode toolbar -->
    <div v-if="panelMode === 'pipeline' && storyStore.connected && storyStore.currentBookId && props.isBookProject" class="pipeline-bar">
      <input v-model="guidance" class="guidance-input" placeholder="写作指导（可选）" />
      <div class="pipeline-actions">
        <button
          v-for="act in pipelineActions"
          :key="act.id"
          class="pipeline-btn"
          :title="act.desc"
          :disabled="storyStore.busy || (act.needsChapter && !agent.latestChapterNum.value)"
          @click="runAction(act.id)"
        >
          <component :is="act.icon" :size="12" />
          {{ act.label }}
        </button>
      </div>
    </div>

    <!-- Agent input -->
    <div v-if="panelMode === 'agent' && props.isBookProject && storyStore.connected && storyStore.currentBookId" class="input-area">
      <textarea
        v-model="instruction"
        class="input-textarea"
        rows="2"
        placeholder="输入指令，如：帮我规划下一章、检查人设一致性…"
        :disabled="storyStore.busy"
        @keydown="onKeydown"
      />
      <div class="input-footer">
        <span class="hint-text">{{ sendShortcutLabel }} 发送 · 工具：写章/规划/审核/读设定</span>
        <div class="input-actions">
          <button
            v-if="agent.lastResult.value"
            class="insert-btn"
            @click="emit('insert', agent.lastResult.value)"
          >插入编辑器</button>
          <button class="send-btn" :disabled="!canSend" :title="sendShortcutLabel" @click="handleSend">
            <Loader2 v-if="storyStore.busy" :size="14" class="spin" />
            <ArrowUp v-else :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
}

/* ── Toolbar ── */
.ai-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  flex-shrink: 0;
}

.mode-segment {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-hover) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.mode-btn:hover {
  color: var(--text-sub);
}

.mode-btn.active {
  background: var(--bg-card);
  color: var(--text-main);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 12%, transparent);
}

.book-select-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.book-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.book-pill:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-main);
}

.book-pill:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.book-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-chevron {
  flex-shrink: 0;
  opacity: 0.6;
}

.book-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 200px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
  z-index: 30;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.book-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.book-option:hover {
  background: var(--bg-hover);
}

.book-option.active {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}

.book-option-title {
  font-weight: 500;
}

.book-option-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.conn-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--danger);
}

.conn-dot.ok {
  background: var(--success);
}

/* ── Thread ── */
.ai-thread {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 14px;
  min-height: 0;
  scroll-behavior: smooth;
}

.thread-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 12px 24px;
  gap: 8px;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  color: var(--accent);
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}

.empty-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
  max-width: 280px;
}

.empty-code {
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-sub);
  margin-top: 4px;
}

.empty-action {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}

.empty-action:hover {
  background: var(--bg-hover);
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 300px;
  margin-top: 12px;
}

.suggestion-chip {
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-card) 80%, transparent);
  color: var(--text-sub);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.suggestion-chip:hover {
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  color: var(--text-main);
  background: color-mix(in oklab, var(--accent) 6%, transparent);
}

/* ── Messages ── */
.ai-msg {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  animation: msg-in 0.2s ease;
}

@keyframes msg-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-msg--user {
  flex-direction: row-reverse;
}

.ai-msg-avatar {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: color-mix(in oklab, var(--accent) 15%, transparent);
  color: var(--accent);
  margin-top: 2px;
}

.ai-msg-body {
  flex: 1;
  min-width: 0;
}

.ai-msg--user .ai-msg-body {
  display: flex;
  justify-content: flex-end;
}

.ai-msg-content--user {
  display: inline-block;
  max-width: 92%;
  padding: 8px 12px;
  border-radius: 12px 12px 4px 12px;
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 22%, transparent);
  color: var(--text-main);
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 13px;
}

.ai-msg--assistant .ai-msg-content {
  padding-top: 2px;
}

.ai-msg-content :deep(.md-content) {
  font-size: 13px;
  line-height: 1.6;
}

/* ── Tool log ── */
.tool-log {
  margin: 8px 0 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  overflow: hidden;
}

.tool-log-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: color-mix(in srgb, var(--bg-hover) 50%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.tool-log-chevron {
  transition: transform 0.15s;
  flex-shrink: 0;
}

.tool-log-chevron.open {
  transform: rotate(90deg);
}

.tool-log-count {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 60%, transparent);
}

.tool-log-body {
  padding: 6px 10px 8px;
  max-height: 120px;
  overflow-y: auto;
}

.tool-log-line {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 0;
  font-family: ui-monospace, monospace;
  line-height: 1.45;
}

.ev-type { color: var(--accent); margin-right: 4px; }
.ev-agent { color: var(--warning); margin-right: 4px; }

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0 8px 34px;
}

.typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.15s; }
.typing-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes typing {
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

.thread-error {
  padding: 8px 10px;
  margin-top: 4px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--danger) 25%, transparent);
  color: var(--danger);
  font-size: 12px;
}

/* ── Pipeline strip ── */
.pipeline-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 12px 0;
  flex-shrink: 0;
}

.pipeline-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.pipeline-chip:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.pipeline-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Composer (Cursor-style) ── */
.ai-composer {
  flex-shrink: 0;
  padding: 10px 12px 12px;
}

.composer-box {
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-input) 70%, transparent);
  box-shadow: 0 1px 4px color-mix(in srgb, #000 8%, transparent);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.composer-box:focus-within {
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 12%, transparent);
}

.composer-input {
  display: block;
  width: 100%;
  padding: 10px 12px 4px;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  box-sizing: border-box;
  max-height: 160px;
  overflow-y: auto;
}

.composer-input:focus {
  outline: none;
}

.composer-input::placeholder {
  color: var(--text-muted);
}

.composer-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px 12px;
  gap: 8px;
}

.composer-hint {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.75;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.composer-insert {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

.composer-insert:hover {
  color: var(--accent);
  background: var(--bg-hover);
}

.composer-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.composer-send:hover:not(:disabled) {
  transform: scale(1.04);
}

.composer-send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
