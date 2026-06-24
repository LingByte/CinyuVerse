<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

type SearchMatch = {
  path: string
  line: number
  column: number
  text: string
}

const props = defineProps<{
  rootPath: string
  onOpenMatch: (path: string, line: number, column: number) => void
}>()

const query = ref('')
const loading = ref(false)
const error = ref('')
const matches = ref<SearchMatch[]>([])
let requestId = 0

const grouped = computed(() => {
  const map = new Map<string, SearchMatch[]>()
  for (const m of matches.value) {
    const arr = map.get(m.path) ?? []
    arr.push(m)
    map.set(m.path, arr)
  }
  return Array.from(map.entries())
})

const resultCount = computed(() => matches.value.length)

async function runSearch() {
  const q = query.value.trim()
  if (!props.rootPath) {
    error.value = 'Open a folder to search.'
    matches.value = []
    return
  }
  if (!q) {
    matches.value = []
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const rid = ++requestId
    const res = await invoke<unknown[]>('search_workspace', {
      path: props.rootPath,
      query: q,
      max_results: 500,
    })
    if (rid !== requestId) return
    matches.value = Array.isArray(res)
      ? res
          .map((x) => {
            const item = x as Record<string, unknown>
            return {
              path: typeof item.path === 'string' ? item.path : '',
              line: typeof item.line === 'number' ? item.line : 0,
              column: typeof item.column === 'number' ? item.column : 0,
              text: typeof item.text === 'string' ? item.text : '',
            }
          })
          .filter((x) => x.path && x.line > 0)
      : []
  } catch (e: unknown) {
    error.value =
      typeof e === 'string' ? e : e instanceof Error ? e.message : 'Search failed.'
    matches.value = []
  } finally {
    loading.value = false
  }
}

watch(query, (q) => {
  if (!q.trim()) {
    matches.value = []
    error.value = ''
    loading.value = false
    return
  }
  const t = window.setTimeout(() => void runSearch(), 250)
  return () => window.clearTimeout(t)
})
</script>

<template>
  <PanelShell title="Search">
    <template #toolbar>
      <div class="border-b border-border px-3 py-2">
        <Input v-model="query" type="search" placeholder="Search workspace…" />
        <div v-if="loading" class="mt-2 text-xs text-muted-foreground">Searching…</div>
        <div v-else-if="resultCount > 0" class="mt-2 text-xs text-muted-foreground">
          {{ resultCount }} result{{ resultCount === 1 ? '' : 's' }}
        </div>
      </div>
    </template>

    <template v-if="error" #alert>
      <Alert variant="destructive">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
    </template>

    <ScrollArea class="h-full">
      <div v-if="grouped.length === 0" class="p-3 text-xs text-muted-foreground">
        {{ query.trim() ? 'No results.' : 'Enter a query to search the workspace.' }}
      </div>
      <div v-else class="space-y-2 p-2">
        <div
          v-for="[path, items] in grouped"
          :key="path"
          class="overflow-hidden rounded-md border border-border"
        >
          <div
            class="truncate border-b border-border bg-muted/40 px-2 py-1.5 text-xs font-medium text-foreground"
            :title="path"
          >
            {{ path }}
            <Badge variant="muted" class="ml-2 h-4 px-1.5 text-[10px]">{{ items.length }}</Badge>
          </div>
          <div class="p-1">
            <Button
              v-for="(m, idx) in items.slice(0, 50)"
              :key="idx"
              variant="ghost"
              class="h-auto w-full flex-col items-start gap-0.5 px-2 py-1.5"
              @click="onOpenMatch(m.path, m.line, m.column)"
            >
              <span class="font-mono text-[11px] text-muted-foreground">{{ m.line }}:{{ m.column }}</span>
              <span class="w-full truncate text-xs text-foreground">{{ m.text }}</span>
            </Button>
            <div v-if="items.length > 50" class="px-2 py-1 text-[11px] text-muted-foreground">
              +{{ items.length - 50 }} more…
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </PanelShell>
</template>
