import request from '@/utils/request'
import type { ChatCompletionBody, ChatCompletionResult } from '@/types/chat'

/** POST /api/ai/chat — 统一对话（sessionId 为 0 或未传时自动建会话） */
export function postChatCompletion(body: ChatCompletionBody) {
  return request.post<ChatCompletionResult>('/ai/chat', body).then((res) => res.data)
}
