<script setup lang="ts">
import Avatar from '@/components/Avatar.vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const emit = defineEmits<{
  (e: 'back'): void
}>()

type Role = 'user' | 'ai'

interface ChatMessage {
  id: string
  role: Role
  text: string
  loading?: boolean
  speaking?: boolean
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

const chatContainerRef = ref<HTMLDivElement | null>(null)
const inputValue = ref('')
const messages = ref<ChatMessage[]>([])
const isTyping = ref(false)

const canSend = ref(false)

const sidebarHidden = ref(false)

const conversations = ref<Conversation[]>([])
const activeConversationId = ref<string>('active')

const buildConversationTitle = (list: ChatMessage[]) => {
  const firstUser = list.find((m) => m.role === 'user' && m.text.trim())
  const raw = (firstUser?.text ?? '新对话').trim()
  return raw.length > 18 ? `${raw.slice(0, 18)}…` : raw
}

const loadSidebarState = () => {
  sidebarHidden.value = window.localStorage.getItem('sidebarHidden') === 'true'
}

const saveSidebarState = () => {
  window.localStorage.setItem('sidebarHidden', String(sidebarHidden.value))
}

const toggleHidden = () => {
  sidebarHidden.value = !sidebarHidden.value
  saveSidebarState()
}

const activeSpeakingId = ref<string | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  const el = chatContainerRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const startStreamingReply = async (fullText: string) => {
  isTyping.value = true
  const id = `ai-${Date.now()}`

  const aiMsg: ChatMessage = {
    id,
    role: 'ai',
    text: '',
    loading: true,
    speaking: false,
  }
  messages.value.push(aiMsg)
  await scrollToBottom()

  await new Promise((resolve) => setTimeout(resolve, 420))
  aiMsg.loading = false

  let index = 0
  const step = async () => {
    if (index >= fullText.length) {
      isTyping.value = false
      await scrollToBottom()
      return
    }

    aiMsg.text += fullText[index]
    index += 1
    await scrollToBottom()
    window.setTimeout(step, 18)
  }
  step()
}

const toggleSpeak = (msg: ChatMessage) => {
  if (msg.role !== 'ai' || msg.loading) return
  const next = activeSpeakingId.value === msg.id ? null : msg.id
  activeSpeakingId.value = next
  messages.value.forEach((m) => {
    m.speaking = m.role === 'ai' && !m.loading && m.id === next
  })
}

const copyMessage = async (msg: ChatMessage) => {
  try {
    await navigator.clipboard.writeText(msg.text)
  } catch {
    return
  }
}

const regenerateLast = async () => {
  if (isTyping.value) return
  await startStreamingReply('我已经准备好重新生成回答。下一步请你接入真实后端流式接口。')
}

const sendMessage = async (text: string) => {
  const content = (text ?? '').trim()
  if (!content) return
  if (isTyping.value) return

  messages.value.push({ id: `u-${Date.now()}`, role: 'user', text: content })
  inputValue.value = ''
  await scrollToBottom()

  const reply = `收到：${content}\n\n你可以继续补充需求，我会按你的项目风格（白色 + 紫色点缀）帮你完善 UI 和交互。`
  await startStreamingReply(reply)
}

const onNewChat = async () => {
  if (isTyping.value) return

  const snapshot = messages.value
    .filter((m) => !m.loading)
    .map((m) => ({ ...m }))

  if (snapshot.length) {
    const id = `c-${Date.now()}`
    conversations.value.unshift({
      id,
      title: buildConversationTitle(snapshot),
      messages: snapshot,
      createdAt: Date.now(),
    })
  }

  messages.value = []
  activeSpeakingId.value = null
  inputValue.value = ''
  activeConversationId.value = 'active'
  await scrollToBottom()
}

const openConversation = async (id: string) => {
  if (isTyping.value) return
  const conv = conversations.value.find((c) => c.id === id)
  if (!conv) return
  messages.value = conv.messages.map((m) => ({ ...m }))
  activeSpeakingId.value = null
  inputValue.value = ''
  activeConversationId.value = id
  await scrollToBottom()
}

const sidebarItems = [
  { label: '新对话', active: true },
]

const composerTools = [
  { key: 'quick', label: '快速' },
  { key: 'write', label: '帮我写作' },
  { key: 'ppt', label: 'PPT 生成' },
  { key: 'code', label: '编程' },
  { key: 'image', label: '图像生成' },
  { key: 'music', label: '音乐生成' },
  { key: 'more', label: '更多' },
]

const onToolClick = (key: string) => {
  void key
}

const clearHistory = async () => {
  messages.value = []
  conversations.value = []
  activeSpeakingId.value = null
  isTyping.value = false
  inputValue.value = ''
  activeConversationId.value = 'active'
  await scrollToBottom()
}

const quickPrompts = [
  '解释一下什么是链式思维？',
  '帮我把这段文字总结成要点',
  '给我一个学习计划（7 天）',
  '写一封礼貌的英文邮件',
  '把下面的代码重构一下',
  '帮我生成一个项目 README',
  '把这段内容改写得更口语化',
  '给我 5 个标题备选方案',
  '把它翻译成英文并润色',
]

watch(
  () => messages.value.length,
  async () => {
    await scrollToBottom()
  },
)

watch(
  inputValue,
  () => {
    canSend.value = !!inputValue.value.trim()
  },
  { immediate: true },
)

onMounted(async () => {
  loadSidebarState()
  await scrollToBottom()

  const onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      toggleHidden()
    }
  }

