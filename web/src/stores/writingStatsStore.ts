import { defineStore } from 'pinia'
import { ref } from 'vue'

const PREFIX = 'cinyuverse-writing-stats-'
const TARGET_PREFIX = 'cinyuverse-word-target-'

export interface DailyStat {
  date: string
  words: number
}

export const useWritingStatsStore = defineStore('writingStats', () => {
  const dailyStats = ref<DailyStat[]>([])
  const targetWords = ref(100000)
  let wsId = ''

  function todayKey() {
    return new Date().toISOString().slice(0, 10)
  }

  function load(workspaceId: string) {
    wsId = workspaceId
    try {
      const raw = localStorage.getItem(PREFIX + workspaceId)
      dailyStats.value = raw ? JSON.parse(raw) : []
      const t = localStorage.getItem(TARGET_PREFIX + workspaceId)
      targetWords.value = t ? parseInt(t, 10) : 100000
    } catch {
      dailyStats.value = []
    }
  }

  function persist() {
    if (!wsId) return
    localStorage.setItem(PREFIX + wsId, JSON.stringify(dailyStats.value))
    localStorage.setItem(TARGET_PREFIX + wsId, String(targetWords.value))
  }

  function recordSave(deltaWords: number) {
    if (deltaWords <= 0) return
    const today = todayKey()
    const idx = dailyStats.value.findIndex((d) => d.date === today)
    if (idx >= 0) {
      dailyStats.value[idx].words += deltaWords
    } else {
      dailyStats.value.push({ date: today, words: deltaWords })
    }
    if (dailyStats.value.length > 90) {
      dailyStats.value = dailyStats.value.slice(-90)
    }
    persist()
  }

  function setTarget(n: number) {
    targetWords.value = Math.max(0, n)
    persist()
  }

  return { dailyStats, targetWords, load, recordSave, setTarget }
})
