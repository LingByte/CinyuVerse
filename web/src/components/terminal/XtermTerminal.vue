<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { ideApi } from '@/services/ideApi'

const props = defineProps<{
  cwd: string
  active: boolean
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const termRef = ref<Terminal | null>(null)
const fitRef = ref<FitAddon | null>(null)
const roRef = ref<ResizeObserver | null>(null)
const sessionIdRef = ref('')
const unlistenRef = ref<null | (() => void)>(null)
const resizeTimerRef = ref<number | null>(null)
const lastSizeRef = ref<{ cols: number; rows: number } | null>(null)

function setupTerminal() {
  const host = hostRef.value
  if (!host) return

  host.innerHTML = ''

  const term = new Terminal({
    fontSize: 13,
    fontFamily: 'ui-monospace, Consolas, monospace',
    cursorBlink: true,
    scrollback: 2000,
    theme: {
      background: '#0b0f14',
      foreground: '#e5e7eb',
    },
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(host)
  try { fitAddon.fit() } catch { /* ignore */ }

  termRef.value = term
  fitRef.value = fitAddon

  const scheduleResize = () => {
    if (resizeTimerRef.value) window.clearTimeout(resizeTimerRef.value)
    resizeTimerRef.value = window.setTimeout(() => {
      resizeTimerRef.value = null
      const currentTerm = termRef.value
      const fit = fitRef.value
      if (!currentTerm || !fit) return
      try { fit.fit() } catch { return }
      const cols = currentTerm.cols
      const rows = currentTerm.rows
      if (!cols || !rows) return
      const last = lastSizeRef.value
      if (last && last.cols === cols && last.rows === rows) return
      lastSizeRef.value = { cols, rows }
      const sid = sessionIdRef.value
      if (!sid) return
      void ideApi.terminalResize(sid, cols, rows).catch(() => null)
    }, 150)
  }

  const ro = new ResizeObserver(scheduleResize)
  ro.observe(host)
  roRef.value = ro

  let disposed = false

  void (async () => {
    try {
      const dims = { cols: term.cols || 80, rows: term.rows || 30 }
      const sid = await ideApi.terminalStart(props.cwd || undefined, dims.cols, dims.rows)
      if (disposed) {
        await ideApi.terminalKill(sid).catch(() => null)
        return
      }
      sessionIdRef.value = sid
      lastSizeRef.value = dims

      const { listen } = await import('@tauri-apps/api/event')
      const unlisten = await listen<{ sessionId?: string; data?: string }>('terminal-data', (event) => {
        const payload = event.payload
        if (!payload || payload.sessionId !== sid) return
        if (payload.data) term.write(payload.data)
      })
      unlistenRef.value = unlisten

      term.onData((data) => {
        void ideApi.terminalWrite(sid, data).catch(() => null)
      })
    } catch {
      term.write('终端启动失败\r\n')
    }
  })()

  return () => {
    disposed = true
    if (resizeTimerRef.value) window.clearTimeout(resizeTimerRef.value)
    try { ro.disconnect() } catch { /* ignore */ }
    roRef.value = null
    try { unlistenRef.value?.() } catch { /* ignore */ }
    unlistenRef.value = null
    const sid = sessionIdRef.value
    sessionIdRef.value = ''
    if (sid) void ideApi.terminalKill(sid).catch(() => null)
    try { term.dispose() } catch { /* ignore */ }
    termRef.value = null
    fitRef.value = null
    try { host.innerHTML = '' } catch { /* ignore */ }
  }
}

let cleanup: (() => void) | null = null

onMounted(() => { cleanup = setupTerminal() ?? null })
onBeforeUnmount(() => { cleanup?.(); cleanup = null })

watch(() => props.cwd, () => {
  cleanup?.()
  cleanup = setupTerminal() ?? null
})
</script>

<template>
  <div class="xterm-wrap">
    <div ref="hostRef" class="xterm-host" />
  </div>
</template>

<style scoped>
.xterm-wrap {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.xterm-host {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
