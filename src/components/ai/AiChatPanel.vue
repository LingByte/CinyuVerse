<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStoryAgent, type PipelineAction } from '@/features/story/composables/useStoryAgent'
import { useStoryStore } from '@/features/story/stores/storyStore'
import { parseStoryChapterPath } from '@/core/types/story'
import {
  Bot,
  BookOpen,
  Wifi,
  WifiOff,
  Loader2,
  ArrowUp,
  PenLine,
  ListChecks,
  FileEdit,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  ChevronDown,
} from 'lucide-vue-next'
import { isModKey, modEnterLabel } from '@/core/platform'
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
const guidance = ref('')
const error = ref('')
const panelMode = ref<'agent' | 'pipeline'>('agent')
const showBookMenu = ref(false)
const chatEndRef = ref<HTMLDivElement>()
const sendShortcutLabel = ref(modEnterLabel())

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
    storyStore.connected
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
  const ch = storyStore.chapters.length
  return `${book} · ${ch} 章`
})

async function handleSend() {
  if (!canSend.value) return
  const text = instruction.value.trim()
  instruction.value = ''
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
}

function onKeydown(e: KeyboardEvent) {
  if (isModKey(e) && e.key === 'Enter') {
    e.preventDefault()
    void handleSend()
  }
}

function scrollToBottom() {
  nextTick(() => chatEndRef.value?.scrollIntoView({ behavior: 'smooth' }))
}

watch(() => agent.messages.value.length, scrollToBottom)
watch(() => agent.eventLogs.value.length, scrollToBottom)
</script>

<template>
  <div class="agent-panel" @click="showBookMenu = false">
    <!-- Header -->
    <div class="agent-header">
      <div class="header-left">
        <Bot :size="16" class="header-icon" />
        <span class="header-title">故事智能体</span>
        <span class="conn-badge" :class="{ ok: storyStore.connected }">
          <Wifi v-if="storyStore.connected" :size="11" />
          <WifiOff v-else :size="11" />
        </span>
      </div>
      <div class="book-select-wrap" @click.stop>
        <button class="book-select" :disabled="!storyStore.connected" @click="showBookMenu = !showBookMenu">
          <BookOpen :size="12" />
          <span class="book-label">{{ statusText }}</span>
          <ChevronDown :size="10" />
        </button>
        <div v-if="showBookMenu && books.length > 0" class="book-menu">
          <button
            v-for="b in books"
            :key="b.id"
            class="book-option"
            :class="{ active: b.id === storyStore.currentBookId }"
            @click="storyStore.selectBook(b.id); showBookMenu = false"
          >
            {{ b.title }}
            <span class="book-option-meta">{{ b.genre }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Mode tabs -->
    <div class="mode-tabs">
      <button :class="{ active: panelMode === 'agent' }" @click="panelMode = 'agent'">
        <Bot :size="12" /> 智能对话
      </button>
      <button :class="{ active: panelMode === 'pipeline' }" @click="panelMode = 'pipeline'">
        <PenLine :size="12" /> 写作流水线
      </button>
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

    <!-- Messages / logs -->
    <div class="message-area">
      <div v-if="agent.loadingSession.value" class="hint">加载对话历史…</div>

      <div v-if="visibleMessages.length === 0 && !storyStore.busy" class="welcome">
        <h3>CinyuVerse 故事智能体</h3>
        <p v-if="panelMode === 'agent'">
          通过自然语言驱动写作工具：规划章节、续写、审核、读取设定文件等。
          模型由后端 <code>STORY_LLM_MODEL</code> 配置。
        </p>
        <p v-else>直接调用写作流水线 API，适合明确的单步操作。</p>
        <div v-if="panelMode === 'agent'" class="quick-prompts">
          <button
            v-for="q in agent.quickPrompts"
            :key="q.label"
            class="quick-btn"
            @click="useQuickPrompt(q.text)"
          >{{ q.label }}</button>
        </div>
      </div>

      <div
        v-for="(msg, i) in visibleMessages"
        :key="i"
        class="bubble"
        :class="msg.role === 'user' ? 'user' : 'assistant'"
      >
        <div class="bubble-role">{{ msg.role === 'user' ? '你' : '智能体' }}</div>
        <MarkdownContent
          v-if="msg.role === 'assistant'"
          class="bubble-content"
          :content="msg.content"
        />
        <div v-else class="bubble-content user-text">{{ msg.content }}</div>
      </div>

      <!-- Pipeline event log -->
      <div v-for="(ev, i) in agent.eventLogs.value" :key="'ev-' + i" class="event-line">
        <span class="ev-type">{{ ev.type }}</span>
        <span v-if="ev.agent" class="ev-agent">{{ ev.agent }}</span>
        <span class="ev-msg">{{ ev.message }}</span>
      </div>

      <div v-if="storyStore.busy" class="busy-line">
        <Loader2 :size="14" class="spin" />
        {{ storyStore.agentRunning ? '智能体思考中（可能调用多个工具）…' : '流水线执行中…' }}
      </div>

      <div v-if="error || storyStore.lastError" class="error-line">{{ error || storyStore.lastError }}</div>
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
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header-icon { color: var(--accent); flex-shrink: 0; }
.header-title { font-weight: 600; color: var(--text-main); font-size: 13px; }

.conn-badge {
  display: inline-flex;
  color: var(--danger);
}
.conn-badge.ok { color: var(--success); }

.book-select-wrap { position: relative; flex-shrink: 0; }

.book-select {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
  max-width: 160px;
}
.book-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}

