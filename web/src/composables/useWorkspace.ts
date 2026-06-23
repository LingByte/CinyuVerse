import { ref, shallowRef } from 'vue'
import * as api from '@/api/ide'
import type { WorkspaceDetail, WorkspaceItem, VolumeItem, ChapterItem } from '@/api/ide'

export function useWorkspace() {
  const workspaces = ref<WorkspaceItem[]>([])
  const currentWorkspace = shallowRef<WorkspaceDetail | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function loadWorkspaces() {
    try {
      workspaces.value = await api.listWorkspaces()
    } catch {
      error.value = '加载工作区列表失败'
    }
  }

  async function openWorkspace(id: string) {
    loading.value = true
    try {
      currentWorkspace.value = await api.getWorkspace(id)
    } catch {
      error.value = '加载工作区失败'
    } finally {
      loading.value = false
    }
  }

  async function create(book_name: string) {
    try {
      const ws = await api.createWorkspace(book_name)
      workspaces.value.push(ws)
      return ws
    } catch {
      error.value = '创建工作区失败'
      return null
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteWorkspace(id)
      workspaces.value = workspaces.value.filter((w) => w.id !== id)
    } catch {
      error.value = '删除工作区失败'
    }
  }

  // ── Volumes ──────────────────────────────────────────────

  async function addVolume(title: string) {
    if (!currentWorkspace.value) return null
    try {
      const vol = await api.createVolume(currentWorkspace.value.id, title)
      const detail: any = { ...vol, chapters: [] }
      currentWorkspace.value.volumes.push(detail)
      return vol
    } catch {
      error.value = '创建卷失败'
      return null
    }
  }

  async function removeVolume(volId: string) {
    if (!currentWorkspace.value) return
    try {
      await api.deleteVolume(currentWorkspace.value.id, volId)
      await openWorkspace(currentWorkspace.value.id)
    } catch {
      error.value = '删除卷失败'
    }
  }

  // ── Chapters ─────────────────────────────────────────────

  async function addChapter(volId: string, title: string) {
    if (!currentWorkspace.value) return null
    try {
      const ch = await api.createChapter(currentWorkspace.value.id, volId, title)
      const vol = currentWorkspace.value.volumes.find((v) => v.id === volId)
      if (vol) vol.chapters.push(ch)
      return ch
    } catch {
      error.value = '创建章节失败'
      return null
    }
  }

  async function removeChapter(volId: string, chId: string) {
    if (!currentWorkspace.value) return
    try {
      await api.deleteChapter(currentWorkspace.value.id, volId, chId)
      await openWorkspace(currentWorkspace.value.id)
    } catch {
      error.value = '删除章节失败'
    }
  }

  async function restoreTrashItem(trashId: string) {
    if (!currentWorkspace.value) return
    try {
      await api.restoreTrash(currentWorkspace.value.id, trashId)
      await openWorkspace(currentWorkspace.value.id)
    } catch {
      error.value = '恢复失败'
    }
  }

  async function loadTrash() {
    if (!currentWorkspace.value) return []
    try {
      return await api.listTrash(currentWorkspace.value.id)
    } catch {
      error.value = '加载回收站失败'
      return []
    }
  }

  async function loadCharacters() {
    if (!currentWorkspace.value) return []
    return api.getCharacters(currentWorkspace.value.id)
  }

  async function saveCharacters(cards: api.CharacterCard[]) {
    if (!currentWorkspace.value) return []
    return api.saveCharacters(currentWorkspace.value.id, cards)
  }

  async function loadGlossary() {
    if (!currentWorkspace.value) return []
    return api.getGlossary(currentWorkspace.value.id)
  }

  async function saveGlossary(entries: api.GlossaryEntry[]) {
    if (!currentWorkspace.value) return []
    return api.saveGlossary(currentWorkspace.value.id, entries)
  }

  async function loadWordStats(target = 0) {
    if (!currentWorkspace.value) return null
    return api.getWordStats(currentWorkspace.value.id, target)
  }

  // ── Chapter Content ──────────────────────────────────────

  async function loadChapterContent(volId: string, chId: string): Promise<string> {
    if (!currentWorkspace.value) return ''
    try {
      return await api.getChapterContent(currentWorkspace.value.id, volId, chId)
    } catch {
      error.value = '加载章节内容失败'
      return ''
    }
  }

  async function saveChapterContent(volId: string, chId: string, content: string) {
    if (!currentWorkspace.value) return
    try {
      await api.saveChapterContent(currentWorkspace.value.id, volId, chId, content)
    } catch {
      error.value = '保存失败'
    }
  }

  return {
    workspaces,
    currentWorkspace,
    loading,
    error,
    loadWorkspaces,
    openWorkspace,
    create,
    remove,
    addVolume,
    removeVolume,
    addChapter,
    removeChapter,
    restoreTrashItem,
    loadTrash,
    loadCharacters,
    saveCharacters,
    loadGlossary,
    saveGlossary,
    loadWordStats,
    loadChapterContent,
    saveChapterContent,
  }
}