  window.addEventListener('keydown', onKeydown)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
})
</script>

<template>
  <main class="chat" :class="{ 'is-hidden': sidebarHidden }">
    <aside class="chat__sidebar" :aria-hidden="sidebarHidden" :class="{ 'is-hidden': sidebarHidden }">
      <div class="chat__sidebar-brand" aria-label="QinyuSpiritBook">
        <span class="chat__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="chat__brand-icon" aria-hidden="true">
            <path
              d="M6 4.5A2.5 2.5 0 0 1 8.5 2H18a2 2 0 0 1 2 2v15.5a1.5 1.5 0 0 1-2.3 1.26L14.5 19l-3.2 1.76A1.5 1.5 0 0 1 9 19.5V4.5A1.5 1.5 0 0 0 7.5 3H6v1.5z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span class="chat__brand-text">QinyuSpiritBook</span>
      </div>

      <div class="chat__sidebar-actions">
        <button
          v-for="item in sidebarItems"
          :key="item.label"
          type="button"
          class="chat__nav"
          :class="{ 'is-active': item.active }"
          @click="item.label === '新对话' ? onNewChat() : undefined"
        >
          <span class="chat__nav-dot" aria-hidden="true" />
          <span class="chat__nav-label">{{ item.label }}</span>
        </button>
      </div>

      <div class="chat__history">
        <div class="chat__history-head">
          <div class="chat__history-title">历史对话</div>
          <button type="button" class="chat__history-clear" @click="clearHistory">清空</button>
        </div>
        <button
          v-for="c in conversations"
          :key="c.id"
          type="button"
          class="chat__history-item"
          :class="{ 'is-active': activeConversationId === c.id }"
          @click="openConversation(c.id)"
        >
          {{ c.title }}
        </button>
      </div>

      <div class="chat__sidebar-footer">
        <button type="button" class="chat__profile-card" @click="emit('back')">
          <Avatar name="Doubao" size="34px" status="online" />
          <div class="chat__profile">
            <div class="chat__name">豆包</div>
            <div class="chat__status">在线</div>
          </div>
        </button>
      </div>
    </aside>

    <section class="chat__main">
      <header class="chat__topbar">
        <button
          type="button"
          class="chat__sidebar-toggle"
          :aria-label="sidebarHidden ? '显示侧边栏' : '收起侧边栏'"
          :aria-expanded="!sidebarHidden"
          @click="toggleHidden"
        >
          <svg viewBox="0 0 24 24" class="chat__sidebar-toggle-icon" aria-hidden="true">
            <path
              d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm6 0H6v14h4V5zm2 0v14h6V5h-6z"
              fill="currentColor"
            />
          </svg>
        </button>
        <div class="chat__topbar-title">新对话</div>
        <div class="chat__topbar-subtitle">开始一个 AI 对话</div>
      </header>

      <div class="chat__center">
        <div ref="chatContainerRef" class="chat-container">
          <template v-for="m in messages" :key="m.id">
            <div
              v-if="m.loading"
              class="message-box ai loading"
              role="status"
              aria-live="polite"
              aria-label="AI 正在输入"
            >
              <span class="thinking" aria-hidden="true" />
              <span class="dot" />
              <span class="dot" />
              <span class="dot" />
            </div>
            <div v-else class="message-box" :class="m.role">
              <div class="message-box__content">{{ m.text }}</div>
              <div v-if="m.role === 'ai'" class="ai-actions">
                <button type="button" class="ai-actions__btn" aria-label="复制" @click="copyMessage(m)">
                  <svg viewBox="0 0 24 24" class="ai-actions__icon" aria-hidden="true">
                    <path
                      d="M9 9h10v12H9V9zm-4 6H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1H7a2 2 0 0 0-2 2v10z"
                      fill="currentColor"
                    />
                  </svg>
                </button>

                <button type="button" class="ai-actions__btn" aria-label="重新生成" @click="regenerateLast()">
                  <svg viewBox="0 0 24 24" class="ai-actions__icon" aria-hidden="true">
                    <path
                      d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.66 3.54l-1.42 1.42A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7z"
                      fill="currentColor"
                    />
                  </svg>
                </button>

                <button type="button" class="ai-actions__btn" aria-label="朗读" @click="toggleSpeak(m)">
                  <svg viewBox="0 0 24 24" class="ai-actions__icon" aria-hidden="true">
                    <path
                      d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12zm0-8.5v2.06A8 8 0 0 1 20 12a8 8 0 0 1-3.5 6.44V20.5A10 10 0 0 0 22 12 10 10 0 0 0 16.5 3.5z"
                      fill="currentColor"
                    />
                  </svg>
                </button>

                <button type="button" class="ai-actions__btn" aria-label="点赞">
                  <svg viewBox="0 0 24 24" class="ai-actions__icon" aria-hidden="true">
                    <path
                      d="M9 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4v11zm2 0h6.31a2 2 0 0 0 1.98-1.7l1.38-9A2 2 0 0 0 18.7 8H14V5a3 3 0 0 0-3-3l-1 7v12z"
                      fill="currentColor"
                    />
                  </svg>
                </button>

                <div v-if="m.speaking" class="ai-wave" aria-label="语音朗读中">
                  <span class="ai-wave__bar" />
                  <span class="ai-wave__bar" />
                  <span class="ai-wave__bar" />
                  <span class="ai-wave__bar" />
                  <span class="ai-wave__bar" />
                </div>
              </div>
            </div>
          </template>

          <div v-if="messages.length === 0" class="chat__empty">
            <h2 class="chat__headline">有什么我能帮你的吗？</h2>
            <div class="chat__prompt-grid">
              <button
                v-for="p in quickPrompts"
                :key="p"
                type="button"
                class="chat__prompt"
                @click="sendMessage(p)"
              >
                {{ p }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer class="chat__composer">
        <div class="chat__composer-inner">
          <div class="chat__composer-body">
            <textarea
              v-model="inputValue"
              class="chat__input"
              rows="1"
              placeholder="发消息…"
              :disabled="isTyping"
              @keydown.enter.prevent="sendMessage(inputValue)"
            />

            <div class="chat__composer-footer">
              <button type="button" class="chat__attach" aria-label="附件">
                <svg viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                  <path
                    d="M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V7H9v7.5a3 3 0 0 0 6 0v-9a4.5 4.5 0 0 0-9 0v10a6 6 0 0 0 12 0v-9h-1.5z"
                    fill="currentColor"
                  />
                </svg>
              </button>

              <div class="chat__attach-divider" aria-hidden="true" />

              <div class="chat__tools" aria-label="工具栏">
                <template v-for="(t, idx) in composerTools" :key="t.key">
                  <button type="button" class="chat__tool" @click="onToolClick(t.key)">
                    <span class="chat__tool-icon" aria-hidden="true">
                      <svg v-if="t.key === 'quick'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor" />
                      </svg>
                      <svg v-else-if="t.key === 'write'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M3 21h3.75L17.81 9.94l-3.75-3.75L3 17.25V21zm18-11.5a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L21 9.5z" fill="currentColor" />
                      </svg>
                      <svg v-else-if="t.key === 'ppt'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M4 4h10a4 4 0 0 1 0 8H6v8H4V4zm2 2v4h8a2 2 0 0 0 0-4H6zm13 5h-2v9h-2v-9h-2V9h6v2z" fill="currentColor" />
                      </svg>
                      <svg v-else-if="t.key === 'code'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M8.7 16.3L4.4 12l4.3-4.3L7.3 6.3 1.6 12l5.7 5.7 1.4-1.4zm6.6 0l4.3-4.3-4.3-4.3 1.4-1.4 5.7 5.7-5.7 5.7-1.4-1.4zM10 19l2-14h2l-2 14h-2z" fill="currentColor" />
                      </svg>
                      <svg v-else-if="t.key === 'image'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 11.5 11 14l2.5-3 3.5 4.5H6l2.5-4z" fill="currentColor" />
                      </svg>
                      <svg v-else-if="t.key === 'music'" viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" fill="currentColor" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                        <path d="M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="currentColor" />
                      </svg>
                    </span>
                    <span class="chat__tool-label">{{ t.label }}</span>
                  </button>
                  <span v-if="idx < composerTools.length - 1" class="chat__tool-sep" aria-hidden="true">·</span>
                </template>
              </div>

              <button
                type="button"
                class="chat__mic"
                :aria-label="canSend ? '发送' : '语音'"
                :disabled="isTyping"
                @click="canSend ? sendMessage(inputValue) : undefined"
              >
                <svg v-if="canSend" viewBox="0 0 24 24" class="chat__mic-icon" aria-hidden="true">
                  <path d="M12 5l7 7h-4v7H9v-7H5l7-7z" fill="currentColor" />
                </svg>
                <svg v-else viewBox="0 0 24 24" class="chat__mic-icon" aria-hidden="true">
                  <path
                    d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.chat {
  min-height: 100vh;
  background: #ffffff;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  transition: grid-template-columns 260ms ease;
}

.chat.is-hidden {
  grid-template-columns: 0px minmax(0, 1fr);
}

.chat__sidebar {
  border-right: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  transition: width 260ms ease, transform 260ms ease;
  will-change: transform;
}


.chat.is-hidden .chat__sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 280px;
  height: 100vh;
  background: #ffffff;
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  border-right: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  box-shadow: 0 24px 60px -48px rgba(2, 6, 23, 0.35);
  z-index: 60;
}

