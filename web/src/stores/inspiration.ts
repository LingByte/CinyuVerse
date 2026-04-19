import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChatMessage, ChatSession, CreateChatSessionBody } from '@/types/chat'
import { createChatSession, deleteChatSession, listChatMessages, listChatSessions } from '@/api/ai/sessions'

export interface InspirationThread {
  /** 与后端会话 id 一致，用作路由 :sessionId */
  id: string
  title: string
  /** 用于排序，毫秒时间戳 */
  lastMessageAt: number
  /** 关联小说（灵感讨论后续发展） */
  novelId?: number
}

export interface UiChatMessage {
  localId: string
  serverId?: number
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

function newMessageId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function sessionKey(id: string | number) {
  return String(id)
}

export const useInspirationStore = defineStore('inspiration', () => {
  const threads = ref<InspirationThread[]>([])
  const messagesBySessionId = ref<Record<string, UiChatMessage[]>>({})
  const listLoading = ref(false)

  const sortedThreads = computed(() =>
    [...threads.value].sort((a, b) => b.lastMessageAt - a.lastMessageAt),
  )

  function getMessages(sessionIdStr: string): UiChatMessage[] {
    const k = sessionKey(sessionIdStr)
    if (!messagesBySessionId.value[k]) {
      messagesBySessionId.value[k] = []
    }
    return messagesBySessionId.value[k]
  }

  function mapSessionRow(s: ChatSession): InspirationThread {
    return {
      id: String(s.id),
      title: (s.title && s.title.trim()) || '新对话',
      lastMessageAt:
        s.lastMessageAt > 0
          ? s.lastMessageAt * 1000
          : new Date(s.updatedAt || s.createdAt).getTime() || Date.now(),
      novelId: s.novelId && s.novelId > 0 ? s.novelId : undefined,
    }
  }

  async function refreshSessions() {
    listLoading.value = true
    try {
      const { sessions } = await listChatSessions({ page: 1, size: 50 })
      threads.value = sessions.map(mapSessionRow)
    } finally {
      listLoading.value = false
    }
  }

  function touchSession(sessionIdStr: string) {
    const row = threads.value.find((t) => t.id === sessionIdStr)
    if (row) {
      row.lastMessageAt = Date.now()
    }
  }

  function applySessionMeta(session: ChatSession) {
    const id = String(session.id)
    const row = threads.value.find((t) => t.id === id)
    const nid = session.novelId && session.novelId > 0 ? session.novelId : undefined
    if (row) {
      if (session.title) {
        row.title = session.title
      }
      row.lastMessageAt =
        session.lastMessageAt > 0 ? session.lastMessageAt * 1000 : Date.now()
      row.novelId = nid
    } else {
      threads.value.unshift({
        id,
        title: (session.title && session.title.trim()) || '新对话',
        lastMessageAt:
          session.lastMessageAt > 0 ? session.lastMessageAt * 1000 : Date.now(),
        novelId: nid,
      })
    }
  }

  function removeSessionLocal(sessionIdStr: string) {
    threads.value = threads.value.filter((t) => t.id !== sessionIdStr)
    delete messagesBySessionId.value[sessionKey(sessionIdStr)]
  }

  async function loadThreadMessages(sessionIdStr: string) {
    const sid = Number(sessionIdStr)
    if (!Number.isFinite(sid)) {
      return
    }
    const items = await listChatMessages(sid)
    const ui: UiChatMessage[] = items
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        localId: `srv_${m.id}`,
        serverId: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        streaming: false,
      }))
    messagesBySessionId.value[sessionKey(sessionIdStr)] = ui
  }

  function appendUserMessage(sessionIdStr: string, content: string) {
    getMessages(sessionIdStr).push({
      localId: newMessageId(),
      role: 'user',
      content,
      streaming: false,
    })
    touchSession(sessionIdStr)
  }

  function appendAssistantPlaceholder(sessionIdStr: string) {
    getMessages(sessionIdStr).push({
      localId: newMessageId(),
      role: 'assistant',
      content: '',
      streaming: true,
    })
  }

  function appendDeltaToLastAssistant(sessionIdStr: string, delta: string) {
    const list = getMessages(sessionIdStr)
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i]!
      if (row.role === 'assistant' && row.streaming) {
        row.content += delta
        return
      }
    }
  }

  function patchLastUserFromServer(sessionIdStr: string, cm: ChatMessage) {
    const list = getMessages(sessionIdStr)
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i]!
      if (row.role === 'user') {
        row.serverId = cm.id
        row.localId = `srv_${cm.id}`
        return
      }
    }
  }

  function finishLastAssistant(sessionIdStr: string, cm: ChatMessage) {
    const list = getMessages(sessionIdStr)
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i]!
      if (row.role === 'assistant' && row.streaming) {
        row.content = cm.content
        row.serverId = cm.id
        row.streaming = false
        row.localId = `srv_${cm.id}`
        touchSession(sessionIdStr)
        return
      }
    }
  }

  function removeStreamingAssistant(sessionIdStr: string) {
    const list = getMessages(sessionIdStr)
    for (let i = list.length - 1; i >= 0; i--) {
      const row = list[i]!
      if (row.role === 'assistant' && row.streaming) {
        list.splice(i, 1)
        return
      }
    }
  }

  /** 新建后端会话并刷新侧栏（调用方负责导航）；novelId 可选，用于注入全书上下文 */
  async function createBackendSession(title = '新对话', novelId?: number) {
    const body: CreateChatSessionBody = { title }
    if (novelId && novelId > 0) {
      body.novelId = novelId
    }
    const s = await createChatSession(body)
    await refreshSessions()
    return s
  }

  async function removeBackendSession(sessionIdStr: string) {
    const sid = Number(sessionIdStr)
    await deleteChatSession(sid)
    removeSessionLocal(sessionIdStr)
    await refreshSessions()
  }

  return {
    threads,
    sortedThreads,
    messagesBySessionId,
    listLoading,
    getMessages,
    refreshSessions,
    loadThreadMessages,
    touchSession,
    applySessionMeta,
    removeSessionLocal,
    appendUserMessage,
    appendAssistantPlaceholder,
    appendDeltaToLastAssistant,
    patchLastUserFromServer,
    finishLastAssistant,
    removeStreamingAssistant,
    createBackendSession,
    removeBackendSession,
  }
})
