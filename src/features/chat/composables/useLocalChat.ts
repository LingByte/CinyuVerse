import { ref, watch, type Ref } from 'vue'
import type { ChatMessageItem, ChatSessionItem } from '@/core/types/workspace'
import { loadWorkspaceJson, saveWorkspaceJson } from '@/features/workspace/utils/localDataStore'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

interface StoredChatState {
  sessions: ChatSessionItem[]
  messagesBySession: Record<string, ChatMessageItem[]>
  activeSessionId: number | null
}

function emptyState(): StoredChatState {
  return { sessions: [], messagesBySession: {}, activeSessionId: null }
}

function loadState(workspaceId: string): StoredChatState {
  return loadWorkspaceJson(workspaceId, 'chat', emptyState())
}

function persistState(workspaceId: string, state: StoredChatState) {
  saveWorkspaceJson(workspaceId, 'chat', state)
}

export function useLocalChat(workspaceId: Ref<string | null | undefined>, workspaceName: Ref<string>) {
  const sessionId = ref<number | null>(null)
  const sessionTitle = ref('')
  const messages = ref<ChatMessageItem[]>([])
  const sessions = ref<ChatSessionItem[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const error = ref('')

  function restoreForWorkspace() {
    const wsId = workspaceId.value
    if (!wsId) {
      sessionId.value = null
      messages.value = []
      sessionTitle.value = ''
      sessions.value = []
      return
    }
    loading.value = true
    error.value = ''
    try {
      const state = loadState(wsId)
      sessions.value = state.sessions
      if (state.activeSessionId && state.messagesBySession[String(state.activeSessionId)]) {
        sessionId.value = state.activeSessionId
        messages.value = state.messagesBySession[String(state.activeSessionId)]
        sessionTitle.value = state.sessions.find((s) => s.id === state.activeSessionId)?.title ?? '对话'
      } else if (state.sessions.length > 0) {
        const first = state.sessions[0]
        sessionId.value = first.id
        messages.value = state.messagesBySession[String(first.id)] ?? []
        sessionTitle.value = first.title
      } else {
        sessionId.value = null
        messages.value = []
        sessionTitle.value = ''
      }
    } finally {
      loading.value = false
    }
  }

  function writeState(updater: (state: StoredChatState) => void) {
    const wsId = workspaceId.value
    if (!wsId) return
    const state = loadState(wsId)
    updater(state)
    persistState(wsId, state)
    sessions.value = state.sessions
  }

  function ensureSession(): number {
    if (sessionId.value) return sessionId.value
    const wsId = workspaceId.value
    if (!wsId) throw new Error('未打开工作区')
    const id = Date.now()
    const session: ChatSessionItem = {
      id,
      title: workspaceName.value ? `${workspaceName.value} 的对话` : '新对话',
      workspaceId: wsId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeState((state) => {
      state.sessions.unshift(session)
      state.messagesBySession[String(id)] = []
      state.activeSessionId = id
    })
    sessionId.value = id
    sessionTitle.value = session.title
    messages.value = []
    return id
  }

  async function sendChatMessage(
    text: string,
    model: string,
    temperature: number,
    maxTokens: number,
    systemPrompt?: string,
  ) {
    const wsId = workspaceId.value
    if (!wsId) throw new Error('未打开工作区')
    sending.value = true
    error.value = ''
    const sid = ensureSession()
    const userMsg: ChatMessageItem = {
      id: Date.now(),
      sessionId: sid,
      seq: messages.value.length + 1,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(userMsg)
    writeState((state) => {
      const key = String(sid)
      state.messagesBySession[key] = [...messages.value]
      state.activeSessionId = sid
    })

    try {
      if (!isDesktop()) {
        throw new Error('AI 对话需桌面端运行，并配置 .env 中的 AI 密钥')
      }

      const config = await desktopApi.aiGetConfig()
      if (!config) {
        throw new Error('AI 未配置：请在项目根目录 .env 设置 API Key，或重启应用')
      }

      const chatMessages: { role: string; content: string }[] = []
      if (systemPrompt?.trim()) {
        chatMessages.push({ role: 'system', content: systemPrompt.trim() })
      }
      for (const m of messages.value) {
        if (m.role === 'user' || m.role === 'assistant') {
          chatMessages.push({ role: m.role, content: m.content })
        }
      }

      const assistantText = await desktopApi.aiChatStream(
        {
          model: model || config.model,
          messages: chatMessages,
          temperature,
          maxTokens,
        },
        () => {},
      )

      const assistantMsg: ChatMessageItem = {
        id: Date.now() + 1,
        sessionId: sid,
        seq: messages.value.length + 1,
        role: 'assistant',
        content: assistantText.trim() || '（无回复）',
        createdAt: new Date().toISOString(),
      }
      messages.value.push(assistantMsg)
      writeState((state) => {
        state.messagesBySession[String(sid)] = [...messages.value]
      })
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '发送失败'
      throw e
    } finally {
      sending.value = false
    }
  }

  async function appendConversationPair(userText: string, assistantText: string) {
    const wsId = workspaceId.value
    if (!wsId || !assistantText.trim()) return
    const sid = ensureSession()
    const now = new Date().toISOString()
    const pair: ChatMessageItem[] = [
      {
        id: Date.now(),
        sessionId: sid,
        seq: messages.value.length + 1,
        role: 'user',
        content: userText,
        createdAt: now,
      },
      {
        id: Date.now() + 1,
        sessionId: sid,
        seq: messages.value.length + 2,
        role: 'assistant',
        content: assistantText.trim(),
        createdAt: now,
      },
    ]
    messages.value.push(...pair)
    sessionTitle.value = sessionTitle.value || userText.slice(0, 40)
    writeState((state) => {
      state.messagesBySession[String(sid)] = [...messages.value]
      state.activeSessionId = sid
      const session = state.sessions.find((s) => s.id === sid)
      if (session) session.title = sessionTitle.value
    })
  }

  async function createNewSession() {
    const wsId = workspaceId.value
    if (!wsId) return
    const id = Date.now()
    const session: ChatSessionItem = {
      id,
      title: '新对话',
      workspaceId: wsId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeState((state) => {
      state.sessions.unshift(session)
      state.messagesBySession[String(id)] = []
      state.activeSessionId = id
    })
    sessionId.value = id
    sessionTitle.value = session.title
    messages.value = []
  }

  async function fetchSessionList() {
    restoreForWorkspace()
  }

  async function switchSession(id: number) {
    const wsId = workspaceId.value
    if (!wsId) return
    const state = loadState(wsId)
    sessionId.value = id
    messages.value = state.messagesBySession[String(id)] ?? []
    sessionTitle.value = state.sessions.find((s) => s.id === id)?.title ?? '对话'
    writeState((s) => {
      s.activeSessionId = id
    })
  }

  async function clearCurrentSession() {
    if (!sessionId.value) {
      messages.value = []
      return
    }
    const sid = sessionId.value
    writeState((state) => {
      state.sessions = state.sessions.filter((s) => s.id !== sid)
      delete state.messagesBySession[String(sid)]
      state.activeSessionId = state.sessions[0]?.id ?? null
    })
    sessionId.value = null
    messages.value = []
    sessionTitle.value = ''
    restoreForWorkspace()
  }

  watch(workspaceId, () => restoreForWorkspace(), { immediate: true })

  return {
    sessionId,
    sessionTitle,
    messages,
    sessions,
    loading,
    sending,
    error,
    restoreForWorkspace,
    sendChatMessage,
    appendConversationPair,
    createNewSession,
    fetchSessionList,
    switchSession,
    clearCurrentSession,
  }
}
