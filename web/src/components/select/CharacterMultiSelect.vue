<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getCharacter, listCharacters } from '@/api/characters'
import type { Character } from '@/types/character'

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  novelId: number
  placeholder?: string
}>()

function parseIds(s: string): number[] {
  return (s || '')
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

const selected = ref<number[]>([])
const searchResults = ref<Character[]>([])
const loading = ref(false)
const cache = ref<Map<number, Character>>(new Map())

const displayOptions = computed(() => {
  const m = new Map<number, Character>()
  for (const c of searchResults.value) {
    m.set(c.id, c)
  }
  for (const id of selected.value) {
    const c = cache.value.get(id)
    if (c) {
      m.set(id, c)
    }
  }
  return [...m.values()]
})

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function ensureSelectedLoaded(ids: number[]) {
  const missing = ids.filter((id) => !cache.value.has(id))
  if (!missing.length) return
  await Promise.all(
    missing.map(async (id) => {
      try {
        const c = await getCharacter(id)
        cache.value.set(c.id, c)
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

async function fetchList(keyword: string) {
  if (!props.novelId) return
  loading.value = true
  try {
    const res = await listCharacters({
      novelId: props.novelId,
      keyword: keyword.trim() || undefined,
      page: 1,
      size: 100,
    })
    for (const c of res.characters) {
      cache.value.set(c.id, c)
    }
    searchResults.value = res.characters
  } finally {
    loading.value = false
  }
}

function onSearch(keyword: string) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void fetchList(keyword), 280)
}

async function onPopup(open: boolean) {
  if (open) {
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
    :placeholder="props.placeholder || '输入姓名搜索并多选角色'"
    class="entity-multi-select"
    @search="onSearch"
    @popup-visible-change="onPopup"
  >
    <a-option v-for="c in displayOptions" :key="c.id" :value="c.id">
      {{ c.name }}<template v-if="c.roleType"> · {{ c.roleType }}</template>
    </a-option>
  </a-select>
</template>

<style scoped>
.entity-multi-select {
  width: 100%;
}
</style>
