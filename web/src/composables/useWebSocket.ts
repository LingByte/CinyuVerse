import { ref, onUnmounted } from 'vue'

type MessageHandler = (data: WsResponse) => void

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface WsRequest {
  type: 'chat' | 'create' | 'new_chapter' | 'stop'
  mode: string
  workspace_id: string
  volume_id: string
  chapter_id?: string
  select_text?: string
  instruction?: string
  temperature?: number
  max_tokens?: number
  model?: string
  history?: ChatHistoryMessage[]
}

export interface WsResponse {
  type: 'text' | 'done' | 'error' | 'log' | 'tool'
  data: string
  error?: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  toolCall?: { name: string; status: 'start' | 'done' | 'error' }
}

export function useWebSocket(url = 'ws://localhost:8080/api/ws/ai/stream') {
  const connected = ref(false)
  const streaming = ref(false)
  const streamText = ref('')
  const logMessages = ref<string[]>([])
  const toolCalls = ref<{ name: string; status: string; time: number }[]>([])
  const error = ref('')

  let ws: WebSocket | null = null
  let handlers: Set<MessageHandler> = new Set()

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    console.log('[WS] 正在连接:', url)
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[WS] 连接成功')
      connected.value = true
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsResponse = JSON.parse(event.data)
        console.log('[WS] 收到消息:', msg.type, msg.data?.slice(0, 50))
        handlers.forEach((h) => h(msg))

        switch (msg.type) {
          case 'text':
            streamText.value += msg.data
            break
          case 'done':
            streaming.value = false
            if (msg.data) {
              streamText.value = msg.data
            }
            break
          case 'error':
            streaming.value = false
            error.value = msg.error || 'Unknown error'
            break
          case 'tool':
            if (msg.toolCall) {
              toolCalls.value.push({
                name: msg.toolCall.name,
                status: msg.toolCall.status,
                time: Date.now(),
              })
            }
            break
          case 'log':
            logMessages.value.push(msg.data)
            break
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onerror = (e) => {
      console.error('[WS] 连接错误:', e)
      error.value = 'WebSocket 连接错误'
      connected.value = false
    }

    ws.onclose = (e) => {
      console.log('[WS] 连接关闭:', e.code, e.reason)
      connected.value = false
      streaming.value = false
    }
  }

  function disconnect() {
    ws?.close()
    ws = null
    connected.value = false
  }

  function send(req: WsRequest) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] 发送失败：未连接，readyState=', ws?.readyState)
      error.value = '未连接到服务器'
      return
    }
    console.log('[WS] 发送请求:', req.type, req.mode)
    streamText.value = ''
    error.value = ''
    logMessages.value = []
    toolCalls.value = []
    streaming.value = true
    ws.send(JSON.stringify(req))
  }

  function stop() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
    streaming.value = false
  }

  function onMessage(handler: MessageHandler) {
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    streaming,
    streamText,
    logMessages,
    toolCalls,
    error,
    connect,
    disconnect,
    send,
    stop,
    onMessage,
  }
}
