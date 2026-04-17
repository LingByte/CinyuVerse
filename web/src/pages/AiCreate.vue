<script setup lang="ts">
import chatApi, { type ChatSession, type ChatTurnResponse } from '@/api/chat'
import recognizeApi from '@/api/recognize'
import Avatar from '@/components/Avatar.vue'
import Button from '@/components/Button.vue'
import Empty from '@/components/base/Empty.vue'
import Input from '@/components/Input.vue'
import Modal from '@/components/feedback/Modal.vue'
import Select from '@/components/Select.vue'
import Textarea from '@/components/Textarea.vue'
import novelsApi, { type Novel } from '@/api/novels'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'goHotTemplate'): void
}>()

type Role = 'user' | 'ai'

interface ChatMessage {
  id: string
  role: Role
  text: string
  loading?: boolean
  speaking?: boolean
}

type SidebarFeatureKey = 'work' | 'outline' | 'characters' | 'ideas'
const featureModal = ref<SidebarFeatureKey | null>(null)

const workName = ref<string>(window.localStorage.getItem('aiCreate_workName') || '未选择作品')
const outlineText = ref<string>(window.localStorage.getItem('aiCreate_outlineText') || '')
const characterText = ref<string>(window.localStorage.getItem('aiCreate_characterText') || '')
const ideasText = ref<string>(window.localStorage.getItem('aiCreate_ideasText') || '')
const outlineTheme = ref<string>(window.localStorage.getItem('aiCreate_outlineTheme') || '')
const outlineHook = ref<string>(window.localStorage.getItem('aiCreate_outlineHook') || '')
const outlineTone = ref<string>(window.localStorage.getItem('aiCreate_outlineTone') || '热血成长')
const selectedNovelId = ref<string>(window.localStorage.getItem('aiCreate_selectedNovelId') || '')
const createdNovels = ref<Novel[]>([])
const characterName = ref<string>(window.localStorage.getItem('aiCreate_characterName') || '')
const characterIdentity = ref<string>(window.localStorage.getItem('aiCreate_characterIdentity') || '')
const characterGoal = ref<string>(window.localStorage.getItem('aiCreate_characterGoal') || '')
const characterWeakness = ref<string>(window.localStorage.getItem('aiCreate_characterWeakness') || '')
const ideaInput = ref<string>('')
const ideaLibrary = ref<string[]>(
  (() => {
    const raw = window.localStorage.getItem('aiCreate_ideaLibrary')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as string[]
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })(),
)

const chatContainerRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const attachedFileName = ref<string | null>(null)
const recognizeText = ref<string>('')
const isRecognizing = ref(false)
const inputValue = ref('')
const messages = ref<ChatMessage[]>([])
const isTyping = ref(false)
const activeRequestToken = ref<number>(0)
const activeAnimationTimer = ref<number | null>(null)
const activeAnimatingMsgId = ref<string | null>(null)

watch(workName, (v) => window.localStorage.setItem('aiCreate_workName', v))
watch(outlineText, (v) => window.localStorage.setItem('aiCreate_outlineText', v))
watch(characterText, (v) => window.localStorage.setItem('aiCreate_characterText', v))
watch(ideasText, (v) => window.localStorage.setItem('aiCreate_ideasText', v))
watch(outlineTheme, (v) => window.localStorage.setItem('aiCreate_outlineTheme', v))
watch(outlineHook, (v) => window.localStorage.setItem('aiCreate_outlineHook', v))
watch(outlineTone, (v) => window.localStorage.setItem('aiCreate_outlineTone', v))
watch(selectedNovelId, (v) => window.localStorage.setItem('aiCreate_selectedNovelId', v))
watch(characterName, (v) => window.localStorage.setItem('aiCreate_characterName', v))
watch(characterIdentity, (v) => window.localStorage.setItem('aiCreate_characterIdentity', v))
watch(characterGoal, (v) => window.localStorage.setItem('aiCreate_characterGoal', v))
watch(characterWeakness, (v) => window.localStorage.setItem('aiCreate_characterWeakness', v))
watch(
  ideaLibrary,
  (v) => window.localStorage.setItem('aiCreate_ideaLibrary', JSON.stringify(v)),
  { deep: true },
)

