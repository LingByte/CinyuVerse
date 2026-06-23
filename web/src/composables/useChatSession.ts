import { ref, watch, type Ref } from 'vue'
import * as chatApi from '@/api/chat'
import type { ChatMessageItem, ChatSessionItem } from '@/api/chat'

const ACTIVE_SESSION_PREFIX = 'cinyuverse-active-session-'

function activeSessionKey(workspaceId: string) {
  return `${ACTIVE_SESSION_PREFIX}${workspaceId}`
}

export function useChatSession(workspaceId: Ref<string | null | undefined>, workspaceName: Ref<string>) {
  const sessionId = ref<number | null>(null)
  const sessionTitle = ref('')
  const messages = ref<ChatMessageItem[]>([])
  const sessions = ref<ChatSessionItem[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const error = ref('')

  function persistActiveSession(wsId: string, id: number | null) {
    if (id) {
      localStorage.setItem(activeSessionKey(wsId), JSON.stringify(id))
    } else {
      localStorage.removeItem(activeSessionKey(wsId))
    }
  }

  async function loadMessages(id: number) {
    messages.value = await chatApi.getChatMessages(id)
  }

  async function bindSession(session: ChatSessionItem) {
    sessionId.value = session.id
    sessionTitle.value = session.title || '新对话'
    const wsId = workspaceId.value
    if (wsId) persistActiveSession(wsId, session.id)
    await loadMessages(session.id)
  }

  async function restoreForWorkspace() {
    const wsId = workspaceId.value
    if (!wsId) {
      sessionId.value = null
      messages.value = []
      sessionTitle.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const stored = localStorage.getItem(activeSessionKey(wsId))
      if (stored) {
        const id = JSON.parse(stored) as number
        try {
          await loadMessages(id)
          sessionId.value = id
          return
        } catch {
          persistActiveSession(wsId, null)
        }
      }
      const { sessions: list } = await chatApi.listChatSessions({ workspaceId: wsId, size: 1 })
      if (list.length > 0) {
        await bindSession(list[0])
      } else {
        sessionId.value = null
        messages.value = []
        sessionTitle.value = ''
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '加载对话历史失败'
    } finally {
      loading.value = false
    }
  }

  async function ensureSession(): Promise<number> {
    if (sessionId.value) return sessionId.value
    const wsId = workspaceId.value
    if (!wsId) throw new Error('未打开工作区')
    const session = await chatApi.createChatSession({
      title: workspaceName.value ? `${workspaceName.value} 的对话` : '新对话',
      workspaceId: wsId,
    })
    await bindSession(session)
    return session.id
  }

  async function sendChatMessage(
    text: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ) {
    const wsId = workspaceId.value
    if (!wsId) throw new Error('未打开工作区')
    sending.value = true
    error.value = ''
    const optimisticUser: ChatMessageItem = {
      id: -Date.now(),
      sessionId: sessionId.value ?? 0,
      seq: messages.value.length + 1,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    messages.value.push(optimisticUser)
    try {
      const resp = await chatApi.chatCompletion({
        sessionId: sessionId.value ?? 0,
        workspaceId: wsId,
        title: workspaceName.value ? `${workspaceName.value} 的对话` : '新对话',
        message: text,
        model,
        temperature,
        maxTokens,
      })
      sessionId.value = resp.session.id
      sessionTitle.value = resp.session.title || sessionTitle.value
      persistActiveSession(wsId, resp.session.id)
      messages.value = messages.value.filter((m) => m.id !== optimisticUser.id)
      messages.value.push(resp.userMessage, resp.assistantMessage)
    } catch (e: unknown) {
      messages.value = messages.value.filter((m) => m.id !== optimisticUser.id)
      error.value = e instanceof Error ? e.message : '发送失败'
      throw e
    } finally {
      sending.value = false
    }
  }

  async function appendConversationPair(userText: string, assistantText: string) {
    const wsId = workspaceId.value
    if (!wsId || !assistantText.trim()) return
    try {
      const sid = await ensureSession()
      const all = await chatApi.appendChatMessages(sid, [
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantText.trim() },
      ])
      messages.value = all.filter((m) => m.role === 'user' || m.role === 'assistant')
      sessionTitle.value = sessionTitle.value || userText.slice(0, 40)
    } catch (e: unknown) {
      console.warn('[chatSession] append failed', e)
    }
  }

  async function createNewSession() {
    const wsId = workspaceId.value
    if (!wsId) return
    const session = await chatApi.createChatSession({
      title: '新对话',
      workspaceId: wsId,
    })
    await bindSession(session)
  }

  async function fetchSessionList() {
    const wsId = workspaceId.value
    if (!wsId) return
    const { sessions: list } = await chatApi.listChatSessions({ workspaceId: wsId, size: 30 })
    sessions.value = list
  }

  async function switchSession(id: number) {
    await loadMessages(id)
    sessionId.value = id
    const found = sessions.value.find((s) => s.id === id)
    sessionTitle.value = found?.title ?? '对话'
    const wsId = workspaceId.value
    if (wsId) persistActiveSession(wsId, id)
  }

  async function clearCurrentSession() {
    if (sessionId.value) {
      try {
        await chatApi.deleteChatSession(sessionId.value)
      } catch {
        // ignore
      }
    }
    const wsId = workspaceId.value
    if (wsId) persistActiveSession(wsId, null)
    sessionId.value = null
    messages.value = []
    sessionTitle.value = ''
  }

  watch(
    workspaceId,
    (id) => {
      if (id) restoreForWorkspace()
      else {
        sessionId.value = null
        messages.value = []
      }
    },
    { immediate: true },
  )

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
