import request from '@/utils/request'
import type {
  ChatMessagesPayload,
  ChatSession,
  ChatTurnBody,
  ChatTurnResult,
  CreateChatSessionBody,
  PaginatedChatSessions,
} from '@/types/chat'

export interface ListChatSessionsParams {
  userId?: number
  novelId?: number
  page?: number
  size?: number
}

/** POST /api/ai/sessions */
export function createChatSession(body: CreateChatSessionBody) {
  return request.post<ChatSession>('/ai/sessions', body).then((res) => res.data)
}

/** GET /api/ai/sessions */
export function listChatSessions(params: ListChatSessionsParams) {
  return request.get<PaginatedChatSessions>('/ai/sessions', { params }).then((res) => res.data)
}

/** GET /api/ai/sessions/:id */
export function getChatSession(id: number) {
  return request.get<ChatSession>(`/ai/sessions/${id}`).then((res) => res.data)
}

/** DELETE /api/ai/sessions/:id */
export function deleteChatSession(id: number) {
  return request.delete<{ id: number }>(`/ai/sessions/${id}`).then((res) => res.data)
}

/** GET /api/ai/sessions/:id/messages — 后端 data 为 { messages } */
export function listChatMessages(sessionId: number) {
  return request
    .get<ChatMessagesPayload>(`/ai/sessions/${sessionId}/messages`)
    .then((res) => res.data.messages)
}

/** POST /api/ai/sessions/:id/chat */
export function postChatTurn(sessionId: number, body: ChatTurnBody) {
  return request.post<ChatTurnResult>(`/ai/sessions/${sessionId}/chat`, body).then((res) => res.data)
}
