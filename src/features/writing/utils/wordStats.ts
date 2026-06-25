import type { WorkspaceDetail, WordStats } from '@/core/types/workspace'

export function computeWordStats(workspace: WorkspaceDetail, target = 0): WordStats {
  let total = 0
  const volume_stats = workspace.volumes.map((vol) => {
    let volTotal = 0
    const chapters = vol.chapters.map((ch) => {
      volTotal += ch.word_count
      return {
        chapter_id: ch.id,
        title: ch.title,
        words: ch.word_count,
        body_words: ch.word_count,
      }
    })
    total += volTotal
    return {
      volume_id: vol.id,
      title: vol.title,
      total_words: volTotal,
      chapters,
    }
  })
  return {
    total_words: total,
    body_words: total,
    volume_stats,
    target_words: target,
    target_progress: target > 0 ? Math.min(100, (total / target) * 100) : 0,
  }
}
