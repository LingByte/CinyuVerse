import { ref } from 'vue'
import { desktopApi } from '@/services/desktopApi'

export interface BatchChapterItem {
  filePath: string
  title: string
  outlineSnippet: string
}

function mapQueueItem(raw: Record<string, unknown>): BatchChapterItem {
  return {
    filePath: String(raw.file_path ?? raw.filePath ?? ''),
    title: String(raw.title ?? ''),
    outlineSnippet: String(raw.outline_snippet ?? raw.outlineSnippet ?? ''),
  }
}

export function useBatchAiRunner() {
  const running = ref(false)
  const activeTaskId = ref<string | null>(null)

  async function runBatchLlm(workspaceRoot: string, taskId: string, kind: string) {
    if (running.value) return
    running.value = true
    activeTaskId.value = taskId
    try {
      let task = await desktopApi.getAiTask(workspaceRoot, taskId) as Record<string, unknown>
      const status = String(task.status ?? '')
      if (status === 'pending') {
        task = await desktopApi.processAiTask(workspaceRoot, taskId) as Record<string, unknown>
      }
      const nextStatus = String(task.status ?? '')
      if (nextStatus !== 'awaiting_llm' && nextStatus !== 'running') return

      const rawQueue = await desktopApi.getBatchQueue(workspaceRoot, taskId) as Record<string, unknown>[]
      const queue = rawQueue.map(mapQueueItem)
      if (!queue.length) {
        await desktopApi.updateAiTask(workspaceRoot, taskId, 'failed', 0, 0, '章节队列为空，请检查大纲绑定')
        return
      }

      let progress = Number(task.progress ?? 0)
      const total = queue.length
      await desktopApi.updateAiTask(workspaceRoot, taskId, 'running', progress, total, 'AI 逐章处理中…')

      const isGenerate = kind === 'batch_generate'
      const stage = isGenerate ? 'body' : 'proofread'
      const instruction = isGenerate
        ? '根据章节细纲撰写完整正文，直接输出正文，不要解释。'
        : '润色本章正文，修正语病、统一文风与人称，直接输出润色后的完整正文。'

      for (let i = progress; i < queue.length; i++) {
        const item = queue[i]
        let existing = ''
        try {
          const file = await desktopApi.readFile(item.filePath)
          existing = file.content
        } catch {
          existing = ''
        }

        const built = await desktopApi.runPipelineStage({
          workspaceRoot,
          stage,
          instruction: isGenerate
            ? instruction
            : `${instruction}\n\n当前正文：\n${existing.slice(0, 8000)}`,
          chapterPath: item.filePath,
          outlineSnippet: item.outlineSnippet || undefined,
        }) as { modelHint: string; systemPrompt: string; userPrompt: string }

        const text = await desktopApi.aiChatStream(
          {
            model: built.modelHint || 'default',
            messages: [
              { role: 'system', content: built.systemPrompt },
              { role: 'user', content: built.userPrompt },
            ],
          },
          () => {},
        )

        const output = text.trim()
        if (output) {
          await desktopApi.writeFile(item.filePath, output)
        }

        progress = i + 1
        await desktopApi.updateAiTask(
          workspaceRoot,
          taskId,
          'running',
          progress,
          total,
          `已完成 ${item.title}（${progress}/${total}）`,
        )
      }

      await desktopApi.updateAiTask(
        workspaceRoot,
        taskId,
        'completed',
        total,
        total,
        `批量${isGenerate ? '生成' : '润色'}完成，共 ${total} 章`,
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '批量 AI 处理失败'
      await desktopApi.updateAiTask(workspaceRoot, taskId, 'failed', 0, 0, msg).catch(() => {})
      throw e
    } finally {
      running.value = false
      activeTaskId.value = null
    }
  }

  return { running, activeTaskId, runBatchLlm }
}
