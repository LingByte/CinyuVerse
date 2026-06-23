import axios from 'axios'
import { getApiBaseURL } from '@/config/apiConfig'

const API_BASE = getApiBaseURL()

/** 本地单用户桌面端默认 userId */
export const DEFAULT_CHAT_USER_ID = 1

export interface ChatSessionItem {
  id: number
  title: string
  status: string
  userId: number
  novelId: number
  workspaceId?: string
  model: string
  lastMessageAt: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessageItem {
  id: number
  sessionId: number
  seq: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
}

interface ApiWrap<T> {
  code: number
  msg: string
  data: T
}

function unwrap<T>(res: { data: ApiWrap<T> }): T {
  if (res.data.code !== 0) {
    throw new Error(res.data.msg || '请求失败')
  }
  return res.data.data
}

export async function listChatSessions(opts: {
  workspaceId?: string
  userId?: number
  page?: number
  size?: number
}): Promise<{ sessions: ChatSessionItem[]; total: number }> {
  const params = new URLSearchParams()
  if (opts.workspaceId) params.set('workspaceId', opts.workspaceId)
  else if (opts.userId) params.set('userId', String(opts.userId))
  params.set('page', String(opts.page ?? 1))
  params.set('size', String(opts.size ?? 30))
  const res = await axios.get(`${API_BASE}/ai/sessions?${params}`)
  const data = unwrap<{ sessions: ChatSessionItem[]; total: number }>(res)
  return { sessions: data.sessions ?? [], total: data.total ?? 0 }
}

export async function createChatSession(body: {
  title?: string
  userId?: number
  workspaceId?: string
  model?: string
}): Promise<ChatSessionItem> {
  const res = await axios.post(`${API_BASE}/ai/sessions`, {
    userId: body.userId ?? DEFAULT_CHAT_USER_ID,
    title: body.title ?? '',
    workspaceId: body.workspaceId ?? '',
    model: body.model ?? '',
  })
  return unwrap<ChatSessionItem>(res)
}

export async function getChatMessages(sessionId: number): Promise<ChatMessageItem[]> {
  const res = await axios.get(`${API_BASE}/ai/sessions/${sessionId}/messages`)
  const data = unwrap<{ messages: ChatMessageItem[] }>(res)
  return data.messages ?? []
}

export async function deleteChatSession(sessionId: number): Promise<void> {
  await axios.delete(`${API_BASE}/ai/sessions/${sessionId}`)
}

export async function chatCompletion(body: {
  sessionId?: number
  userId?: number
  workspaceId?: string
  title?: string
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
}): Promise<{
  session: ChatSessionItem
  userMessage: ChatMessageItem
  assistantMessage: ChatMessageItem
}> {
  const res = await axios.post(`${API_BASE}/ai/chat`, {
    sessionId: body.sessionId ?? 0,
    userId: body.userId ?? DEFAULT_CHAT_USER_ID,
    workspaceId: body.workspaceId ?? '',
    title: body.title ?? '',
    message: body.message,
    model: body.model ?? '',
    temperature: body.temperature,
    maxTokens: body.maxTokens,
  })
  return unwrap(res)
}

export async function appendChatMessages(
  sessionId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<ChatMessageItem[]> {
  const res = await axios.post(`${API_BASE}/ai/sessions/${sessionId}/messages`, { messages })
  const data = unwrap<{ messages: ChatMessageItem[] }>(res)
  return data.messages ?? []
}