.chat.is-hidden .chat__main {
  grid-column: 1 / -1;
}

.chat__nav-label,
.chat__profile,
.chat__history {
  transition: opacity 200ms ease, transform 200ms ease;
}


.chat__name {
  font-weight: 850;
  color: #0b1220;
}

.chat__status {
  font-size: 12px;
  color: var(--text-muted);
}

.chat__sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat__nav {
  width: 100%;
  border: 0;
  text-align: left;
  background: transparent;
  padding: 10px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.chat__nav:hover {
  background: color-mix(in oklab, var(--theme-soft) 55%, transparent);
}

.chat__nav.is-active {
  background: color-mix(in oklab, var(--theme-soft) 70%, transparent);
  color: #0b1220;
}

.chat__nav-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--theme) 80%, white);
}

.chat__history {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.chat__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 8px 10px;
}

.chat__history-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
  margin: 0;
}

.chat__history-clear {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 999px;
}

.chat__history-clear:hover {
  border-color: color-mix(in oklab, var(--theme) 35%, transparent);
  background: color-mix(in oklab, var(--theme-soft) 40%, transparent);
  color: #0b1220;
}

.chat__history-item {
  width: 100%;
  border: 0;
  text-align: left;
  background: transparent;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 56%, #ffffff);
  font-size: 14px;
}

