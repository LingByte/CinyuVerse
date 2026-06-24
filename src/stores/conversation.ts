import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import type { Conversation, ConversationMessage } from '@/types/conversation'

const getTauriErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || fallback
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message
    if (typeof anyErr.error === 'string' && anyErr.error.trim()) return anyErr.error
    try {
      return JSON.stringify(anyErr)
    } catch {
      return fallback
    }
  }
  return fallback
}

export const useConversationStore = defineStore('conversation', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let activeSendToken = 0
  let activeStreamUnlisten: (() => void) | null = null
  let activeStreamErrorUnlisten: (() => void) | null = null
  let activeStreamEndUnlisten: (() => void) | null = null

  const cancelCurrentSend = () => {
    activeSendToken += 1
    isLoading.value = false

    try {
      activeStreamUnlisten?.()
      activeStreamErrorUnlisten?.()
      activeStreamEndUnlisten?.()
    } catch {
      // ignore
    } finally {
      activeStreamUnlisten = null
      activeStreamErrorUnlisten = null
      activeStreamEndUnlisten = null
    }
  }

  const refreshConversations = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const conversationList = await invoke<Conversation[]>('conversation_list')
      conversations.value = conversationList.sort((a, b) => b.updated_at - a.updated_at)
    } catch (err) {
      console.error('刷新会话列表失败(原始错误):', err)
      const errorMessage = getTauriErrorMessage(err, '刷新会话列表失败')
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  const createConversation = async (title: string): Promise<string> => {
    isLoading.value = true
    error.value = null

    try {
      const conversationId = await invoke<string>('conversation_create', { title })
      await refreshConversations()
      return conversationId
    } catch (err) {
      console.error('创建会话失败(原始错误):', err)
      const errorMessage = getTauriErrorMessage(err, '创建会话失败')
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  const loadConversation = async (id: string): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const conversation = await invoke<Conversation>('conversation_get', { conversationId: id })
      currentConversation.value = conversation
    } catch (err) {
      console.error('加载会话失败(原始错误):', err)
      const errorMessage = getTauriErrorMessage(err, '加载会话失败')
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  const setCurrentConversation = (conversation: Conversation | null) => {
    currentConversation.value = conversation
  }

  const sendMessage = async (content: string, opts?: { displayContent?: string }): Promise<void> => {
    const token = ++activeSendToken
    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`

    let conversation = currentConversation.value
    if (!conversation) {
      const conversationId = await invoke<string>('conversation_create', { title: '新的对话' })
      conversation = await invoke<Conversation>('conversation_get', { conversationId })
      currentConversation.value = conversation
      await refreshConversations()
    }

    isLoading.value = true
    error.value = null

    try {
      const userMessage: ConversationMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: typeof opts?.displayContent === 'string' ? opts.displayContent : content,
        timestamp: Date.now() / 1000,
      }

      const assistantMessageId = (Date.now() + 1).toString()
      const assistantPlaceholder: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() / 1000,
      }

      const updatedConversation: Conversation = {
        ...conversation,
        messages: [...conversation.messages, userMessage, assistantPlaceholder],
        updated_at: Date.now() / 1000,
      }
      currentConversation.value = updatedConversation

      cancelCurrentSend()
      activeSendToken = token

      activeStreamUnlisten = await listen<Record<string, unknown>>('conversation-chat-chunk', (event) => {
        const payload = event.payload
        if (!payload || payload.request_id !== requestId) return
        if (token !== activeSendToken) return

        const piece = typeof payload.content === 'string' ? payload.content : String(payload.content ?? '')
        if (!piece) return

        const prev = currentConversation.value
        if (!prev || prev.id !== updatedConversation.id) return
        const idx = prev.messages.findIndex((m) => m.id === assistantMessageId)
        if (idx < 0) return
        const nextMsgs = prev.messages.slice()
        nextMsgs[idx] = { ...nextMsgs[idx], content: (nextMsgs[idx].content || '') + piece }
        currentConversation.value = { ...prev, messages: nextMsgs, updated_at: Date.now() / 1000 }
      })

      activeStreamErrorUnlisten = await listen<Record<string, unknown>>('conversation-chat-error', (event) => {
        const payload = event.payload
        if (!payload || payload.request_id !== requestId) return
        if (token !== activeSendToken) return
        const msg = typeof payload.error === 'string' ? payload.error : 'AI 流式输出失败'
        error.value = msg
      })

      activeStreamEndUnlisten = await listen<Record<string, unknown>>('conversation-chat-end', (event) => {
        const payload = event.payload
        if (!payload || payload.request_id !== requestId) return
        if (token !== activeSendToken) return
        isLoading.value = false
        void refreshConversations()
      })

      await invoke('conversation_send_message_stream', {
        conversationId: updatedConversation.id,
        content,
        requestId,
      })

      if (token !== activeSendToken) {
        return
      }

      return
    } catch (err) {
      console.error('发送消息失败(原始错误):', err)
      const errorMessage = getTauriErrorMessage(err, '发送消息失败')
      error.value = errorMessage

      if (token === activeSendToken && conversation) {
        await loadConversation(conversation.id)
      }

      try {
        const response = await invoke('conversation_send_message', {
          conversationId: currentConversation.value?.id,
          content,
        })

        if (token === activeSendToken && currentConversation.value) {
          const resp = response as {
            choices?: { message?: { content?: string } }[]
            usage?: { total_tokens?: number }
            model?: string
          }
          const assistantMessage: ConversationMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: resp.choices?.[0]?.message?.content || '抱歉，我无法回答这个问题。',
            timestamp: Date.now() / 1000,
            metadata: {
              tokens_used: resp.usage?.total_tokens,
              model: resp.model,
            },
          }

          const prev = currentConversation.value
          if (prev) {
            currentConversation.value = {
              ...prev,
              messages: [...prev.messages, assistantMessage],
              updated_at: Date.now() / 1000,
            }
          }
          await refreshConversations()
        }
      } catch (fallbackErr) {
        console.error('发送消息fallback失败(原始错误):', fallbackErr)
      }
      throw new Error(errorMessage)
    } finally {
      if (token === activeSendToken) {
        isLoading.value = false
      }
    }
  }

  const deleteConversation = async (id: string): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      await invoke('conversation_delete', { conversationId: id })
      conversations.value = conversations.value.filter((conv) => conv.id !== id)
      if (currentConversation.value?.id === id) {
        currentConversation.value = null
      }
    } catch (err) {
      console.error('删除会话失败(原始错误):', err)
      const errorMessage = getTauriErrorMessage(err, '删除会话失败')
      error.value = errorMessage
      throw new Error(errorMessage)
    } finally {
      isLoading.value = false
    }
  }

  void refreshConversations()

  return {
    conversations,
    currentConversation,
    isLoading,
    error,
    createConversation,
    loadConversation,
    sendMessage,
    cancelCurrentSend,
    deleteConversation,
    refreshConversations,
    setCurrentConversation,
  }
})

/** Alias matching the React `useConversation` hook API. */
export function useConversation() {
  return useConversationStore()
}
