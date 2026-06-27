import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 大纲 ↔ 文件树折叠状态双向同步 */
export const useShellSyncStore = defineStore('shellSync', () => {
  const collapsedDirs = ref<Set<string>>(new Set())
  const collapsedOutlineVols = ref<Set<string>>(new Set())
  /** 目录路径 → 分卷 id */
  const dirToVolMap = ref<Map<string, string>>(new Map())

  const metaFocus = ref<{
    tab: 'characters' | 'glossary'
    id: string
  } | null>(null)

  function setDirCollapsed(path: string, collapsed: boolean) {
    const next = new Set(collapsedDirs.value)
    if (collapsed) next.add(path)
    else next.delete(path)
    collapsedDirs.value = next
  }

  function toggleDir(path: string) {
    const collapsed = !collapsedDirs.value.has(path)
    setDirCollapsed(path, collapsed)
    syncVolFromDir(path, collapsed)
  }

  function isDirCollapsed(path: string) {
    return collapsedDirs.value.has(path)
  }

  function registerVolDir(volId: string, dirPath: string | null) {
    if (!dirPath) return
    const next = new Map(dirToVolMap.value)
    next.set(normalizePath(dirPath), volId)
    dirToVolMap.value = next
  }

  function normalizePath(p: string) {
    return p.replace(/\\/g, '/').toLowerCase()
  }

  function syncVolFromDir(dirPath: string, collapsed: boolean) {
    const volId = dirToVolMap.value.get(normalizePath(dirPath))
    if (volId) setVolCollapsed(volId, collapsed)
  }

  function setVolCollapsed(volId: string, collapsed: boolean) {
    const next = new Set(collapsedOutlineVols.value)
    if (collapsed) next.add(volId)
    else next.delete(volId)
    collapsedOutlineVols.value = next
  }

  function toggleVol(volId: string, dirPath?: string | null) {
    const collapsed = !collapsedOutlineVols.value.has(volId)
    setVolCollapsed(volId, collapsed)
    if (dirPath) setDirCollapsed(dirPath, collapsed)
  }

  function isVolCollapsed(volId: string) {
    return collapsedOutlineVols.value.has(volId)
  }

  function focusCharacter(id: string) {
    metaFocus.value = { tab: 'characters', id }
  }

  function focusGlossary(id: string) {
    metaFocus.value = { tab: 'glossary', id }
  }

  function clearMetaFocus() {
    metaFocus.value = null
  }

  function reset() {
    collapsedDirs.value = new Set()
    collapsedOutlineVols.value = new Set()
    dirToVolMap.value = new Map()
    metaFocus.value = null
  }

  return {
    collapsedDirs,
    collapsedOutlineVols,
    dirToVolMap,
    metaFocus,
    setDirCollapsed,
    toggleDir,
    isDirCollapsed,
    registerVolDir,
    syncVolFromDir,
    setVolCollapsed,
    toggleVol,
    isVolCollapsed,
    focusCharacter,
    focusGlossary,
    clearMetaFocus,
    reset,
  }
})
