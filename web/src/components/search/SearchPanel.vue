<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { ideApi } from '@/services/ideApi'

const props = defineProps<{
  rootPath: string
  onOpenMatch: (path: string, line: number, column: number) => void
}>()

const query = ref('')
const loading = ref(false)
const error = ref('')
const matches = ref<{ path: string; line: number; column: number; text: string }[]>([])
let requestId = 0

const grouped = computed(() => {
  const map = new Map<string, typeof matches.value>()
  for (const m of matches.value) {
    const arr = map.get(m.path) ?? []
    arr.push(m)
    map.set(m.path, arr)
  }
  return Array.from(map.entries())
})

async function runSearch() {
  const q = query.value.trim()
  if (!props.rootPath) {
    error.value = '请先打开文件夹'
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
    const rid = ++requestId
    const res = await ideApi.searchWorkspace(props.rootPath, q)
    if (rid !== requestId) return
    matches.value = res
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '搜索失败'
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
  const t = window.setTimeout(() => void runSearch(), 300)
  return () => window.clearTimeout(t)
})
</script>

<template>
  <PanelShell title="搜索" subtitle="工作区">
    <template #toolbar>
      <div class="search-toolbar">
        <input v-model="query" type="search" class="search-input" placeholder="搜索文件内容…" />
        <div v-if="loading" class="search-meta">搜索中…</div>
        <div v-else-if="matches.length" class="search-meta">{{ matches.length }} 条结果</div>
      </div>
    </template>

    <template v-if="error" #alert>
      <div class="search-error">{{ error }}</div>
    </template>

    <div v-if="grouped.length === 0" class="search-empty">
      {{ query.trim() ? '无匹配结果' : '输入关键词搜索工作区' }}
    </div>
    <div v-else class="search-results">
      <div v-for="[filePath, items] in grouped" :key="filePath" class="search-file-group">
        <div class="search-file-path">{{ filePath.split(/[/\\]/).pop() }}</div>
        <button
          v-for="(m, i) in items"
          :key="`${m.line}-${i}`"
          type="button"
          class="search-match"
          @click="onOpenMatch(m.path, m.line, m.column)"
        >
          <span class="search-line">{{ m.line }}</span>
          <span class="search-text">{{ m.text.trim() }}</span>
        </button>
      </div>
    </div>
  </PanelShell>
</template>

<style scoped>
.search-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.search-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
}
.search-meta {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-muted);
}
.search-error {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--danger);
}
.search-empty {
  padding: 12px;
  font-size: 11px;
  color: var(--text-muted);
}
.search-results {
  padding: 4px 0;
}
.search-file-group {
  margin-bottom: 8px;
}
.search-file-path {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-hover);
}
.search-match {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-sub);
}
.search-match:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.search-line {
  flex-shrink: 0;
  width: 32px;
  color: var(--text-muted);
  font-family: monospace;
}
.search-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
