<script lang="ts">
export type EditorTab = {
  id: string
  path: string
  title: string
  isDirty: boolean
}
</script>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineProps<{
  tabs: EditorTab[]
  activeId: string | null
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
  contextMenu: [args: { id: string | null; x: number; y: number }]
}>()

function onEmptyContextMenu(e: MouseEvent) {
  e.preventDefault()
  emit('contextMenu', { id: null, x: e.clientX, y: e.clientY })
}

function onTabContextMenu(e: MouseEvent, id: string) {
  e.preventDefault()
  e.stopPropagation()
  emit('contextMenu', { id, x: e.clientX, y: e.clientY })
}
</script>

<template>
  <div
    class="h-10 w-full max-w-full shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-background"
    @contextmenu="onEmptyContextMenu"
  >
    <div class="flex h-full" :style="{ width: `${Math.max(tabs.length * 150, 0)}px` }">
      <div
        v-for="t in tabs"
        :key="t.id"
        :class="
          cn(
            'flex h-full w-[150px] shrink-0 cursor-pointer select-none items-center gap-2 border-r border-border px-3',
            t.id === activeId ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:bg-muted/30',
          )
        "
        :title="t.path"
        @click="emit('activate', t.id)"
        @contextmenu="onTabContextMenu($event, t.id)"
      >
        <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
          {{ t.title }}
          <span v-if="t.isDirty" class="ml-1 text-primary">•</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          aria-label="Close tab"
          @click.stop="emit('close', t.id)"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
