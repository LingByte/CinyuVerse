/** 与 internal/handlers/chat.go 中 JSON 字段对齐 */

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

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CreateChatSessionBody {
  title?: string
  userId?: number
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

export interface ChatTurnResult {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  usage?: ChatUsage
}

export interface ChatCompletionBody {
  sessionId?: number
  userId?: number
  novelId?: number
  title?: string
  systemPrompt?: string
  provider?: string
  model?: string
  message: string
  temperature?: number
  maxTokens?: number
}

export interface ChatCompletionResult {
  session: ChatSession
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  usage?: ChatUsage
}

export interface PaginatedChatSessions {
  sessions: ChatSession[]
  total: number
  page: number
  size: number
}

/** GET /api/ai/sessions/:id/messages 返回体 */
export interface ChatMessagesPayload {
  messages: ChatMessage[]
}

/** POST /api/ai/chat/stream 与 POST /api/ai/sessions/:id/chat/stream 的 SSE data 行（JSON） */
export type ChatSseEvent =
  | { type: 'meta'; userMessage: ChatMessage; session?: ChatSession }
  | { type: 'delta'; text: string }
  | { type: 'done'; assistantMessage: ChatMessage; usage?: ChatUsage }
  | { type: 'error'; msg: string }
