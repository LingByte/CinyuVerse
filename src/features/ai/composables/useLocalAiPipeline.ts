import { ref } from 'vue'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

export type PipelineStage = 'outline' | 'body' | 'proofread'

export interface LockedContext {
  snippets: string[]
  maxChars: number
}

export function useLocalAiPipeline() {
  const busy = ref(false)
  const error = ref('')
  const stageLog = ref<string[]>([])
  const lockedContext = ref<LockedContext>({ snippets: [], maxChars: 12000 })

  function addLockedSnippet(text: string) {
    const t = text.trim()
    if (!t || lockedContext.value.snippets.includes(t)) return
    lockedContext.value.snippets.push(t)
  }

  function removeLockedSnippet(i: number) {
    lockedContext.value.snippets.splice(i, 1)
  }

  async function truncateChapterContext(
    workspaceRoot: string,
    chapterPath: string,
    chapterContent?: string,
  ) {
    if (chapterContent !== undefined) {
      const max = lockedContext.value.maxChars
      const lockedLen = lockedContext.value.snippets.reduce((n, s) => n + s.length, 0)
      const budget = Math.max(max - lockedLen, 500)
      const tail = chapterContent.length > budget
        ? chapterContent.slice(chapterContent.length - budget)
        : chapterContent
      const parts = [...lockedContext.value.snippets.filter(Boolean), tail]
      return parts.join('\n\n---\n\n')
    }
    const res = await desktopApi.truncateContext({
      workspaceRoot,
      chapterPath,
      maxChars: lockedContext.value.maxChars,
      lockedSnippets: lockedContext.value.snippets,
    }) as { truncatedText: string }
    return res.truncatedText
  }

  async function runStage(
    workspaceRoot: string,
    stage: PipelineStage,
    instruction: string,
    chapterPath?: string,
    outlineSnippet?: string,
  ) {
    const res = await desktopApi.runPipelineStage({
      workspaceRoot,
      stage,
      instruction,
      chapterPath,
      outlineSnippet,
    }) as { stage: string; modelHint: string; systemPrompt: string; userPrompt: string }
    return res
  }

  async function streamStage(
    workspaceRoot: string,
    stage: PipelineStage,
    instruction: string,
    chapterPath?: string,
    outlineSnippet?: string,
    onChunk?: (text: string) => void,
    taskId?: string,
  ): Promise<string> {
    const built = await runStage(workspaceRoot, stage, instruction, chapterPath, outlineSnippet)
    stageLog.value.push(`[${stage}] 模型 ${built.modelHint}`)
    let accumulated = ''
    if (taskId) {
      const partial = await desktopApi.resumeStream(workspaceRoot, taskId) as string
      if (partial) accumulated = partial
    }
    const result = await desktopApi.aiChatStream(
      {
        model: built.modelHint || 'default',
        messages: [
          { role: 'system', content: built.systemPrompt },
          { role: 'user', content: built.userPrompt },
        ],
      },
      (chunk) => {
        accumulated += chunk
        onChunk?.(accumulated)
        if (taskId) {
          void desktopApi.saveStreamCheckpoint(workspaceRoot, taskId, accumulated)
        }
      },
    )
    if (taskId) {
      await desktopApi.saveStreamCheckpoint(workspaceRoot, taskId, result)
    }
    return result.trim()
  }

  async function runThreeTierPipeline(opts: {
    workspaceRoot: string
    chapterPath: string
    instruction: string
    outlineSnippet?: string
    chapterContent?: string
    onStage?: (stage: PipelineStage, text: string) => void
    taskId?: string
  }): Promise<string> {
    if (!isDesktop()) {
      error.value = '仅桌面端可用'
      return ''
    }
    busy.value = true
    error.value = ''
    stageLog.value = []
    try {
      if (opts.chapterContent !== undefined) {
        const ctx = await truncateChapterContext(
          opts.workspaceRoot,
          opts.chapterPath,
          opts.chapterContent,
        )
        addLockedSnippet(ctx.slice(0, 500))
      } else if (opts.chapterPath) {
        const ctx = await truncateChapterContext(opts.workspaceRoot, opts.chapterPath)
        addLockedSnippet(ctx.slice(0, 500))
      }

      const outline = await streamStage(
        opts.workspaceRoot,
        'outline',
        opts.instruction || '根据大纲生成章节规划要点',
        opts.chapterPath,
        opts.outlineSnippet,
        undefined,
        opts.taskId ? `${opts.taskId}_outline` : undefined,
      )
      opts.onStage?.('outline', outline)

      const body = await streamStage(
        opts.workspaceRoot,
        'body',
        `${opts.instruction}\n\n规划要点：\n${outline}`,
        opts.chapterPath,
        opts.outlineSnippet,
        undefined,
        opts.taskId ? `${opts.taskId}_body` : undefined,
      )
      opts.onStage?.('body', body)

      const proofread = await streamStage(
        opts.workspaceRoot,
        'proofread',
        `请校对润色以下正文，修正语病与人设一致性：\n\n${body}`,
        opts.chapterPath,
        opts.outlineSnippet,
        undefined,
        opts.taskId ? `${opts.taskId}_proof` : undefined,
      )
      opts.onStage?.('proofread', proofread)
      return proofread
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '流水线失败'
      return ''
    } finally {
      busy.value = false
    }
  }

  async function simpleChat(
    workspaceRoot: string,
    instruction: string,
    chapterPath?: string,
    selection?: string,
  ): Promise<string> {
    if (!isDesktop()) return ''
    busy.value = true
    error.value = ''
    try {
      const built = await desktopApi.buildWritingPrompt({
        workspace_root: workspaceRoot,
        user_instruction: instruction,
        selection,
        chapter_path: chapterPath,
      })
      return (await desktopApi.aiChatStream({
        model: 'default',
        messages: [
          { role: 'system', content: built.system_prompt },
          { role: 'user', content: built.user_prompt },
        ],
      }, () => {})).trim()
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '对话失败'
      return ''
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    error,
    stageLog,
    lockedContext,
    addLockedSnippet,
    removeLockedSnippet,
    truncateChapterContext,
    runThreeTierPipeline,
    simpleChat,
  }
}
