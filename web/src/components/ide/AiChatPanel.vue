<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef } from 'vue'
import ThemeSettings from '@/components/ide/ThemeSettings.vue'
import { useChatSession } from '@/composables/useChatSession'

const showThemeModal = ref(false)

const props = defineProps<{
  connected: boolean
  streaming: boolean
  streamText: string
  logMessages: string[]
  toolCalls: { name: string; status: string; time: number }[]
  error: string
  chapterId: string
  workspaceId?: string | null
  workspaceName?: string
}>()

const emit = defineEmits<{
  generate: [opts: {
    type: 'chat' | 'create' | 'new_chapter'
    mode: string
    instruction: string
    temperature: number
    maxTokens: number
    model: string
    history: { role: 'user' | 'assistant'; content: string }[]
  }]
  stop: []
  insert: [text: string]
  clearHistory: []
}>()

// ── State ──────────────────────────────────────────────────
const instruction = ref('')
const mode = ref('chapter')
const temperature = ref(0.55)
const maxTokens = ref(4096)
const chatEndRef = ref<HTMLDivElement>()
const textareaRef = ref<HTMLTextAreaElement>()
const showSettings = ref(false)
const showModelMenu = ref(false)
const showContextMenu = ref(false)
const showMoreMenu = ref(false)

const agentMode = ref<'chat' | 'create'>('chat')
const lastCreateUserMsg = ref('')

const chatSession = useChatSession(
  toRef(props, 'workspaceId'),
  computed(() => props.workspaceName ?? '工作区'),
)

const contextSizes = [
  { value: -1, label: '∞', desc: '无限制' },
  { value: 2048, label: '2K' },
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 16384, label: '16K' },
  { value: 32768, label: '32K' },
]
const selectedContext = ref(contextSizes[0])

const models = [
  { id: 'qwen-plus', name: '通义 Plus' },
  { id: 'qwen-turbo', name: '通义 Turbo（快速）' },
  { id: 'qwen-max', name: '通义 Max' },
  { id: 'qwen-long', name: '通义 Long（长文本）' },
]
const selectedModel = ref(models[0])

const modes = [
  { value: 'chapter', label: '续写' },
  { value: 'select', label: '改写选中' },
  { value: 'rewrite', label: '改写' },
  { value: 'expand', label: '扩写' },
  { value: 'condense', label: '缩写' },
  { value: 'polish', label: '润色' },
]

const showWelcome = computed(() =>
  chatSession.messages.value.length === 0
  && !props.streamText
  && !props.streaming
  && !chatSession.sending.value
  && props.logMessages.length === 0
  && props.toolCalls.length === 0
)

const modeStatusText = computed(() => {
  const modeLabel = agentMode.value === 'chat' ? '对话模式・不读取文件' : '创作模式・自主创作'
  return `${modeLabel} | 记忆：${chatSession.messages.value.length} 条`
})

const displayError = computed(() => props.error || chatSession.error.value)
const showHistoryMenu = ref(false)

const canInsert = computed(() => !!props.streamText.trim() && !props.streaming)

// ── Methods ────────────────────────────────────────────────
async function handleGenerate() {
  if (props.streaming || chatSession.sending.value) return
  if (!instruction.value.trim()) return

  const userMsg = instruction.value.trim()
  instruction.value = ''
  autoResizeTextarea()

  if (agentMode.value === 'chat') {
    try {
      await chatSession.sendChatMessage(
        userMsg,
        selectedModel.value.id,
        temperature.value,
        maxTokens.value,
      )
      scrollToBottom()
    } catch {
      // error in chatSession.error
    }
    return
  }

  lastCreateUserMsg.value = userMsg
  emit('generate', {
    type: agentMode.value,
    mode: mode.value,
    instruction: userMsg,
    temperature: temperature.value,
    maxTokens: maxTokens.value,
    model: selectedModel.value.id,
    history: chatSession.messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })
}

watch(() => props.streaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming && props.streamText && agentMode.value === 'create') {
    chatSession.appendConversationPair(lastCreateUserMsg.value, props.streamText)
  }
})

function switchMode(m: 'chat' | 'create') {
  agentMode.value = m
}

function clearHistory() {
  chatSession.clearCurrentSession()
  emit('clearHistory')
}