const closeFeature = () => {
  featureModal.value = null
}

const insertToInput = (text: string) => {
  if (!text.trim()) return
  inputValue.value = `${inputValue.value}${inputValue.value ? '\n\n' : ''}${text.trim()}`
}

const sendFeatureText = async (text: string) => {
  const t = text.trim()
  if (!t) return
  await sendMessage(t)
  closeFeature()
}

const fetchCreatedNovels = async () => {
  try {
    const res = await novelsApi.list({ page: 1, size: 100 })
    const data = res.data as { novels?: Novel[] }
    createdNovels.value = data.novels ?? []
  } catch {
    createdNovels.value = []
  }
}

const selectedNovel = computed(() =>
  createdNovels.value.find((n) => String(n.id) === selectedNovelId.value),
)

const novelOptions = computed(() => [
  { label: '不选择小说（手动输入）', value: '' },
  ...createdNovels.value.map((n) => ({ label: `#${n.id} ${n.title}`, value: String(n.id) })),
])

const generateOutlineDraft = () => {
  const fromNovel = selectedNovel.value
  const theme = outlineTheme.value.trim() || fromNovel?.theme?.trim() || '未命名主题'
  const hook = outlineHook.value.trim() || '主角在平静生活中遭遇突发危机'
  const genre = fromNovel?.genre?.trim() || '待定类型'
  const tags = fromNovel?.tags?.trim() || '待补充标签'
  const sourceTitle = fromNovel?.title?.trim() || workName.value || '当前作品'
  outlineText.value = `【故事线草案｜${outlineTone.value}】
项目：${sourceTitle}
类型：${genre}
标签：${tags}
1. 开端：围绕“${theme}”建立世界观与人物关系。
2. 引爆点：${hook}。
3. 推进：主角为达成阶段目标，连续面对三次升级阻碍。
4. 反转：关键盟友立场变化，主角被迫重构策略。
5. 高潮：主角在核心冲突中做出代价性选择。
6. 收束：主线阶段性完成，并埋下下一卷悬念。`
}

const buildCharacterCard = () => {
  const name = characterName.value.trim() || '未命名角色'
  const identity = characterIdentity.value.trim() || '身份待补充'
  const goal = characterGoal.value.trim() || '目标待补充'
  const weakness = characterWeakness.value.trim() || '弱点待补充'
  characterText.value = `【人物设定卡】
姓名：${name}
身份：${identity}
核心目标：${goal}
性格弱点：${weakness}
成长弧线：在关键事件中从“逃避”走向“承担”。`
}

const addIdea = () => {
  const value = ideaInput.value.trim()
  if (!value) return
  if (!ideaLibrary.value.includes(value)) {
    ideaLibrary.value.unshift(value)
  }
  ideaInput.value = ''
}

const removeIdea = (item: string) => {
  ideaLibrary.value = ideaLibrary.value.filter((x) => x !== item)
}

const useIdea = (item: string) => {
  ideasText.value = item
  insertToInput(item)
}

const stopReply = () => {
  if (!isTyping.value) return
  activeRequestToken.value += 1
  isTyping.value = false
  if (activeAnimationTimer.value != null) {
    window.clearTimeout(activeAnimationTimer.value)
    activeAnimationTimer.value = null
    activeAnimatingMsgId.value = null
  }
  const idx = messages.value.findIndex((m) => m.loading)
  if (idx >= 0) messages.value.splice(idx, 1)
}

const canSend = ref(false)

const sidebarHidden = ref(false)

const USER_ID = 1

const sessions = ref<ChatSession[]>([])
const activeSessionId = ref<number | null>(null)