.chat__history-item:hover {
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
}

.chat__sidebar-footer {
  margin-top: auto;
  padding-top: 10px;
}

.chat__profile-card {
  width: 100%;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.chat__profile-card:hover {
  border-color: color-mix(in oklab, var(--theme) 30%, transparent);
  box-shadow: 0 18px 40px -34px rgba(2, 6, 23, 0.25);
}

.chat__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat__topbar {
  height: 56px;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
}

.chat__sidebar-toggle {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  transition: background 160ms ease, color 160ms ease;
}

.chat.is-hidden .chat__sidebar-toggle {
  position: fixed;
  left: 12px;
  top: 12px;
  transform: none;
  z-index: 80;
}

.chat__sidebar-toggle:hover {
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
  color: #0b1220;
}

.chat__sidebar-toggle-icon {
  width: 18px;
  height: 18px;
}

.chat__topbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #0b1220;
}

.chat__topbar-subtitle {
  font-size: 11px;
  color: var(--text-muted);
}

.chat__sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 6px 10px;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  user-select: none;
}

.chat__brand-mark {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
}

.chat__brand-icon {
  width: 16px;
  height: 16px;
  color: color-mix(in oklab, var(--theme) 70%, #0b1220);
}

.chat__brand-text {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.chat__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 14px 18px 86px;
  min-width: 0;
  position: relative;
}

.chat.is-hidden .chat__center {
  padding-left: 18px;
  padding-right: 18px;
}

.chat__headline {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: #0b1220;
}

.chat-container {
  width: 100%;
  max-width: 900px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat__empty {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.message-box {
  max-width: min(720px, 92%);
  padding: 6px 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #0b1220;
  font-size: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0;
  transform: translateY(10px);
  animation: msgIn 0.3s forwards;
}

.message-box__content {
  width: 100%;
}

.message-box.user {
  align-self: flex-end;
  padding: 10px 12px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--theme-soft) 55%, #ffffff);
}

.message-box.ai {
  align-self: flex-start;
}

.message-box.loading {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  width: auto;
  min-width: 64px;
}

.message-box.loading .thinking {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid color-mix(in oklab, var(--border) 85%, transparent);
  border-top-color: color-mix(in oklab, var(--theme) 70%, white);
  animation: thinking-rotate 0.9s linear infinite;
  margin-right: 2px;
}

.message-box.loading .dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--text-muted) 55%, transparent);
  animation: dot 1s infinite;
}