async function openHistoryMenu() {
  showMoreMenu.value = false
  showHistoryMenu.value = !showHistoryMenu.value
  if (showHistoryMenu.value) {
    await chatSession.fetchSessionList()
  }
}

async function pickHistorySession(id: number) {
  await chatSession.switchSession(id)
  showHistoryMenu.value = false
  scrollToBottom()
}

async function onNewChat() {
  await chatSession.createNewSession()
  showHistoryMenu.value = false
  scrollToBottom()
}

function quickContinue() {
  if (props.streaming) return

  const instructionText = '请读取项目大纲和最新章节，自动判断是否需要新建章节或新卷，然后续写完整下一章。一次性写完，自主保存到文件。'

  lastCreateUserMsg.value = instructionText
  emit('generate', {
    type: 'create',
    mode: 'chapter',
    instruction: instructionText,
    temperature: temperature.value,
    maxTokens: maxTokens.value,
    model: selectedModel.value.id,
    history: chatSession.messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })

  instruction.value = ''
}

function handleInsert() {
  if (!props.streamText.trim()) return
  emit('insert', props.streamText)
}

function scrollToBottom() {
  nextTick(() => {
    chatEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function selectModel(m: typeof models[number]) {
  selectedModel.value = m
  showModelMenu.value = false
}

function selectContext(c: typeof contextSizes[number]) {
  selectedContext.value = c
  showContextMenu.value = false
}

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value
  showSettings.value = false
  showModelMenu.value = false
  showContextMenu.value = false
}

function openThemeSettings() {
  showMoreMenu.value = false
  showThemeModal.value = true
}

function closeDropdowns() {
  showModelMenu.value = false
  showContextMenu.value = false
  showMoreMenu.value = false
  showHistoryMenu.value = false
}

function autoResizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

watch(() => props.streamText, scrollToBottom)
watch(() => props.logMessages.length, scrollToBottom)
</script>

<template>
  <div class="chat-panel-wrap" @click="closeDropdowns">

    <!-- 1. Tab Header -->
    <div class="chat-tab-header">
      <div class="tab-item active">
        <span class="tab-label">{{ chatSession.sessionTitle.value || '新对话' }}</span>
        <button class="tab-close" title="关闭标签" @click="onNewChat">&times;</button>
      </div>
      <div class="tab-actions">
        <button class="tab-icon-btn" title="新建对话" @click="onNewChat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="tab-icon-btn" title="历史记录" @click.stop="openHistoryMenu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
        </button>
        <button class="tab-icon-btn" title="更多" @click.stop="toggleMoreMenu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
        <button class="tab-icon-btn" title="分屏">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
      </div>
    </div>

    <div v-if="showHistoryMenu" class="header-more-menu history-menu" @click.stop>
      <div v-if="chatSession.sessions.value.length === 0" class="history-empty">暂无历史会话</div>
      <button
        v-for="s in chatSession.sessions.value"
        :key="s.id"
        class="more-menu-item"
        :class="{ active: chatSession.sessionId.value === s.id }"
        @click="pickHistorySession(s.id)"
      >
        <span class="history-item-title">{{ s.title || '未命名对话' }}</span>
        <span class="history-item-time">{{ new Date(s.lastMessageAt * 1000).toLocaleDateString() }}</span>
      </button>
    </div>

    <div v-if="showMoreMenu" class="header-more-menu" @click.stop>
      <button class="more-menu-item" @click="openThemeSettings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        主题设置
      </button>
      <button class="more-menu-item" @click="showSettings = true; showMoreMenu = false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        AI 设置
      </button>
      <button class="more-menu-item" @click="clearHistory(); showMoreMenu = false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        清空对话记录
      </button>
    </div>

    <!-- 2. Mode Switch Bar -->
    <div class="mode-switch-bar">
      <div class="mode-switch-tabs">
        <button
          class="mode-tab"
          :class="{ active: agentMode === 'chat' }"
          @click="switchMode('chat')"
        >
          <svg class="mode-icon" width="13" height="13" viewBox="0 0 24 24" :fill="agentMode === 'chat' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span>对话</span>
        </button>
        <button
          class="mode-tab"
          :class="{ active: agentMode === 'create' }"
          @click="switchMode('create')"
        >
          <svg class="mode-icon" width="13" height="13" viewBox="0 0 24 24" :fill="agentMode === 'create' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
          <span>创作</span>
        </button>
      </div>
      <span class="mode-status-text">{{ modeStatusText }}</span>
      <button
        v-if="agentMode === 'create' && !streaming"
        class="quick-continue-btn"
        @click="quickContinue"
        title="AI 自动读取大纲并续写下一章"
      >续写下一章</button>
    </div>

    <!-- 3. Message Area -->
    <div class="chat-message-scroll">
      <div v-if="chatSession.loading.value" class="log-msg">正在加载对话历史…</div>

      <!-- Welcome bubble -->
      <div v-if="showWelcome" class="message-bubble welcome-bubble">
        <div class="bubble-mode-tag">
          {{ agentMode === 'chat' ? '对话模式' : '创作模式' }} ({{ selectedModel.id }})
        </div>
        <h3 class="welcome-title">欢迎来到 CinyuVerse 小说创作空间</h3>
        <p class="welcome-intro">我是你的 AI 创作助手，可以陪你讨论剧情、打磨设定、续写章节。</p>
        <ul class="welcome-list">
          <li>聊聊某个角色的动机和性格</li>
          <li>讨论大纲或下一章该怎么写</li>
          <li>整理世界观、人设等创作资料</li>
        </ul>
        <p class="welcome-feature">我可以帮你梳理人设、世界观，并在创作模式下自主读取项目文件续写正文。</p>
        <div class="welcome-tip-card">
          切换到「创作」模式后，AI 会读取当前工作区文件进行写作。
        </div>
      </div>

      <div
        v-for="msg in chatSession.messages.value"
        :key="msg.id"
        class="message-bubble"
        :class="msg.role === 'user' ? 'user-bubble' : 'ai-bubble'"
      >
        <div class="bubble-mode-tag">{{ msg.role === 'user' ? '你' : 'AI 回复' }}</div>
        <div class="stream-content">{{ msg.content }}</div>
      </div>

      <div v-if="toolCalls.length > 0" class="tool-progress-bar">
        <div
          v-for="(tc, i) in toolCalls"
          :key="'tool-' + i"
          class="tool-step"
          :class="tc.status"
        >
          <span class="tool-icon">{{ tc.status === 'done' ? 'OK' : tc.status === 'error' ? '!' : '*' }}</span>
          <span class="tool-name">{{ tc.name }}</span>
        </div>
      </div>

      <div
        v-for="(msg, i) in logMessages"
        :key="'log-' + i"
        class="log-msg"
      >{{ msg }}</div>

      <div v-if="agentMode === 'create'" class="mode-bar-inline">
        <button
          v-for="m in modes"
          :key="m.value"
          class="mode-chip"
          :class="{ active: mode === m.value }"
          @click="mode = m.value"
        >{{ m.label }}</button>
      </div>

      <div v-if="streamText" class="message-bubble ai-bubble streaming-bubble">
        <div class="bubble-mode-tag">AI 回复</div>
        <div class="stream-content">{{ streamText }}</div>
      </div>

      <div v-if="chatSession.sending.value" class="log-msg">AI 正在思考…</div>

      <div v-if="displayError" class="error-msg">{{ displayError }}</div>

      <div ref="chatEndRef"></div>
    </div>

    <!-- 4. Input Footer（Cursor 风格） -->
    <div class="chat-input-footer">
      <div class="cursor-input-box" :class="{ focused: instruction.length > 0 }">
        <div v-if="showSettings" class="settings-row">
          <label>温度：{{ temperature }}</label>
          <input v-model.number="temperature" type="range" min="0" max="2" step="0.1" />
          <label>最大生成长度：{{ maxTokens }}</label>
          <input v-model.number="maxTokens" type="range" min="512" max="16384" step="512" />
        </div>

        <textarea
          v-model="instruction"
          class="chat-textarea"
          :placeholder="agentMode === 'chat' ? '输入问题，讨论剧情…' : '描述创作要求，AI 自动读文件写正文…'"
          rows="1"
          @keydown.ctrl.enter="handleGenerate"
          @input="autoResizeTextarea"
          ref="textareaRef"
        ></textarea>

        <div class="input-toolbar">
          <div class="toolbar-left dropdown-wrap" @click.stop>
            <button
              class="toolbar-pill"
              title="上下文窗口"
              @click="showContextMenu = !showContextMenu; showModelMenu = false"
            >{{ selectedContext.label }}</button>
            <button
              class="toolbar-pill model-pill"
              @click="showModelMenu = !showModelMenu; showContextMenu = false"
            >
              <span class="model-name">{{ selectedModel.name }}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="showContextMenu" class="dropdown-menu">
              <button
                v-for="c in contextSizes"
                :key="c.value"
                class="dropdown-item"
                :class="{ active: selectedContext.value === c.value }"
                @click="selectContext(c)"
              >
                <span class="item-label">{{ c.label }}</span>
                <span v-if="c.desc" class="item-desc">{{ c.desc }}</span>
              </button>
            </div>
            <div v-if="showModelMenu" class="dropdown-menu">
              <button
                v-for="m in models"
                :key="m.id"
                class="dropdown-item"
                :class="{ active: selectedModel.id === m.id }"
                @click="selectModel(m)"
              >{{ m.name }}</button>
            </div>
          </div>

          <div class="toolbar-spacer"></div>

          <button
            v-if="canInsert"
            class="toolbar-pill insert-pill"
            @click="handleInsert"
          >插入正文</button>

          <button
            v-if="streaming"
            class="cursor-send-btn stop"
            @click="$emit('stop')"
            title="停止生成"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
          <button
            v-else
            class="cursor-send-btn"
            :class="{ active: instruction.trim() && !chatSession.sending.value }"
            :disabled="!instruction.trim() || chatSession.sending.value"
            @click="handleGenerate"
            title="发送 (Ctrl+Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
          </button>
        </div>
      </div>
    </div>

    <ThemeSettings :visible="showThemeModal" @close="showThemeModal = false" />
  </div>
</template>

<style scoped>
/* ── Chat panel：全部跟随全局主题变量 ── */
.chat-panel-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  position: relative;
  color: var(--chat-text-primary);
}

/* ── 1. Tab Header ── */
.chat-tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--bg-primary);
  flex-shrink: 0;
  min-height: 32px;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--chat-card-bg);
}