const topbarTitle = computed(() => {
  if (!activeSessionId.value) return '新对话'
  const s = sessions.value.find((x) => x.id === activeSessionId.value)
  return (s?.title?.trim() || `会话 ${activeSessionId.value}`).slice(0, 24)
})

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

const appendAssistantMessage = async (text: string) => {
  const aiMsg: ChatMessage = {
    id: `ai-${Date.now()}`,
    role: 'ai',
    text,
    loading: false,
    speaking: false,
  }
  messages.value.push(aiMsg)
  await scrollToBottom()
}

const animateAssistantMessage = async (fullText: string, token: number) => {
  const aiMsg: ChatMessage = {
    id: `ai-${Date.now()}`,
    role: 'ai',
    text: '',
    loading: false,
    speaking: false,
  }
  messages.value.push(aiMsg)
  activeAnimatingMsgId.value = aiMsg.id
  await scrollToBottom()

  let index = 0
  const step = async () => {
    if (activeRequestToken.value !== token) {
      activeAnimationTimer.value = null
      activeAnimatingMsgId.value = null
      return
    }

    if (index >= fullText.length) {
      activeAnimationTimer.value = null
      activeAnimatingMsgId.value = null
      isTyping.value = false
      await scrollToBottom()
      return
    }

    aiMsg.text += fullText[index]
    index += 1
    await scrollToBottom()
    activeAnimationTimer.value = window.setTimeout(() => void step(), 14)
  }

  await step()
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
  await appendAssistantMessage('我已经准备好重新生成回答。')
}

const triggerFilePick = () => {
  fileInputRef.value?.click()
}

const onFilesPicked = async (e: Event) => {
  const input = e.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  try {
    attachedFileName.value = file.name
    isRecognizing.value = true
    const res = await recognizeApi.recognize(file)
    recognizeText.value = (res.data.text ?? '').trim()
  } finally {
    isRecognizing.value = false
    if (input) input.value = ''
  }
}

const clearAttachment = () => {
  attachedFileName.value = null
  recognizeText.value = ''
  isRecognizing.value = false
}

const attachmentLabel = computed(() => {
  if (!attachedFileName.value) return ''
  return isRecognizing.value ? `识别中：${attachedFileName.value}` : `已识别：${attachedFileName.value}`
})

const sendMessage = async (text: string) => {
  const content = (text ?? '').trim()
  if (!content) return
  if (isTyping.value) return

  if (!activeSessionId.value) {
    try {
      const res = await chatApi.createSession({ userId: USER_ID })
      activeSessionId.value = res.data.id
      sessions.value.unshift(res.data)
    } catch {
      return
    }
  }

  const composed = recognizeText.value
    ? `以下是用户上传附件解析出的文本内容：\n\n${recognizeText.value}\n\n用户问题：${content}`
    : content

  messages.value.push({ id: `u-${Date.now()}`, role: 'user', text: content })
  inputValue.value = ''
  await scrollToBottom()

  const loadingId = `ai-${Date.now()}`
  const loadingMsg: ChatMessage = { id: loadingId, role: 'ai', text: '', loading: true, speaking: false }
  messages.value.push(loadingMsg)
  await scrollToBottom()

  const myToken = activeRequestToken.value + 1
  activeRequestToken.value = myToken
  isTyping.value = true
  try {
    const res = await chatApi.chatTurn(String(activeSessionId.value), { message: composed })
    if (activeRequestToken.value !== myToken) return
    const data = res.data as ChatTurnResponse
    const assistantText = data.assistantMessage?.content ?? ''
    const idx = messages.value.findIndex((m) => m.id === loadingId)
    if (idx >= 0) {
      messages.value.splice(idx, 1)
    }
    await animateAssistantMessage(assistantText, myToken)
    const refreshed = await chatApi.listSessions({ userId: USER_ID, page: 1, size: 20 })
    sessions.value = refreshed.data.sessions
    clearAttachment()
  } catch {
    const idx = messages.value.findIndex((m) => m.id === loadingId)
    if (idx >= 0) {
      messages.value.splice(idx, 1)
    }
  } finally {
    if (activeRequestToken.value === myToken && activeAnimationTimer.value == null) {
      isTyping.value = false
    }
  }
}

