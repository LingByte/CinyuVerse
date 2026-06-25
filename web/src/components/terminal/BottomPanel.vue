<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { Plus, X } from 'lucide-vue-next'

const XtermTerminal = defineAsyncComponent(() => import('@/components/terminal/XtermTerminal.vue'))

export type PanelTab = 'problems' | 'output' | 'terminal'

const props = defineProps<{
  open: boolean
  activeTab: PanelTab
  height: number
  rootPath: string
  outputText: string
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  activeTabChange: [tab: PanelTab]
  heightChange: [height: number]
  clearOutput: []
}>()

type TerminalEntry = { id: string; cwd: string; title: string }

const terminals = ref<TerminalEntry[]>([])
const activeTerminalId = ref('')
const didBootstrap = ref(false)
const isDragging = ref(false)

watch(
  () => [props.open, props.rootPath, terminals.value.length] as const,
  () => {
    if (!props.open || terminals.value.length || didBootstrap.value) return
    didBootstrap.value = true
    const id = `t_${Date.now()}`
    terminals.value = [{ id, cwd: props.rootPath, title: '1' }]
    activeTerminalId.value = id
  },
  { immediate: true },
)

watch(() => props.open, (open) => { if (!open) didBootstrap.value = false })

function addTerminal() {
  const id = `t_${Date.now()}`
  terminals.value = [...terminals.value, { id, cwd: props.rootPath, title: String(terminals.value.length + 1) }]
  activeTerminalId.value = id
  if (!props.open) emit('openChange', true)
  emit('activeTabChange', 'terminal')
}

function closeActiveTerminal() {
  if (terminals.value.length <= 1) return
  const next = terminals.value.filter((t) => t.id !== activeTerminalId.value)
  activeTerminalId.value = next[0]?.id ?? ''
  terminals.value = next
}

function onMouseDownDrag(e: MouseEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startH = props.height
  isDragging.value = true
  const onMove = (ev: MouseEvent) => {
    const maxH = Math.floor(window.innerHeight * 0.7)
    emit('heightChange', Math.max(120, Math.min(maxH, startH + (startY - ev.clientY))))
  }
  const stop = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', stop)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', stop)
}

const tabs: { id: PanelTab; label: string }[] = [
  { id: 'problems', label: '问题' },
  { id: 'output', label: '输出' },
  { id: 'terminal', label: '终端' },
]

const activeTerminal = computed(
  () => terminals.value.find((t) => t.id === activeTerminalId.value) ?? terminals.value[0],
)
</script>

<template>
  <div v-if="open" class="bottom-panel" :style="{ height: height + 'px' }">
    <div class="resize-handle" @mousedown="onMouseDownDrag" />

    <div class="panel-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="emit('activeTabChange', tab.id)"
      >
        {{ tab.label }}
      </button>
      <div class="tab-spacer" />
      <button type="button" class="tab-close" @click="emit('openChange', false)">关闭</button>
    </div>

    <div v-show="activeTab === 'problems'" class="panel-content muted">暂无问题</div>

    <div v-show="activeTab === 'output'" class="panel-content output-pane">
      <div class="output-toolbar">
        <span>输出</span>
        <button type="button" class="link-btn" @click="emit('clearOutput')">清空</button>
      </div>
      <pre v-if="outputText.trim()" class="output-text">{{ outputText }}</pre>
      <div v-else class="muted">无输出</div>
    </div>

    <div v-show="activeTab === 'terminal'" class="panel-content terminal-pane">
      <div class="terminal-tabs">
        <button
          v-for="t in terminals"
          :key="t.id"
          type="button"
          class="term-tab"
          :class="{ active: t.id === activeTerminalId }"
          @click="activeTerminalId = t.id"
        >
          {{ t.title }}
        </button>
        <button type="button" class="icon-btn" title="新建终端" @click="addTerminal"><Plus :size="14" /></button>
        <button
          v-if="terminals.length > 1"
          type="button"
          class="icon-btn"
          title="关闭终端"
          @click="closeActiveTerminal"
        >
          <X :size="14" />
        </button>
      </div>
      <div class="terminal-body">
        <XtermTerminal
          v-if="activeTerminal"
          :key="activeTerminal.id"
          :cwd="activeTerminal.cwd"
          :active="activeTab === 'terminal'"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  min-height: 120px;
  max-height: 70vh;
}
.resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
}
.resize-handle:hover {
  background: color-mix(in oklab, var(--accent) 40%, transparent);
}
.panel-tabs {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  gap: 2px;
}
.tab-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}
.tab-btn.active {
  color: var(--text-main);
  background: var(--bg-hover);
}
.tab-spacer { flex: 1; }
.tab-close, .link-btn {
  font-size: 11px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.tab-close:hover, .link-btn:hover { color: var(--text-main); }
.panel-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  font-size: 11px;
}
.muted {
  padding: 12px;
  color: var(--text-muted);
}
.output-pane {
  display: flex;
  flex-direction: column;
}
.output-toolbar {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}
.output-text {
  flex: 1;
  margin: 0;
  padding: 8px;
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-sub);
}
.terminal-pane {
  display: flex;
  flex-direction: column;
}
.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
}
.term-tab {
  padding: 2px 8px;
  font-size: 11px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
}
.term-tab.active {
  background: var(--bg-hover);
  color: var(--text-main);
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
}
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.terminal-body {
  flex: 1;
  min-height: 0;
  padding: 4px;
}
</style>