.tab-item:not(.active) .tab-label {
  opacity: 0.55;
}

.tab-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--chat-text-primary);
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--chat-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1;
  padding: 0;
  transition: color var(--chat-transition), background var(--chat-transition);
}
.tab-close:hover {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
  color: var(--danger);
}

.tab-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tab-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--chat-text-secondary);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  transition: background var(--chat-transition), color var(--chat-transition), transform 0.15s ease;
}
.tab-icon-btn:hover {
  background: var(--chat-hover-bg);
  color: var(--chat-text-primary);
}
.tab-icon-btn:active {
  transform: scale(0.92);
}

.header-more-menu {
  position: absolute;
  top: 34px;
  right: 8px;
  z-index: 300;
  background: var(--chat-card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  padding: 4px;
  min-width: 150px;
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--chat-text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  text-align: left;
  transition: background var(--chat-transition), color var(--chat-transition);
}
.more-menu-item:hover {
  background: var(--chat-hover-bg);
  color: var(--chat-text-primary);
}

/* ── 2. Mode Switch Bar（紧凑分段控件） ── */
.mode-switch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  flex-shrink: 0;
  min-width: 0;
}

.mode-switch-tabs {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 26px;
  padding: 2px;
  border-radius: 6px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  gap: 1px;
}

.mode-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--chat-text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.mode-tab span {
  white-space: nowrap;
  line-height: 1;
}