const onNewChat = async () => {
  if (isTyping.value) return

  messages.value = []
  activeSpeakingId.value = null
  inputValue.value = ''
  activeSessionId.value = null
  clearAttachment()
  await scrollToBottom()
}

const openConversation = async (id: number) => {
  if (isTyping.value) return
  activeSessionId.value = id
  activeSpeakingId.value = null
  inputValue.value = ''
  clearAttachment()

  try {
    const res = await chatApi.listMessages(String(id))
    const list = (res.data as unknown as { messages?: Array<{ role: string; content: string }> }).messages ?? []
    messages.value = list.map((m, idx) => ({
      id: `m-${id}-${idx}`,
      role: m.role === 'assistant' ? 'ai' : 'user',
      text: m.content,
      loading: false,
      speaking: false,
    }))
    await scrollToBottom()
  } catch {
    return
  }
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
  sessions.value = []
  activeSpeakingId.value = null
  isTyping.value = false
  inputValue.value = ''
  activeSessionId.value = null
  clearAttachment()
  await scrollToBottom()
}

const quickPrompts = [
  { icon: '🧠', text: '解释一下什么是链式思维？' },
  { icon: '📝', text: '帮我把这段文字总结成要点' },
  { icon: '📅', text: '给我一个学习计划（7 天）' },
  { icon: '✉️', text: '写一封礼貌的英文邮件' },
  { icon: '🛠️', text: '把下面的代码重构一下' },
  { icon: '📄', text: '帮我生成一个项目 README' },
  { icon: '💬', text: '把这段内容改写得更口语化' },
  { icon: '✨', text: '给我 5 个标题备选方案' },
  { icon: '🌍', text: '把它翻译成英文并润色' },
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

const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    toggleHidden()
  }
}

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

onMounted(async () => {
  loadSidebarState()
  await scrollToBottom()
  await fetchCreatedNovels()

  try {
    const res = await chatApi.listSessions({ userId: USER_ID, page: 1, size: 20 })
    sessions.value = res.data.sessions
  } catch {
    sessions.value = []
  }

  window.addEventListener('keydown', onKeydown)
})
</script>

