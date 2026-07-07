import { ref } from 'vue'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

export type EditorAiAction =
  | 'expand'
  | 'shorten'
  | 'dialogue'
  | 'persona'
  | 'style'
  | 'polish'
  | 'hook'

export const EDITOR_AI_ACTIONS: { id: EditorAiAction; label: string }[] = [
  { id: 'expand', label: '扩写' },
  { id: 'shorten', label: '精简' },
  { id: 'dialogue', label: '对话化' },
  { id: 'persona', label: '人设修正' },
  { id: 'style', label: '文风统一' },
  { id: 'polish', label: '润色' },
  { id: 'hook', label: '加钩子' },
]

export function useEditorAi() {
  const busy = ref(false)
  const error = ref('')

  async function runSelectionAction(params: {
    workspaceRoot: string
    chapterPath: string
    fullText: string
    selection: string
    selectionFrom: number
    selectionTo: number
    action: EditorAiAction
  }): Promise<string | null> {
    if (!isDesktop()) {
      error.value = '仅桌面端可用'
      return null
    }
    busy.value = true
    error.value = ''
    try {
      const before = params.fullText.slice(Math.max(0, params.selectionFrom - 800), params.selectionFrom)
      const after = params.fullText.slice(params.selectionTo, params.selectionTo + 800)
      const built = await desktopApi.buildWritingPrompt({
        workspace_root: params.workspaceRoot,
        action: params.action,
        selection: params.selection,
        context_before: before,
        context_after: after,
        chapter_path: params.chapterPath,
      })
      const text = await desktopApi.aiChatStream({
        model: 'default',
        messages: [
          { role: 'system', content: built.system_prompt },
          { role: 'user', content: built.user_prompt },
        ],
      }, () => {})
      return text.trim() || null
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'AI 改写失败'
      return null
    } finally {
      busy.value = false
    }
  }

  return { busy, error, runSelectionAction }
}
