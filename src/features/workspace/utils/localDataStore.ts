import { workspaceJsonKey } from '@/core/storage/keys'

export function workspaceStorageKey(workspaceId: string, suffix: string): string {
  return workspaceJsonKey(workspaceId, suffix)
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

const META_FIELD_MAP: Record<string, string> = {
  characters: 'characters',
  glossary: 'glossary',
  outline: 'outline',
}

export async function loadWorkspaceData<T>(
  workspaceId: string,
  workspaceRoot: string | null,
  key: string,
  fallback: T,
): Promise<T> {
  if (workspaceRoot) {
    try {
      const { desktopApi } = await import('@/services/desktopApi')
      const { isDesktop } = await import('@/services/runtime')
      if (!isDesktop()) return loadWorkspaceJson(workspaceId, key, fallback)
      await desktopApi.ensureProjectMeta(workspaceRoot)
      const bundle = await desktopApi.loadProjectMeta(workspaceRoot) as Record<string, unknown>
      const field = META_FIELD_MAP[key] ?? key
      if (bundle[field] !== undefined) return bundle[field] as T
      return fallback
    } catch {
      return fallback
    }
  }
  return loadWorkspaceJson(workspaceId, key, fallback)
}

export async function saveWorkspaceData<T>(
  workspaceId: string,
  workspaceRoot: string | null,
  key: string,
  value: T,
): Promise<void> {
  if (workspaceRoot) {
    try {
      const { desktopApi } = await import('@/services/desktopApi')
      const { isDesktop } = await import('@/services/runtime')
      if (isDesktop()) {
        await desktopApi.ensureProjectMeta(workspaceRoot)
        await desktopApi.saveProjectMeta(workspaceRoot, key, JSON.stringify(value))
        return
      }
    } catch {
      // fall through to localStorage
    }
  }
  saveWorkspaceJson(workspaceId, key, value)
}

export const EMPTY_OUTLINE = {
  book_outline: '',
  volume_nodes: [] as import('@/core/types/workspace').OutlineNode[],
  timeline: [] as import('@/core/types/workspace').TimelineEvent[],
}