<template>
  <main class="chat" :class="{ 'is-hidden': sidebarHidden }">
    <button
      v-if="sidebarHidden"
      type="button"
      class="chat__floating-toggle"
      aria-label="显示侧边栏"
      @click="toggleHidden"
    >
      <svg viewBox="0 0 24 24" class="chat__sidebar-toggle-icon" aria-hidden="true">
        <path
          d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm6 0H6v14h4V5zm2 0v14h6V5h-6z"
          fill="currentColor"
        />
      </svg>
    </button>

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

      <div class="chat__sidebar-features" aria-label="写作功能">
        <div class="chat__sidebar-features-head">
          <div class="chat__sidebar-features-title">写作工具</div>
        </div>

        <button type="button" class="chat__feature" @click="emit('goHotTemplate')">
          <span class="chat__feature-text">创建小说</span>
        </button>
      </div>

      <div class="chat__history">
        <div class="chat__history-head">
          <div class="chat__history-title">历史对话</div>
          <button type="button" class="chat__history-clear" @click="clearHistory">清空</button>
        </div>
        <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="chat__history-item"
          :class="{ 'is-active': activeSessionId === s.id }"
          @click="openConversation(s.id)"
        >
          {{ s.title || `会话 ${s.id}` }}
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
          v-if="!sidebarHidden"
          type="button"
          class="chat__sidebar-toggle"
          aria-label="收起侧边栏"
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
        <div class="chat__topbar-title">{{ topbarTitle }}</div>
        <div class="chat__topbar-subtitle">开始一个 AI 对话</div>
      </header>

      <div class="chat__center" :class="{ 'has-messages': messages.length > 0, 'is-empty': messages.length === 0 }">
        <div
          ref="chatContainerRef"
          class="chat-container"
          :class="{ 'is-empty': messages.length === 0 }"
        >
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
            <Empty title="有什么我能帮你的吗？" description="试试下方快捷提示，或直接输入你的创作需求。" />
            <div class="chat__prompt-grid">
              <button
                v-for="p in quickPrompts"
                :key="p.text"
                type="button"
                class="chat__prompt"
                @click="sendMessage(p.text)"
              >
                <span class="chat__prompt-icon" aria-hidden="true">{{ p.icon }}</span>
                <span class="chat__prompt-text">{{ p.text }}</span>
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
              <button type="button" class="chat__attach" aria-label="附件" @click="triggerFilePick">
                <svg viewBox="0 0 24 24" class="chat__tool-svg" aria-hidden="true">
                  <path
                    d="M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V7H9v7.5a3 3 0 0 0 6 0v-9a4.5 4.5 0 0 0-9 0v10a6 6 0 0 0 12 0v-9h-1.5z"
                    fill="currentColor"
                  />
                </svg>
              </button>

              <input ref="fileInputRef" type="file" class="chat__file-input" @change="onFilesPicked" />

              <button
                v-if="attachedFileName"
                type="button"
                class="chat__attach-status"
                :aria-label="attachmentLabel"
                @click="clearAttachment"
              >
                {{ attachmentLabel }}
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
                :aria-label="isTyping ? '终止' : canSend ? '发送' : '语音'"
                @click="isTyping ? stopReply() : canSend ? sendMessage(inputValue) : undefined"
              >
                <svg v-if="isTyping" viewBox="0 0 24 24" class="chat__mic-icon" aria-hidden="true">
                  <path d="M6 6h12v12H6V6z" fill="currentColor" />
                </svg>
                <svg v-else-if="canSend" viewBox="0 0 24 24" class="chat__mic-icon" aria-hidden="true">
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

  <Modal :open="!!featureModal" :title="
    featureModal === 'work'
      ? '小说管理'
      : featureModal === 'outline'
        ? '故事线生成'
        : featureModal === 'characters'
          ? '人物设定'
          : '素材库、灵感'
  " @close="closeFeature">
    <div class="chat__modal-panel">
      <div class="chat__modal-head">
        <div class="chat__modal-title">
          {{
            featureModal === 'work'
              ? '小说管理'
              : featureModal === 'outline'
                ? '故事线生成'
                : featureModal === 'characters'
                  ? '人物设定'
                  : '素材库、灵感'
          }}
        </div>
        <button type="button" class="chat__modal-close" aria-label="关闭" @click="closeFeature">×</button>
      </div>

      <div class="chat__modal-body">
        <template v-if="featureModal === 'work'">
          <div class="chat__modal-field">
            <div class="chat__modal-label">当前作品</div>
            <Input v-model="workName" placeholder="输入作品名" />
          </div>
          <div class="chat__modal-actions">
            <Button variant="solid" size="sm" @click="closeFeature">完成</Button>
          </div>
        </template>

        <template v-else-if="featureModal === 'outline'">
          <div class="chat__modal-field">
            <div class="chat__modal-label">选择已创建小说</div>
            <Select v-model="selectedNovelId" :options="novelOptions" placeholder="从小说管理中选择一部小说" />
          </div>
          <div class="chat__modal-grid">
            <Input v-model="outlineTheme" placeholder="故事主题（例：废土复仇）" />
            <Input v-model="outlineHook" placeholder="开篇钩子（例：主角被通缉）" />
          </div>
          <div class="chat__modal-actions chat__modal-actions--start">
            <Button variant="soft" size="sm" @click="outlineTone = '热血成长'">热血成长</Button>
            <Button variant="soft" size="sm" @click="outlineTone = '悬疑反转'">悬疑反转</Button>
            <Button variant="soft" size="sm" @click="outlineTone = '群像史诗'">群像史诗</Button>
            <Button variant="outline" size="sm" @click="generateOutlineDraft">生成故事线草案</Button>
          </div>
          <Textarea v-model="outlineText" :rows="8" placeholder="粘贴或整理你的小说大纲…" />
          <div class="chat__modal-actions">
            <Button variant="outline" size="sm" @click="insertToInput(outlineText)">插入到输入框</Button>
            <Button variant="solid" size="sm" @click="sendFeatureText(outlineText)">发送给 AI</Button>
          </div>
        </template>

        <template v-else-if="featureModal === 'characters'">
          <div class="chat__modal-grid">
            <Input v-model="characterName" placeholder="角色姓名" />
            <Input v-model="characterIdentity" placeholder="身份（例：落魄皇子）" />
            <Input v-model="characterGoal" placeholder="核心目标" />
            <Input v-model="characterWeakness" placeholder="性格弱点" />
          </div>
          <div class="chat__modal-actions chat__modal-actions--start">
            <Button variant="outline" size="sm" @click="buildCharacterCard">一键生成人设卡</Button>
          </div>
          <Textarea v-model="characterText" :rows="8" placeholder="人物设定（姓名/性格/背景/关系）…" />
          <div class="chat__modal-actions">
            <Button variant="outline" size="sm" @click="insertToInput(characterText)">插入到输入框</Button>
            <Button variant="solid" size="sm" @click="sendFeatureText(characterText)">发送给 AI</Button>
          </div>
        </template>

        <template v-else>
          <div class="chat__modal-grid chat__modal-grid--ideas">
            <Input v-model="ideaInput" placeholder="记录一条灵感（场景/台词/反转）" />
            <Button variant="outline" size="sm" @click="addIdea">加入素材库</Button>
          </div>
          <div v-if="ideaLibrary.length" class="chat__idea-list">
            <button
              v-for="item in ideaLibrary"
              :key="item"
              type="button"
              class="chat__idea-item"
              @click="useIdea(item)"
            >
              <span class="chat__idea-text">{{ item }}</span>
              <span class="chat__idea-remove" @click.stop="removeIdea(item)">删除</span>
            </button>
          </div>
          <Textarea v-model="ideasText" :rows="8" placeholder="灵感碎片、场景片段、金句…" />
          <div class="chat__modal-actions">
            <Button variant="outline" size="sm" @click="insertToInput(ideasText)">插入到输入框</Button>
            <Button variant="solid" size="sm" @click="sendFeatureText(ideasText)">发送给 AI</Button>
          </div>
        </template>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
