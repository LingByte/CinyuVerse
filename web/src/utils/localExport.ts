import type { WorkspaceDetail } from '@/types/workspace'

export async function buildWorkspaceExport(
  workspace: WorkspaceDetail,
  loadContent: (volId: string, chId: string) => Promise<string>,
  format: 'txt' | 'md',
): Promise<string> {
  const parts: string[] = []
  for (const vol of workspace.volumes) {
    if (format === 'md' && workspace.volumes.length > 1) {
      parts.push(`# ${vol.title}\n`)
    }
    for (const ch of vol.chapters) {
      const content = await loadContent(vol.id, ch.id)
      if (format === 'md') {
        parts.push(`## ${ch.title}\n\n${content}\n`)
      } else {
        parts.push(`${ch.title}\n${'─'.repeat(Math.min(ch.title.length, 40))}\n${content}\n`)
      }
    }
  }
  return parts.join('\n').trim()
}

export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
