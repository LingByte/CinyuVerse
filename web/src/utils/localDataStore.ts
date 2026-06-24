export function workspaceStorageKey(workspaceId: string, suffix: string): string {
  return `cinyuverse-${suffix}-${workspaceId}`
}

export function loadWorkspaceJson<T>(workspaceId: string, suffix: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(workspaceStorageKey(workspaceId, suffix))
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveWorkspaceJson(workspaceId: string, suffix: string, value: unknown): void {
  localStorage.setItem(workspaceStorageKey(workspaceId, suffix), JSON.stringify(value))
}

export const EMPTY_OUTLINE = {
  book_outline: '',
  volume_nodes: [] as import('@/types/workspace').OutlineNode[],
  timeline: [] as import('@/types/workspace').TimelineEvent[],
}