:global(html),
:global(body) {
  height: 100%;
  overflow: hidden;
}

.chat {
  min-height: 100vh;
  background: #ffffff;
  padding-left: 0px;
}

.chat__sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 280px;
  height: 100vh;
  border-right: 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  transition: width 260ms ease, transform 260ms ease;
  will-change: transform;
  background: #ffffff;
  z-index: 95;
  border-top-right-radius: 18px;
  border-bottom-right-radius: 18px;
  box-shadow: 12px 0 28px -24px rgba(2, 6, 23, 0.35);
}


.chat.is-hidden .chat__sidebar {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 24px 60px -48px rgba(2, 6, 23, 0.35);
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

.chat__sidebar-features {
  padding: 8px 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat__sidebar-features-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.chat__sidebar-features-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
}

.chat__sidebar-features-sub {
  font-size: 11px;
  color: color-mix(in oklab, #0b1220 42%, #ffffff);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat__feature {
  width: 100%;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
  text-align: left;
}

.chat__feature:hover {
  border-color: color-mix(in oklab, var(--theme) 30%, transparent);
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
}

.chat__feature-text {
  font-size: 13px;
  font-weight: 700;
}

.chat__modal {
  position: fixed;
  inset: 0;
  z-index: 160;
}

.chat__modal-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(2, 6, 23, 0.28);
}

.chat__modal-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, calc(100vw - 32px));
  background: #ffffff;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  border-radius: 16px;
  box-shadow: 0 30px 90px -60px rgba(2, 6, 23, 0.55);
  overflow: hidden;
}

