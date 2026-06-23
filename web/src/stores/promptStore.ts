import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { BUILTIN_PROMPTS, type PromptTemplate } from '@/config/promptTemplates'

const CUSTOM_KEY = 'cinyuverse-custom-prompts'
const ACTIVE_PREFIX = 'cinyuverse-active-prompt-'

export const usePromptStore = defineStore('prompt', () => {
  const customPrompts = ref<PromptTemplate[]>([])
  const activeByWorkspace = ref<Record<string, string>>({})

  const allPrompts = computed(() => [...BUILTIN_PROMPTS, ...customPrompts.value])

  function load() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY)
      customPrompts.value = raw ? JSON.parse(raw) : []
      const activeRaw = localStorage.getItem(ACTIVE_PREFIX + 'map')
      activeByWorkspace.value = activeRaw ? JSON.parse(activeRaw) : {}
    } catch {
      customPrompts.value = []
    }
  }

  function persistCustom() {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customPrompts.value))
  }

  function persistActiveMap() {
    localStorage.setItem(ACTIVE_PREFIX + 'map', JSON.stringify(activeByWorkspace.value))
  }

  function getActivePrompt(workspaceId: string): PromptTemplate | null {
    const id = activeByWorkspace.value[workspaceId]
    if (!id) return null
    return allPrompts.value.find((p) => p.id === id) ?? null
  }

  function setActivePrompt(workspaceId: string, promptId: string) {
    activeByWorkspace.value[workspaceId] = promptId
    persistActiveMap()
  }

  function addCustom(name: string, category: string, content: string) {
    const p: PromptTemplate = {
      id: 'custom_' + Date.now(),
      name,
      category,
      content,
    }
    customPrompts.value.push(p)
    persistCustom()
    return p
  }

  function exportPrompt(p: PromptTemplate): string {
    return JSON.stringify({ ...p, version: 1 }, null, 2)
  }

  function importPrompt(json: string): PromptTemplate | null {
    try {
      const p = JSON.parse(json) as PromptTemplate
      if (!p.content || !p.name) return null
      p.id = 'custom_' + Date.now()
      delete p.builtin
      customPrompts.value.push(p)
      persistCustom()
      return p
    } catch {
      return null
    }
  }

  watch(customPrompts, persistCustom, { deep: true })

  load()

  return {
    customPrompts,
    allPrompts,
    getActivePrompt,
    setActivePrompt,
    addCustom,
    exportPrompt,
    importPrompt,
  }
})
