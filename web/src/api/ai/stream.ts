import type { ChatCompletionBody, ChatSseEvent, ChatTurnBody } from '@/types/chat'
import type { ApiEnvelope } from '@/types/api'
import { getApiBase } from '@/utils/apiBase'
import { consumeChatSse } from '@/utils/sse'

function joinUrl(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (base.endsWith('/') && p.startsWith('/')) {
    return base.slice(0, -1) + p
  }
  return base + p
}

async function throwReadableHttpError(res: Response): Promise<never> {
  const ct = res.headers.get('content-type') || ''
  let msg = res.statusText || `HTTP ${res.status}`
  try {
    const text = await res.text()
    if (ct.includes('application/json')) {
      const j = JSON.parse(text) as ApiEnvelope | { msg?: string; message?: string }
      if (typeof (j as ApiEnvelope).code === 'number' && 'msg' in j) {
        msg = (j as ApiEnvelope).msg || msg
      } else {
        msg = (j as { msg?: string }).msg || (j as { message?: string }).message || msg
      }
    } else if (text) {
      msg = text.slice(0, 500)
    }
  } catch {
    /* ignore */
  }
  throw new Error(msg)
}

export interface ChatStreamOptions {
  signal?: AbortSignal
  onEvent: (ev: ChatSseEvent) => void
}

/** POST /api/ai/chat/stream */
export async function postChatCompletionStream(body: ChatCompletionBody, opts: ChatStreamOptions): Promise<void> {
  const url = joinUrl(getApiBase(), '/ai/chat/stream')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    await throwReadableHttpError(res)
  }
  await consumeChatSse(res, opts.onEvent)
}

/** POST /api/ai/sessions/:id/chat/stream */
export async function postChatTurnStream(
  sessionId: number,
  body: ChatTurnBody,
  opts: ChatStreamOptions,
): Promise<void> {
  const url = joinUrl(getApiBase(), `/ai/sessions/${sessionId}/chat/stream`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    await throwReadableHttpError(res)
  }
  await consumeChatSse(res, opts.onEvent)
}
