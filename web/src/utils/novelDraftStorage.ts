export type NovelId = number | string

export interface NovelVolume {
  id: string
  title: string
  createdAt: number
}

export interface NovelChapter {
  id: string
  volumeId: string
  title: string
  markdown: string
  createdAt: number
  updatedAt: number
}

export interface NovelDraftState {
  volumes: NovelVolume[]
  chapters: NovelChapter[]
}

const STORAGE_PREFIX = 'novelDraft_v1:'

const createId = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

const getKey = (novelId: NovelId) => `${STORAGE_PREFIX}${String(novelId)}`

export const loadNovelDraftState = (novelId: NovelId): NovelDraftState => {
  const raw = window.localStorage.getItem(getKey(novelId))
  if (!raw) return { volumes: [], chapters: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<NovelDraftState> | null
    return {
      volumes: Array.isArray(parsed?.volumes) ? (parsed!.volumes as NovelVolume[]) : [],
      chapters: Array.isArray(parsed?.chapters) ? (parsed!.chapters as NovelChapter[]) : [],
    }
  } catch {
    return { volumes: [], chapters: [] }
  }
}

export const saveNovelDraftState = (novelId: NovelId, state: NovelDraftState) => {
  window.localStorage.setItem(getKey(novelId), JSON.stringify(state))
}

export const ensureActiveVolumeAndChapter = (
  novelId: NovelId,
  volumeId?: string | null,
  chapterId?: string | null,
) => {
  const state = loadNovelDraftState(novelId)
  const activeVolume = state.volumes.find((v) => v.id === volumeId) ?? state.volumes[0]
  const activeChapter =
    state.chapters.find((c) => c.id === chapterId) ??
    state.chapters.find((c) => c.volumeId === activeVolume?.id) ??
    state.chapters[0]
  return { state, activeVolumeId: activeVolume?.id ?? null, activeChapterId: activeChapter?.id ?? null }
}

export const createNovelVolume = (novelId: NovelId, title: string) => {
  const state = loadNovelDraftState(novelId)
  const vol: NovelVolume = { id: createId(), title, createdAt: Date.now() }
  state.volumes.push(vol)
  saveNovelDraftState(novelId, state)
  return vol
}

export const deleteNovelVolume = (novelId: NovelId, volumeId: string) => {
  const state = loadNovelDraftState(novelId)
  state.volumes = state.volumes.filter((v) => v.id !== volumeId)
  state.chapters = state.chapters.filter((c) => c.volumeId !== volumeId)
  saveNovelDraftState(novelId, state)
}

export const createNovelChapter = (novelId: NovelId, volumeId: string, title: string) => {
  const state = loadNovelDraftState(novelId)
  const chapter: NovelChapter = {
    id: createId(),
    volumeId,
    title,
    markdown: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  state.chapters.push(chapter)
  saveNovelDraftState(novelId, state)
  return chapter
}

export const deleteNovelChapter = (novelId: NovelId, chapterId: string) => {
  const state = loadNovelDraftState(novelId)
  state.chapters = state.chapters.filter((c) => c.id !== chapterId)
  saveNovelDraftState(novelId, state)
}

export const updateNovelVolumeTitle = (novelId: NovelId, volumeId: string, title: string) => {
  const state = loadNovelDraftState(novelId)
  const volume = state.volumes.find((v) => v.id === volumeId)
  if (!volume) return
  volume.title = title
  saveNovelDraftState(novelId, state)
}

export const updateNovelChapterTitle = (novelId: NovelId, chapterId: string, title: string) => {
  const state = loadNovelDraftState(novelId)
  const chapter = state.chapters.find((c) => c.id === chapterId)
  if (!chapter) return
  chapter.title = title
  chapter.updatedAt = Date.now()
  saveNovelDraftState(novelId, state)
}

export const updateNovelChapterMarkdown = (novelId: NovelId, chapterId: string, markdown: string) => {
  const state = loadNovelDraftState(novelId)
  const chapter = state.chapters.find((c) => c.id === chapterId)
  if (!chapter) return
  chapter.markdown = markdown
  chapter.updatedAt = Date.now()
  saveNovelDraftState(novelId, state)
}

export const getNovelChapterMarkdown = (novelId: NovelId, chapterId: string) => {
  const state = loadNovelDraftState(novelId)
  return state.chapters.find((c) => c.id === chapterId)?.markdown ?? ''
}

export const getNovelVolumeTitle = (novelId: NovelId, volumeId: string) => {
  const state = loadNovelDraftState(novelId)
  return state.volumes.find((v) => v.id === volumeId)?.title ?? ''
}

