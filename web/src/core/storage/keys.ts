/** Centralized localStorage key prefixes for the renderer. */

export const STORAGE_PREFIX = 'cinyuverse'

export const SESSION_KEYS = {
  lastFolder: `${STORAGE_PREFIX}:lastFolder`,
  lastFile: `${STORAGE_PREFIX}:lastFile`,
} as const

export function workspaceJsonKey(workspaceId: string, suffix: string) {
  return `${STORAGE_PREFIX}-${suffix}-${workspaceId}`
}

export function writingStatsKey(workspaceId: string) {
  return `${STORAGE_PREFIX}-writing-stats-${workspaceId}`
}

export function wordTargetKey(workspaceId: string) {
  return `${STORAGE_PREFIX}-word-target-${workspaceId}`
}

export function inspirationFallbackKey(workspaceId: string) {
  return `${STORAGE_PREFIX}-inspiration-${workspaceId}`
}
