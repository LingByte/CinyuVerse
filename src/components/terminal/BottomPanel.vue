<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import XtermTerminal from '@/components/terminal/XtermTerminal.vue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

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
const didBootstrapTerminalRef = ref(false)
const isDragging = ref(false)

const activeTabModel = computed({
  get: () => props.activeTab,
  set: (v: PanelTab) => emit('activeTabChange', v),
})

watch(
  () => [props.open, props.rootPath, terminals.value.length] as const,
  () => {
    if (!props.open) return
    if (terminals.value.length > 0) return
    if (didBootstrapTerminalRef.value) return
    didBootstrapTerminalRef.value = true
    const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
    terminals.value = [{ id, cwd: props.rootPath, title: '1' }]
    activeTerminalId.value = id
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (open) return
    didBootstrapTerminalRef.value = false
  },
)

function addTerminal() {
  const nextIndex = terminals.value.length + 1
  const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
  terminals.value = [...terminals.value, { id, cwd: props.rootPath, title: String(nextIndex) }]
  activeTerminalId.value = id
  if (!props.open) emit('openChange', true)
  emit('activeTabChange', 'terminal')
}

function closeActiveTerminal() {
  if (terminals.value.length <= 1) return
  const idx = terminals.value.findIndex((t) => t.id === activeTerminalId.value)
  const next = terminals.value.filter((t) => t.id !== activeTerminalId.value)
  activeTerminalId.value = next[Math.min(Math.max(0, idx), next.length - 1)]?.id ?? next[0]?.id ?? ''
  terminals.value = next
}

function onMouseDownDrag(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const startY = e.clientY
  const startH = props.height
  isDragging.value = true

  const onMove = (ev: MouseEvent) => {
    const maxH = Math.floor(window.innerHeight * 0.7)
    emit('heightChange', Math.max(120, Math.min(maxH, startH + (startY - ev.clientY))))
  }

  const stopDrag = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', stopDrag)
    window.removeEventListener('blur', stopDrag)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', stopDrag)
  window.addEventListener('blur', stopDrag)
}

const activeTerminal = computed(
  () => terminals.value.find((t) => t.id === activeTerminalId.value) ?? terminals.value[0],
)

const panelStyle = computed(() => ({
  height: `${props.height}px`,
  minHeight: '120px',
  maxHeight: '70vh',
}))
</script>

<template>
  <div
    v-if="open"
    class="flex w-full shrink-0 flex-col overflow-hidden border-t border-border bg-background"
    :style="panelStyle"
  >
    <div
      class="relative h-1.5 shrink-0 cursor-ns-resize border-b border-border bg-muted transition-colors hover:bg-primary/30 active:bg-primary/50"
      title="Drag to resize"
      @mousedown="onMouseDownDrag"
    >
      <div class="absolute inset-x-0 -top-1.5 h-4" aria-hidden="true" />
    </div>

    <Tabs v-model="activeTabModel" class="min-h-0 flex-1">
      <div class="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <TabsList class="h-7 bg-transparent p-0">
          <TabsTrigger value="problems" class="h-7 px-2">Problems</TabsTrigger>
          <TabsTrigger value="output" class="h-7 px-2">Output</TabsTrigger>
          <TabsTrigger value="terminal" class="h-7 px-2">Terminal</TabsTrigger>
        </TabsList>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="emit('openChange', false)">Close</Button>
      </div>

      <TabsContent value="problems" class="p-3 text-xs text-muted-foreground">No problems.</TabsContent>

      <TabsContent value="output" class="flex min-h-0 flex-col">
        <div class="flex h-8 shrink-0 items-center justify-between border-b border-border px-2">
          <span class="text-[11px] text-muted-foreground">Output</span>
          <Button variant="ghost" size="sm" class="h-7 text-xs" @click="emit('clearOutput')">Clear</Button>
        </div>
        <ScrollArea class="min-h-0 flex-1 bg-zinc-950">
          <pre
            v-if="outputText.trim()"
            class="p-2 font-mono text-xs leading-relaxed text-zinc-100 whitespace-pre-wrap break-words"
          >{{ outputText }}</pre>
          <div v-else class="p-2 text-xs text-zinc-500">No output.</div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="terminal" class="flex min-h-0 flex-col">
        <div class="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
          <span
            class="min-w-0 truncate text-[11px] text-muted-foreground"
            :title="activeTerminal?.cwd ?? rootPath"
          >
            {{ activeTerminal?.cwd ?? rootPath }}
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-sm" title="New Terminal" @click="addTerminal">
              <Plus class="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Kill Terminal"
              :disabled="terminals.length <= 1"
              @click="closeActiveTerminal"
            >
              <X class="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" class="mx-1 h-5" />
            <div class="flex max-w-[260px] items-center gap-1 overflow-auto">
              <Button
                v-for="t in terminals"
                :key="t.id"
                variant="ghost"
                size="sm"
                :class="cn('h-6 shrink-0 px-2 text-xs', t.id === activeTerminalId && 'bg-accent')"
                :title="t.cwd"
                @click="activeTerminalId = t.id"
              >
                {{ t.title }}
              </Button>
            </div>
          </div>
        </div>
        <div class="min-h-0 flex-1 p-2">
          <div v-for="t in terminals" :key="t.id" :class="t.id === activeTerminalId ? 'h-full' : 'hidden h-full'">
            <XtermTerminal :cwd="t.cwd" :active="t.id === activeTerminalId" />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>

  <div v-if="isDragging" class="fixed inset-0 z-[9999] cursor-ns-resize" />
</template>