.book-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}
.book-option:hover { background: var(--bg-hover); }
.book-option.active { background: color-mix(in oklab, var(--accent) 10%, transparent); }
.book-option-meta { font-size: 10px; color: var(--text-muted); }

.mode-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.mode-tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px;
  border: none;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
}
.mode-tabs button.active {
  color: var(--accent);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.offline-banner {
  padding: 12px;
  margin: 8px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  text-align: center;
  color: var(--text-sub);
}
.offline-banner .sub { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
.offline-banner code { font-size: 10px; background: var(--bg-input); padding: 1px 4px; border-radius: 3px; }
.retry-btn {
  margin-top: 8px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
}

.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  min-height: 0;
}

.welcome {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  margin-bottom: 10px;
}
.welcome h3 { margin: 0 0 8px; font-size: 14px; color: var(--text-main); }
.welcome p { margin: 0 0 8px; line-height: 1.5; color: var(--text-sub); font-size: 11px; }
.welcome code { font-size: 10px; background: var(--bg-input); padding: 1px 4px; border-radius: 3px; }

.quick-prompts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.quick-btn {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 10px;
}
.quick-btn:hover { border-color: var(--accent); color: var(--accent); }

.bubble {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  max-width: 95%;
}
.bubble.user {
  margin-left: auto;
  background: color-mix(in oklab, var(--accent) 15%, var(--bg-card));
  border: 1px solid color-mix(in oklab, var(--accent) 25%, transparent);
}
.bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.bubble-role { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; }
.bubble-content.user-text { white-space: pre-wrap; line-height: 1.55; color: var(--text-main); font-size: 12px; }
.bubble-content :deep(.md-content) { font-size: 12px; }

.event-line {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 0;
  font-family: ui-monospace, monospace;
}
.ev-type { color: var(--accent); margin-right: 4px; }
.ev-agent { color: var(--warning); margin-right: 4px; }

.busy-line, .error-line, .hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 11px;
}
.busy-line { color: var(--warning); }
.error-line { color: var(--danger); }
.hint { color: var(--text-muted); }

.pipeline-bar {
  padding: 8px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.guidance-input {
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 11px;
  box-sizing: border-box;
}
.pipeline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pipeline-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 10px;
}
.pipeline-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.pipeline-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.input-area {
  padding: 8px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.input-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  font-family: inherit;
  resize: none;
  box-sizing: border-box;
  min-height: 52px;
}
.input-textarea:focus { outline: none; border-color: var(--accent); }
.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  gap: 8px;
}
.hint-text { font-size: 10px; color: var(--text-muted); flex: 1; }
.input-actions { display: flex; gap: 6px; align-items: center; }
.insert-btn {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 10px;
}
.insert-btn:hover { border-color: var(--accent); color: var(--accent); }
.send-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
