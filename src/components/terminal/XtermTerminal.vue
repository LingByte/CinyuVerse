<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const props = defineProps<{
  cwd: string;
  active: boolean;
}>();

const hostRef = ref<HTMLDivElement | null>(null);

const termRef = ref<Terminal | null>(null);
const fitRef = ref<FitAddon | null>(null);
const roRef = ref<ResizeObserver | null>(null);
const sessionIdRef = ref('');
const unlistenRef = ref<null | (() => void)>(null);
const resizeTimerRef = ref<number | null>(null);
const lastSizeRef = ref<{ cols: number; rows: number } | null>(null);
const resizeCooldownUntilRef = ref(0);
const cooldownTimerRef = ref<number | null>(null);

function setupTerminal() {
  const host = hostRef.value;
  if (!host) return;

  try {
    host.innerHTML = '';
  } catch {
    // ignore
  }

  const term = new Terminal({
    fontSize: 13,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    cursorBlink: true,
    scrollback: 2000,
    convertEol: false,
    rows: 30,
    cols: 80,
    theme: {
      background: '#0b0f14',
      foreground: '#e5e7eb',
    },
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);

  try {
    fitAddon.fit();
  } catch {
    // ignore
  }

  termRef.value = term;
  fitRef.value = fitAddon;

  const scheduleResize = () => {
    if (resizeTimerRef.value) {
      window.clearTimeout(resizeTimerRef.value);
    }
    resizeTimerRef.value = window.setTimeout(() => {
      resizeTimerRef.value = null;

      if (Date.now() < resizeCooldownUntilRef.value) return;

      const currentTerm = termRef.value;
      const fit = fitRef.value;
      if (!currentTerm || !fit) return;
      try {
        fit.fit();
      } catch {
        return;
      }

      const cols = currentTerm.cols;
      const rows = currentTerm.rows;
      if (!cols || !rows) return;

      const last = lastSizeRef.value;
      if (last && last.cols === cols && last.rows === rows) return;
      lastSizeRef.value = { cols, rows };

      const sid = sessionIdRef.value;
      if (!sid) return;
      void import('@tauri-apps/api/tauri').then(({ invoke }) =>
        invoke('terminal_resize', { sessionId: sid, cols, rows }).catch(() => null),
      );
    }, 150);
  };

  const ro = new ResizeObserver(scheduleResize);
  ro.observe(host);
  roRef.value = ro;

  let disposed = false;

  void (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const currentTerm = termRef.value;
      const dims = {
        cols: currentTerm?.cols ? Number(currentTerm.cols) : 80,
        rows: currentTerm?.rows ? Number(currentTerm.rows) : 30,
      };
      const sid = (await invoke<string>('terminal_start', {
        cwd: props.cwd || undefined,
        cols: dims.cols,
        rows: dims.rows,
      })) as string;
      if (disposed) {
        await invoke('terminal_kill', { sessionId: sid }).catch(() => null);
        return;
      }
      sessionIdRef.value = sid;
      lastSizeRef.value = { cols: dims.cols, rows: dims.rows };

      resizeCooldownUntilRef.value = Date.now() + 1500;
      if (cooldownTimerRef.value) {
        window.clearTimeout(cooldownTimerRef.value);
      }
      cooldownTimerRef.value = window.setTimeout(() => {
        cooldownTimerRef.value = null;
        resizeCooldownUntilRef.value = 0;
        scheduleResize();
      }, 1550);

      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<any>('terminal-data', (event) => {
        const payload = event.payload as any;
        if (!payload) return;
        if (payload.sessionId !== sid) return;
        const data = typeof payload.data === 'string' ? payload.data : '';
        if (!data) return;
        term.write(data);
      });
      unlistenRef.value = unlisten;

      term.onData((data) => {
        void invoke('terminal_write', { sessionId: sid, data }).catch(() => null);
      });
    } catch {
      term.write('Failed to start terminal session.\r\n');
    }
  })();

  return () => {
    disposed = true;

    if (resizeTimerRef.value) {
      window.clearTimeout(resizeTimerRef.value);
      resizeTimerRef.value = null;
    }

    if (cooldownTimerRef.value) {
      window.clearTimeout(cooldownTimerRef.value);
      cooldownTimerRef.value = null;
    }
    resizeCooldownUntilRef.value = 0;
    lastSizeRef.value = null;

    try {
      ro.disconnect();
    } catch {
      // ignore
    }
    roRef.value = null;

    try {
      unlistenRef.value?.();
    } catch {
      // ignore
    }
    unlistenRef.value = null;

    const sid = sessionIdRef.value;
    sessionIdRef.value = '';
    if (sid) {
      void import('@tauri-apps/api/tauri').then(({ invoke }) =>
        invoke('terminal_kill', { sessionId: sid }).catch(() => null),
      );
    }

    try {
      term.dispose();
    } catch {
      // ignore
    }
    termRef.value = null;
    fitRef.value = null;

    try {
      host.innerHTML = '';
    } catch {
      // ignore
    }
  };
}

let cleanup: (() => void) | null = null;

onMounted(() => {
  cleanup = setupTerminal() ?? null;
});

onBeforeUnmount(() => {
  cleanup?.();
  cleanup = null;
});

watch(
  () => props.cwd,
  () => {
    cleanup?.();
    cleanup = setupTerminal() ?? null;
  },
);

watch(
  () => props.active,
  () => {
    // No-op: resizing is handled by ResizeObserver (debounced).
  },
);
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 min-h-0 border border-gray-200 rounded overflow-hidden">
      <div ref="hostRef" class="h-full w-full" />
    </div>
  </div>
</template>
