import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BookConfig, BookState, ChapterMeta } from '@/core/types/story'
import * as storyApi from '@/services/storyApi'
import * as contentStore from '@/services/storyContentStore'
import { loadBookState, saveBookState, saveChapterToDisk } from '@/services/bookProjectStore'

export const useStoryStore = defineStore('story', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const lastError = ref('')
  const baseUrl = ref(storyApi.getBaseUrl())

  const books = ref<BookConfig[]>([])
  const currentBookId = ref<string | null>(null)
  const chapters = ref<ChapterMeta[]>([])
  const loadingBooks = ref(false)
  const loadingChapters = ref(false)
  const writing = ref(false)
  const agentRunning = ref(false)
  const busy = computed(() => writing.value || agentRunning.value)

  /** When set, book data lives on disk at this folder root. */
  const folderRoot = ref<string | null>(null)

  const currentBook = computed(() =>
    books.value.find((b) => b.id === currentBookId.value) ?? null,
  )

  function bindFolder(root: string, state: BookState) {
    folderRoot.value = root
    currentBookId.value = state.config.id
    books.value = [state.config]
    chapters.value = state.chapters.map((c) => c.meta).sort((a, b) => a.number - b.number)
  }

  function unbindFolder() {
    folderRoot.value = null
    currentBookId.value = null
    books.value = []
    chapters.value = []
  }

  async function getBookState(): Promise<BookState | null> {
    if (folderRoot.value) {
      try {
        return await loadBookState(folderRoot.value)
      } catch {
        return null
      }
    }
    if (currentBookId.value) {
      return contentStore.getLocalBookState(currentBookId.value)
    }
    return null
  }

  async function persistState(state: BookState) {
    if (folderRoot.value) {
      await saveBookState(folderRoot.value, state)
    } else {
      contentStore.mergeBookState(state)
    }
    bindFolder(folderRoot.value ?? state.config.id, state)
  }

  function loadBooksFromLocal() {
    if (folderRoot.value) return
    books.value = contentStore.listLocalBooks()
    if (currentBookId.value && !books.value.some((b) => b.id === currentBookId.value)) {
      currentBookId.value = books.value[0]?.id ?? null
    }
    if (!currentBookId.value && books.value.length > 0) {
      currentBookId.value = books.value[0].id
    }
  }

  function loadChaptersFromLocal(bookId: string) {
    if (folderRoot.value) return
    chapters.value = contentStore.listLocalChapters(bookId)
  }

  async function ping() {
    connecting.value = true
    lastError.value = ''
    try {
      await storyApi.healthCheck()
      connected.value = true
      return true
    } catch (e: unknown) {
      connected.value = false
      lastError.value = e instanceof Error ? e.message : '后端连接失败'
      return false
    } finally {
      connecting.value = false
    }
  }

  async function fetchBooks() {
    loadingBooks.value = true
    lastError.value = ''
    try {
      loadBooksFromLocal()
    } finally {
      loadingBooks.value = false
    }
  }

  async function selectBook(bookId: string) {
    currentBookId.value = bookId
    await fetchChapters(bookId)
  }

  async function fetchChapters(bookId: string) {
    loadingChapters.value = true
    lastError.value = ''
    try {
      if (folderRoot.value) {
        const state = await loadBookState(folderRoot.value)
        chapters.value = state.chapters.map((c) => c.meta)
      } else {
        loadChaptersFromLocal(bookId)
      }
    } finally {
      loadingChapters.value = false
    }
  }

  /** Create book on disk at parentDir; AI foundation runs in background when backend connected. */
  async function createBookOnDisk(
    parentDir: string,
    title: string,
    brief = '',
    genre = 'xuanhuan',
  ) {
    writing.value = true
    lastError.value = ''
    try {
      const { createBookFolder, emptyBookState, loadBookState, enrichBookFromBackend } = await import('@/services/bookProjectStore')
      const root = await createBookFolder(parentDir, title, emptyBookState(title))
      const loaded = await loadBookState(root)
      bindFolder(root, loaded)
      if (connected.value && brief.trim()) {
        void enrichBookFromBackend(root, title, brief, genre)
          .then(async (state) => {
            bindFolder(root, state)
          })
          .catch(() => {
            // local book already created
          })
      }
      return root
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '创建书籍失败'
      throw e
    } finally {
      writing.value = false
    }
  }

  async function createBook(title: string, brief = '', genre = 'xuanhuan') {
    if (!connected.value) throw new Error('请先打开或新建书籍文件夹，或连接后端以生成设定')
    writing.value = true
    lastError.value = ''
    try {
      const result = await storyApi.createBook({ title, brief, genre, language: 'zh' })
      if (folderRoot.value) {
        await persistState(result.state)
      } else {
        contentStore.mergeBookState(result.state)
        loadBooksFromLocal()
        currentBookId.value = result.book.id
        loadChaptersFromLocal(result.book.id)
      }
      return result.book
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '创建书籍失败'
      throw e
    } finally {
      writing.value = false
    }
  }

  async function loadChapter(bookId: string, num: number) {
    if (folderRoot.value) {
      const state = await loadBookState(folderRoot.value)
      const ch = state.chapters.find((c) => c.meta.number === num)
      if (!ch) throw new Error('章节不存在')
      return { meta: ch.meta, content: ch.content }
    }
    const ch = contentStore.getLocalChapter(bookId, num)
    if (!ch) throw new Error('章节不存在')
    return { meta: ch.meta, content: ch.content }
  }

  async function saveChapter(bookId: string, num: number, title: string, content: string) {
    const wordCount = content.replace(/\s/g, '').length
    if (folderRoot.value) {
      const state = await loadBookState(folderRoot.value)
      const existing = state.chapters.find((c) => c.meta.number === num)
      const meta: ChapterMeta = {
        number: num,
        title,
        wordCount,
        status: existing?.meta.status ?? 'ready-for-review',
        fileName: existing?.meta.fileName ?? `${String(num).padStart(4, '0')}-${title}.md`,
        updatedAt: new Date().toISOString(),
      }
      await saveChapterToDisk(folderRoot.value, meta, content)
      await fetchChapters(bookId)
      return meta
    }
    const existing = contentStore.getLocalChapter(bookId, num)
    const meta = contentStore.saveLocalChapter(bookId, {
      number: num,
      title,
      wordCount,
      status: existing?.meta.status ?? 'ready-for-review',
      fileName: existing?.meta.fileName ?? `${String(num).padStart(4, '0')}-${title}.md`,
      updatedAt: new Date().toISOString(),
    }, content)
    if (bookId === currentBookId.value) {
      loadChaptersFromLocal(bookId)
    }
    return meta
  }

  async function writeNext(guidance?: string, wordCount?: number) {
    if (!currentBookId.value) throw new Error('未打开书籍')
    if (!connected.value) throw new Error('后端未连接')
    const state = await getBookState()
    if (!state) throw new Error('无书籍数据')
    writing.value = true
    lastError.value = ''
    try {
      const out = await storyApi.writeNextChapter(currentBookId.value, { guidance, wordCount, state })
      await persistState(out.state)
      return out
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '写章失败'
      throw e
    } finally {
      writing.value = false
    }
  }

  async function planChapter(guidance?: string) {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    try {
      return await storyApi.planChapter(currentBookId.value, guidance)
    } finally {
      writing.value = false
    }
  }

  async function askAgent(instruction: string, bookId?: string, language = 'zh') {
    const id = bookId ?? currentBookId.value
    if (!id) throw new Error('未选择书籍')
    agentRunning.value = true
    lastError.value = ''
    try {
      return await storyApi.sendAgentInstruction({ bookId: id, instruction, language })
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : 'Agent 请求失败'
      throw e
    } finally {
      agentRunning.value = false
    }
  }

  async function loadAgentSession(bookId?: string) {
    const id = bookId ?? currentBookId.value
    if (!id) return []
    const session = await storyApi.getInteractionSession(id)
    return session.messages.filter((m) => m.role !== 'system')
  }

  async function auditChapter(chapter: number) {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    try {
      return await storyApi.auditChapter(currentBookId.value, chapter)
    } finally {
      writing.value = false
    }
  }

  async function reviseChapter(chapter: number, mode = 'auto') {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    try {
      return await storyApi.reviseChapter(currentBookId.value, chapter, { mode })
    } finally {
      writing.value = false
    }
  }

  async function polishChapter(chapter?: number, content?: string) {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    try {
      return await storyApi.polishChapter(currentBookId.value, chapter, content)
    } finally {
      writing.value = false
    }
  }

  async function draftChapter(guidance?: string, wordCount?: number) {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    try {
      return await storyApi.draftChapter(currentBookId.value, { guidance, wordCount })
    } finally {
      writing.value = false
    }
  }

  async function init() {
    loadBooksFromLocal()
    return ping()
  }

  return {
    connected,
    connecting,
    lastError,
    baseUrl,
    books,
    currentBookId,
    currentBook,
    chapters,
    folderRoot,
    loadingBooks,
    loadingChapters,
    writing,
    agentRunning,
    busy,
    ping,
    init,
    bindFolder,
    unbindFolder,
    fetchBooks,
    selectBook,
    fetchChapters,
    createBook,
    createBookOnDisk,
    loadChapter,
    saveChapter,
    writeNext,
    planChapter,
    draftChapter,
    auditChapter,
    reviseChapter,
    polishChapter,
    askAgent,
    loadAgentSession,
    getBookState,
    persistState,
  }
})
