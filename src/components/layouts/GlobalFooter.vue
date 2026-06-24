<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { GitBranch, Terminal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  rootPath: string
  onOpenTerminal: () => void
}>()

const label = ref('No Git')

let disposed = false
let timer: number | null = null

async function refresh() {
  if (!props.rootPath) {
    if (!disposed) label.value = 'No Git'
    return
  }
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const repo = await invoke<boolean>('is_git_repository', { path: props.rootPath })
    if (!repo) {
      if (!disposed) label.value = 'No Git'
      return
    }
    const branch = await invoke<string | null>('git_current_branch', { path: props.rootPath })
    if (!disposed) label.value = branch && branch.trim() ? branch.trim() : 'Detached'
  } catch {
    if (!disposed) label.value = 'No Git'
  }
}

watch(
  () => props.rootPath,
  () => {
    void refresh()
    if (timer) window.clearInterval(timer)
    timer = window.setInterval(() => void refresh(), 5000)
  },
  { immediate: true },
)

onUnmounted(() => {
  disposed = true
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <footer class="flex h-7 shrink-0 items-center justify-between border-t border-border bg-background px-2 text-foreground">
    <div class="flex min-w-0 items-center gap-2 text-xs">
      <GitBranch class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Badge variant="outline" class="max-w-[220px] truncate font-normal" :title="label">
        {{ label }}
      </Badge>
      <Button variant="ghost" size="icon-sm" title="Terminal" @click="onOpenTerminal">
        <Terminal class="h-4 w-4" />
      </Button>
    </div>
  </footer>
</template>