.mode-tab .mode-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.mode-tab.active {
  background: var(--chat-card-bg);
  color: var(--chat-text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.mode-tab.active .mode-icon {
  opacity: 1;
}

.mode-status-text {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-continue-btn {
  flex-shrink: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--chat-mode-create) 40%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--chat-mode-create);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.quick-continue-btn:hover {
  background: var(--accent-light);
}

/* ── 3. Message Area ── */
.chat-message-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.message-bubble {
  background: var(--chat-bubble-fill);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.bubble-mode-tag {
  font-size: 12px;
  color: var(--chat-text-hint);
  margin-bottom: 12px;
}

.welcome-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--chat-text-primary);
  margin: 0 0 12px;
  line-height: 1.5;
}

.welcome-intro {
  font-size: 13px;
  color: var(--chat-text-secondary);
  margin: 0 0 12px;
  line-height: 1.7;
}

.welcome-list {
  margin: 0 0 12px;
  padding-left: 1.2em;
  color: var(--chat-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.welcome-list li {
  margin-bottom: 6px;
}

.welcome-list li:last-child {
  margin-bottom: 0;
}

.welcome-feature {
  font-size: 13px;
  color: var(--chat-text-secondary);
  margin: 0 0 12px;
  line-height: 1.7;
}

.welcome-tip-card {
  font-size: 12px;
  color: var(--chat-text-secondary);
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 8%, var(--chat-bubble-fill));
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
}

.user-bubble {
  background: color-mix(in srgb, var(--accent) 12%, var(--chat-bubble-fill));
  margin-left: 12px;
}

.history-menu {
  top: 34px;
  right: 48px;
  max-height: 280px;
  overflow-y: auto;
}

.history-empty {
  padding: 10px 12px;
  font-size: 11px;
  color: var(--chat-text-hint);
}

.more-menu-item.active {
  background: var(--accent-light);
}

.history-item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-time {
  font-size: 10px;
  color: var(--chat-text-hint);
  margin-left: 8px;
  flex-shrink: 0;
}

.streaming-bubble {
  border: 1px dashed var(--border);
}

.stream-content {
  color: var(--chat-text-primary);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
}

.log-msg {
  color: var(--chat-text-hint);
  font-size: 12px;
  padding: 4px 0;
  margin-bottom: 8px;
}

.tool-progress-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.tool-step {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--bg-hover);
  color: var(--chat-text-secondary);
  transition: all var(--chat-transition);
}

.tool-step.done {
  background: var(--accent-light);
  color: var(--success);
}

.tool-step.error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.tool-name {
  font-weight: 500;
  font-size: 11px;
}

.mode-bar-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.mode-chip {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--chat-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--chat-transition);
}
.mode-chip:hover {
  color: var(--chat-text-primary);
  background: var(--chat-hover-bg);
}
.mode-chip.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--chat-text-primary);
}

