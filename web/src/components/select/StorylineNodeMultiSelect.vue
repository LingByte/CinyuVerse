<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getStorylineNode, listStorylineNodes } from '@/api/storylines'
import type { StorylineNode } from '@/types/storyline'

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  storylineId: number
  /** 逗号分隔 type 白名单，如 event,twist,clue；空表示不限类型 */
  typesCsv?: string
  placeholder?: string
}>()

function parseIds(s: string): number[] {
  return (s || '')
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

const selected = ref<number[]>([])
const searchResults = ref<StorylineNode[]>([])
const loading = ref(false)
const cache = ref<Map<number, StorylineNode>>(new Map())

const displayOptions = computed(() => {
  const m = new Map<number, StorylineNode>()
  for (const n of searchResults.value) {
    m.set(n.id, n)
  }
  for (const id of selected.value) {
    const row = cache.value.get(id)
    if (row) {
      m.set(id, row)
    }
  }
  return [...m.values()]
})

let searchTimer: ReturnType<typeof setTimeout> | undefined

function nodeLabel(n: StorylineNode) {
  const t = (n.title || '').trim() || n.nodeId || '未命名'
  return `${t} (#${n.id})`
}

async function ensureSelectedLoaded(ids: number[]) {
  const missing = ids.filter((id) => !cache.value.has(id))
  if (!missing.length) return
  await Promise.all(
    missing.map(async (id) => {
      try {
        const row = await getStorylineNode(id)
        cache.value.set(row.id, row)
      } catch {
        // ignore
      }
    }),
  )
}

watch(
  () => model.value,
  async (v) => {
    const next = parseIds(v)
    if (JSON.stringify(next) !== JSON.stringify(selected.value)) {
      selected.value = next
    }
    await ensureSelectedLoaded(next)
  },
  { immediate: true },
)

watch(selected, (arr) => {
  model.value = arr.join(',')
})

watch(
  () => props.storylineId,
  () => {
    searchResults.value = []
  },
)

async function fetchList(keyword: string) {
  if (!props.storylineId) return
  loading.value = true
  try {
    const res = await listStorylineNodes({
      storylineId: props.storylineId,
      keyword: keyword.trim() || undefined,
      types: props.typesCsv?.trim() || undefined,
      page: 1,
      size: 200,
    })
    for (const n of res.items) {
      cache.value.set(n.id, n)
    }
    searchResults.value = res.items
  } finally {
    loading.value = false
  }
}

function onSearch(keyword: string) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void fetchList(keyword), 280)
}

async function onPopup(open: boolean) {
  if (open && props.storylineId) {
    await ensureSelectedLoaded(selected.value)
    if (!searchResults.value.length) {
      void fetchList('')
    }
  }
}
</script>

<template>
  <a-select
    v-model="selected"
    multiple
    allow-clear
    allow-search
    :filter-option="false"
    :loading="loading"
    :disabled="!storylineId"
    :placeholder="
      props.placeholder ||
      (storylineId ? '输入标题搜索并多选节点' : '请先选择故事线')
    "
    class="entity-multi-select"
    @search="onSearch"
    @popup-visible-change="onPopup"
  >
    <a-option v-for="n in displayOptions" :key="n.id" :value="n.id">
      {{ nodeLabel(n) }}<template v-if="n.type"> · {{ n.type }}</template>
    </a-option>
  </a-select>
</template>

<style scoped>
.entity-multi-select {
  width: 100%;
}
</style>
