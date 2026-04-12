import { del, get, post } from '@/utils/request'

export interface ChatSession {
  id: number
  title: string
  status: string
  userId: number
  novelId: number
  provider: string
  model: string
  systemPrompt?: string
  summary?: string
  lastMessageAt: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: number
  sessionId: number
  seq: number
  role: string
  content: string
  finishReason?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  createdAt: string
}

export interface CreateChatSessionBody {
  title?: string
  userId: number
  novelId?: number
  systemPrompt?: string
  provider?: string
  model?: string
}

export interface ChatTurnBody {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface PaginatedChatSessions {
  sessions: ChatSession[]
  total: number
  page: number
  size: number
}

export interface ListChatMessagesResponse {
  messages: ChatMessage[]
}

export interface ChatTurnResponse {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export const chatApi = {
  chatCompletion<T = unknown>(data: unknown) {
    return post<T>('/ai/chat', data)
  },

  createSession<T = ChatSession>(data: CreateChatSessionBody) {
    return post<T>('/ai/sessions', data)
  },

  listSessions<T = PaginatedChatSessions>(params: { userId?: number; novelId?: number; page?: number; size?: number }) {
    return get<T>('/ai/sessions', { params })
  },

  getSession<T = ChatSession>(id: string) {
    return get<T>(`/ai/sessions/${encodeURIComponent(id)}`)
  },

  deleteSession<T = unknown>(id: string) {
    return del<T>(`/ai/sessions/${encodeURIComponent(id)}`)
  },

  listMessages<T = ChatMessage[]>(sessionId: string) {
    return get<ListChatMessagesResponse>(`/ai/sessions/${encodeURIComponent(sessionId)}/messages`) as unknown as Promise<
      import('@/utils/request').ApiResponse<T>
    >
  },

  chatTurn<T = ChatTurnResponse>(sessionId: string, data: ChatTurnBody) {
    return post<T>(`/ai/sessions/${encodeURIComponent(sessionId)}/chat`, data)
  },
}

export default chatApi