.message-box.loading .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.message-box.loading .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes msgIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes dot {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

@keyframes thinking-rotate {
  to {
    transform: rotate(360deg);
  }
}

.ai-actions {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: color-mix(in oklab, #0b1220 48%, #ffffff);
}

.ai-actions__btn {
  border: 0;
  background: transparent;
  padding: 4px;
  border-radius: 10px;
  cursor: pointer;
  color: inherit;
}

.ai-actions__btn:hover {
  background: color-mix(in oklab, var(--surface-strong) 60%, transparent);
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
}

.ai-actions__icon {
  width: 16px;
  height: 16px;
}

.ai-wave {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 16px;
}

.ai-wave__bar {
  width: 3px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--theme) 75%, white);
  animation: ai-wave 0.9s ease-in-out infinite;
}

.ai-wave__bar:nth-child(2) {
  animation-delay: 0.12s;
}

.ai-wave__bar:nth-child(3) {
  animation-delay: 0.24s;
}

.ai-wave__bar:nth-child(4) {
  animation-delay: 0.36s;
}

.ai-wave__bar:nth-child(5) {
  animation-delay: 0.48s;
}

@keyframes ai-wave {
  0%,
  100% {
    transform: scaleY(0.55);
    opacity: 0.55;
  }
  50% {
    transform: scaleY(1.25);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-box {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .message-box.loading .thinking,
  .message-box.loading .dot,
  .ai-wave__bar {
    animation: none;
  }
}


.chat__prompt-grid {
  --cv-pill-h: 42px;
  --cv-row-gap: 14px;
  margin-top: 20px;
  width: 100%;
  max-width: 860px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--cv-row-gap) 14px;
  max-height: calc((var(--cv-pill-h) + var(--cv-row-gap)) * 3 - var(--cv-row-gap));
  overflow: hidden;
}

.chat__prompt {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  border-radius: 999px;
  height: var(--cv-pill-h);
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
}

.chat__prompt:hover {
  border-color: color-mix(in oklab, var(--theme) 35%, transparent);
  background: color-mix(in oklab, var(--theme-soft) 40%, transparent);
}

.chat__composer {
  position: sticky;
  bottom: 0;
  padding: 14px 18px 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1) 35%);
}

.chat__composer-inner {
  max-width: 840px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 20px;
  border: 1.5px solid rgba(96, 165, 250, 0.55);
  background: #ffffff;
  box-shadow: 0 24px 60px -48px rgba(2, 6, 23, 0.35);
}

.chat__composer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat__composer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-width: 0;
}

.chat__attach {
  border: 0;
  background: transparent;
  padding: 4px;
  border-radius: 12px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
}

.chat__attach:hover {
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
  color: #0b1220;
}

.chat__attach-divider {
  width: 1px;
  align-self: stretch;
  background: color-mix(in oklab, var(--border) 85%, transparent);
  margin: 0;
}

.chat__tools {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}

.chat__tool-sep {
  margin: 0 15px;
  color: color-mix(in oklab, var(--text-muted) 60%, transparent);
  user-select: none;
}

.chat__tool {
  border: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-radius: 10px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.chat__tool:hover {
  color: #0b1220;
}

.chat__tool-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat__tool-svg {
  width: 16px;
  height: 16px;
}

.chat__mic {
  margin-left: auto;
  border: 0;
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
  border-radius: 999px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
}

.chat__mic:hover {
  background: color-mix(in oklab, var(--surface-strong) 80%, transparent);
  color: #0b1220;
}

.chat__mic:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat__mic-icon {
  width: 18px;
  height: 18px;
}

.chat__input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #0b1220;
  resize: none;
  min-height: 28px;
  line-height: 1.6;
}

.chat__input::placeholder {
  font-size: 14px;
  color: color-mix(in oklab, var(--text-muted) 70%, transparent);
}

.chat__input:disabled {
  opacity: 0.7;
}

@media (max-width: 980px) {
  .chat__prompt-grid {
    max-width: 720px;
  }
}

@media (max-width: 760px) {
  .chat {
    grid-template-columns: 1fr;
  }

  .chat__sidebar {
    display: none;
  }

  .chat__prompt-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