.error-msg {
  color: var(--danger);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 12px;
}

/* ── 4. Input Footer（Cursor 风格） ── */
.chat-input-footer {
  flex-shrink: 0;
  padding: 8px 10px 10px;
  background: transparent;
}

.cursor-input-box {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cursor-input-box:focus-within,
.cursor-input-box.focused {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
}

.settings-row {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.settings-row label {
  display: block;
  font-size: 11px;
  color: var(--chat-text-hint);
  margin-bottom: 2px;
}

.settings-row input[type="range"] {
  width: 100%;
  margin-bottom: 8px;
  accent-color: var(--accent);
}

.chat-textarea {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--chat-text-primary);
  padding: 0;
  font-size: 13px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
  min-height: 22px;
  max-height: 120px;
  overflow-y: auto;
}

.chat-textarea::placeholder {
  color: var(--text-muted);
  opacity: 1;
  font-size: 13px;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  min-width: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 1;
  min-width: 0;
}

.toolbar-spacer {
  flex: 1;
  min-width: 4px;
}

.toolbar-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}

.toolbar-pill:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.model-pill .model-name {
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.insert-pill {
  color: var(--accent);
  font-weight: 500;
}

.cursor-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: default;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, transform 0.12s;
}

.cursor-send-btn.active {
  background: var(--text-main);
  color: var(--bg-primary);
  cursor: pointer;
}

.cursor-send-btn.active:hover {
  opacity: 0.88;
}

.cursor-send-btn.active:active {
  transform: scale(0.92);
}

.cursor-send-btn.stop {
  background: var(--danger);
  color: #fff;
  cursor: pointer;
  border-radius: 6px;
}

.dropdown-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dropdown-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 160px;
  background: var(--chat-card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  padding: 4px;
  z-index: 200;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--chat-text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  transition: background 0.12s;
}
.dropdown-item:hover {
  background: var(--chat-hover-bg);
}
.dropdown-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.item-desc {
  font-size: 10px;
  color: var(--chat-text-hint);
}
</style>
