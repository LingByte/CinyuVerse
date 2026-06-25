import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface LlmModelEntry {
  id: string
  name: string
  provider: 'qwen' | 'openai' | 'claude' | 'ollama' | 'custom'
  baseUrl?: string
  group: 'create' | 'chat' | 'polish'
}

const STORAGE_KEY = 'cinyuverse-llm-models'

const DEFAULT_MODELS: LlmModelEntry[] = [
  { id: 'qwen-plus', name: '通义 Plus', provider: 'qwen', group: 'create' },
  { id: 'qwen-turbo', name: '通义 Turbo', provider: 'qwen', group: 'chat' },
  { id: 'qwen-max', name: '通义 Max', provider: 'qwen', group: 'create' },
  { id: 'qwen-long', name: '通义 Long', provider: 'qwen', group: 'polish' },
  { id: 'llama3', name: 'Ollama Llama3', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', group: 'chat' },
  { id: 'qwen2.5', name: 'Ollama Qwen2.5', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', group: 'create' },
]

export const useLlmStore = defineStore('llm', () => {
  const models = ref<LlmModelEntry[]>([...DEFAULT_MODELS])
  const ollamaBaseUrl = ref('http://127.0.0.1:11434')

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { models: LlmModelEntry[]; ollamaBaseUrl?: string }
        if (parsed.models?.length) models.value = parsed.models
        if (parsed.ollamaBaseUrl) ollamaBaseUrl.value = parsed.ollamaBaseUrl
      }
    } catch { /* ignore */ }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      models: models.value,
      ollamaBaseUrl: ollamaBaseUrl.value,
    }))
  }

  function addModel(entry: LlmModelEntry) {
    models.value.push(entry)
    persist()
  }

  function removeModel(id: string) {
    models.value = models.value.filter((m) => m.id !== id)
    persist()
  }

  watch([models, ollamaBaseUrl], persist, { deep: true })

  load()

  return { models, ollamaBaseUrl, addModel, removeModel, load }
})
