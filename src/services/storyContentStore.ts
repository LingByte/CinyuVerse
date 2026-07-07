/**
 * Local persistence for story books — frontend owns all content storage.
 * Backend (Go) is compute-only; data syncs via BookState on AI operations.
 */
import type { BookConfig, BookState, ChapterMeta, ChapterWithContent } from '@/core/types/story'
import { STORAGE_PREFIX } from '@/core/storage/keys'

const LIBRARY_KEY = `${STORAGE_PREFIX}:story-library`

interface StoryLibrary {
  version: 1
  books: Record<string, BookState>
}

function emptyLibrary(): StoryLibrary {
  return { version: 1, books: {} }
}

function loadLibrary(): StoryLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return emptyLibrary()
    const parsed = JSON.parse(raw) as StoryLibrary
    if (parsed?.version === 1 && parsed.books && typeof parsed.books === 'object') {
      return parsed
    }
  } catch {
    // ignore corrupt data
  }
  return emptyLibrary()
}

function saveLibrary(lib: StoryLibrary) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib))
}

export function listLocalBooks(): BookConfig[] {
  const lib = loadLibrary()
  return Object.values(lib.books)
    .map((s) => s.config)
    .filter((c) => c?.id)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
}

export function getLocalBookState(bookId: string): BookState | null {
  return loadLibrary().books[bookId] ?? null
}

export function saveLocalBookState(state: BookState) {
  const lib = loadLibrary()
  lib.books[state.config.id] = state
  saveLibrary(lib)
}

export function deleteLocalBook(bookId: string) {
  const lib = loadLibrary()
  delete lib.books[bookId]
  saveLibrary(lib)
}

export function listLocalChapters(bookId: string): ChapterMeta[] {
  const state = getLocalBookState(bookId)
  if (!state) return []
  return state.chapters
    .map((c) => c.meta)
    .sort((a, b) => a.number - b.number)
}

export function getLocalChapter(bookId: string, num: number): ChapterWithContent | null {
  const state = getLocalBookState(bookId)
  if (!state) return null
  return state.chapters.find((c) => c.meta.number === num) ?? null
}

export function saveLocalChapter(
  bookId: string,
  meta: ChapterMeta,
  content: string,
): ChapterMeta {
  const lib = loadLibrary()
  const state = lib.books[bookId]
  if (!state) throw new Error('书籍不存在于本地库')
  const idx = state.chapters.findIndex((c) => c.meta.number === meta.number)
  const entry: ChapterWithContent = { meta, content }
  if (idx >= 0) {
    state.chapters[idx] = entry
  } else {
    state.chapters.push(entry)
  }
  state.chapters.sort((a, b) => a.meta.number - b.meta.number)
  state.config.updatedAt = new Date().toISOString()
  saveLibrary(lib)
  return meta
}

export function mergeBookState(state: BookState) {
  saveLocalBookState(state)
}
