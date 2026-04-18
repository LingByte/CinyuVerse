import type { ChatSseEvent } from '@/types/chat'

function parseSseDataLines(block: string): string[] {
  const out: string[] = []
  for (const line of block.split('\n')) {
    const t = line.trim()
    if (t.startsWith('data:')) {
      out.push(t.slice(5).trim())
    }
  }
  return out
}

/**
 * 读取 fetch 得到的 text/event-stream：按空行分帧，解析 `data: {...}` JSON。
 */
export async function consumeChatSse(
  response: Response,
  onEvent: (ev: ChatSseEvent) => void,
): Promise<void> {
  const body = response.body
  if (!body) {
    throw new Error('响应无 body')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buf += decoder.decode(value, { stream: true })
    for (;;) {
      const sep = buf.indexOf('\n\n')
      if (sep < 0) {
        break
      }
      const frame = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      for (const json of parseSseDataLines(frame)) {
        if (!json) {
          continue
        }
        const ev = JSON.parse(json) as ChatSseEvent
        onEvent(ev)
      }
    }
  }
}
