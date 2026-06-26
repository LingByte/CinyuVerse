import { ref, watch, onUnmounted, computed, type Ref, type ComputedRef } from 'vue'
import type { AgentMessage, StoryEvent } from '@/core/types/story'
import { useStoryStore } from '@/features/story/stores/storyStore'
import * as storyApi from '@/services/storyApi'

export type PipelineAction =
  | 'write-next'
  | 'plan'
  | 'draft'
  | 'audit'
  | 'revise'
  | 'polish'

const QUICK_PROMPTS = [
  { label: '讨论下一章方向', text: '根据当前大纲和已有章节，讨论下一章应该怎么写，给出 3 个剧情方向。' },
  { label: '检查人设一致性', text: '阅读 truth 设定文件和最新章节，检查主要角色行为是否一致，列出问题。' },
  { label: '梳理伏笔', text: '列出书中已埋下的伏笔，标注是否已回收，并建议下一章可埋的新伏笔。' },
  { label: '更新创作焦点', text: '根据最近章节进展，帮我更新 current_focus，明确下一阶段的创作重点。' },
]

export function useStoryAgent(
  currentChapterNum: Ref<number | null> | ComputedRef<number | null> = ref(null),
) {
  const storyStore = useStoryStore()
  const messages = ref<AgentMessage[]>([])
  const eventLogs = ref<StoryEvent[]>([])
  const loadingSession = ref(false)
  const lastResult = ref('')

  let stopEvents: (() => void) | null = null

  const latestChapterNum = computed(() => {
    if (currentChapterNum.value && currentChapterNum.value > 0) return currentChapterNum.value
    const chapters = storyStore.chapters
    if (!chapters?.length) return null
    return chapters[chapters.length - 1].number
  })

  function startEventStream() {
    stopEvents?.()
    stopEvents = storyApi.subscribeEvents((raw) => {
      const ev = raw as StoryEvent
      if (ev.type === 'connected') return
      eventLogs.value = [...eventLogs.value.slice(-49), ev]
    })
  }

  async function refreshSession() {
    if (!storyStore.currentBookId) {
      messages.value = []
      return
    }
    loadingSession.value = true
    try {
      messages.value = await storyStore.loadAgentSession()
    } catch {
      // 后端未就绪或会话尚未创建时忽略
      messages.value = []
    } finally {
      loadingSession.value = false
    }
  }

  async function sendInstruction(instruction: string) {
    if (!storyStore.connected) throw new Error('后端未连接')
    if (!storyStore.currentBookId) throw new Error('请先在左侧「后端」面板选择书籍')

    messages.value = [...messages.value, { role: 'user', content: instruction }]
    startEventStream()
    const res = await storyStore.askAgent(instruction)
    lastResult.value = res.response
    await refreshSession()
    return res.response
  }

  async function runPipeline(action: PipelineAction, guidance = '') {
    if (!storyStore.currentBookId) throw new Error('请选择书籍')
    startEventStream()
    eventLogs.value = []

    switch (action) {
      case 'write-next': {
        const out = await storyStore.writeNext(guidance || undefined)
        await refreshSession()
        return out
      }
      case 'plan': {
        const out = await storyStore.planChapter(guidance || undefined)
        await refreshSession()
        return out
      }
      case 'draft': {
        const out = await storyStore.draftChapter(guidance || undefined)
        await refreshSession()
        return out
      }
      case 'audit': {
        const ch = latestChapterNum.value
        if (!ch) throw new Error('暂无章节可审核')
        return storyStore.auditChapter(ch)
      }
      case 'revise': {
        const ch = latestChapterNum.value
        if (!ch) throw new Error('暂无章节可修订')
        return storyStore.reviseChapter(ch)
      }
      case 'polish': {
        const ch = latestChapterNum.value ?? undefined
        const out = await storyStore.polishChapter(ch)
        return out.content
      }
      default:
        throw new Error('未知操作')
    }
  }

  watch(
    () => storyStore.currentBookId,
    () => {
      eventLogs.value = []
      lastResult.value = ''
      void refreshSession().catch(() => {})
    },
    { immediate: true },
  )

  watch(
    () => storyStore.connected,
    (ok) => {
      if (ok) startEventStream()
      else stopEvents?.()
    },
    { immediate: true },
  )

  onUnmounted(() => stopEvents?.())

  return {
    messages,
    eventLogs,
    loadingSession,
    lastResult,
    latestChapterNum,
    quickPrompts: QUICK_PROMPTS,
    refreshSession,
    sendInstruction,
    runPipeline,
  }
}