.chat__modal-head {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
}

.chat__modal-title {
  font-size: 14px;
  font-weight: 850;
  color: #0b1220;
}

.chat__modal-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 60%, #ffffff);
}

.chat__modal-close:hover {
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
  color: #0b1220;
}

.chat__modal-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat__modal-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat__modal-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
}

.chat__modal-input {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
}

.chat__modal-textarea {
  width: 100%;
  min-height: 220px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
}

.chat__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.chat__modal-actions--start {
  justify-content: flex-start;
}

.chat__modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.chat__modal-grid--ideas {
  grid-template-columns: minmax(0, 1fr) auto;
}

.chat__idea-list {
  max-height: 180px;
  overflow: auto;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  border-radius: 12px;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.chat__idea-item {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}

.chat__idea-item:hover {
  border-color: color-mix(in oklab, var(--theme) 40%, transparent);
}

.chat__idea-text {
  font-size: 13px;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
}

.chat__idea-remove {
  font-size: 12px;
  color: #ef4444;
}

.chat__modal-btn {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 750;
  color: color-mix(in oklab, #0b1220 62%, #ffffff);
}

.chat__modal-btn:hover {
  border-color: color-mix(in oklab, var(--theme) 35%, transparent);
  background: color-mix(in oklab, var(--theme-soft) 40%, transparent);
  color: #0b1220;
}

.chat__modal-btn.is-primary {
  border-color: color-mix(in oklab, var(--theme) 35%, transparent);
  background: color-mix(in oklab, var(--theme-soft) 55%, transparent);
  color: #0b1220;
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
  justify-content: flex-start;
  margin-top: 20px;
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
  height: 100vh;
  overflow: hidden;
}

.chat__topbar {
  height: 56px;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  z-index: 90;
}

.chat__floating-toggle {
  position: fixed;
  left: 12px;
  top: 12px;
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
  z-index: 120;
}

.chat__floating-toggle:hover {
  background: color-mix(in oklab, var(--surface-strong) 65%, transparent);
  color: #0b1220;
}

.chat__sidebar-toggle {
  width: 34px;
  height: 34px;
  position: fixed;
  left: calc(280px + 12px);
  top: 12px;
  transform: none;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  transition: background 160ms ease, color 160ms ease;
  z-index: 110;
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
  padding: 14px 18px 170px;
  min-width: 0;
  position: relative;
  min-height: 0;
  width: 100%;
  overflow: auto;
}

.chat__center.is-empty {
  overflow: hidden;
}

.chat__center.has-messages {
  justify-content: flex-start;
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
  max-width: 840px;
  flex: 0 0 auto;
  min-height: auto;
  overflow: visible;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-container.is-empty {
  justify-content: center;
  min-height: calc(100vh - 180px);
  overflow: hidden;
}

.chat__empty {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 200px);
  width: 100%;
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
  margin-top: 24px;
  width: 100%;
  max-width: 860px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 16px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

.chat__prompt {
  background: #f5f5f5;
  border-radius: 20px;
  padding: 10px 18px;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #0b1220;
  font-size: 16px;
  font-weight: 500;
  white-space: nowrap;
}

.chat__prompt:hover {
  background: #efefef;
}

.chat__prompt-icon {
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
}

.chat__prompt-text {
  display: inline-block;
}

.chat__composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 18px 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1) 35%);
  z-index: 80;
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

.chat__file-input {
  display: none;
}

.chat__attach-status {
  border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  font-size: 12px;
  font-weight: 650;
  color: color-mix(in oklab, #0b1220 58%, #ffffff);
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat__attach-status:hover {
  border-color: color-mix(in oklab, var(--theme) 35%, transparent);
  background: color-mix(in oklab, var(--theme-soft) 40%, transparent);
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
