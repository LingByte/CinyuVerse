import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BookConfig, ChapterMeta } from '@/core/types/story'
import * as storyApi from '@/services/storyApi'

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

  const currentBook = computed(() =>
    books.value.find((b) => b.id === currentBookId.value) ?? null,
  )

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
      const list = await storyApi.listBooks()
      books.value = Array.isArray(list) ? list : []
      if (currentBookId.value && !books.value.some((b) => b.id === currentBookId.value)) {
        currentBookId.value = books.value[0]?.id ?? null
      }
      if (!currentBookId.value && books.value.length > 0) {
        currentBookId.value = books.value[0].id
      }
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '加载书籍失败'
      throw e
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
      const list = await storyApi.listChapters(bookId)
      chapters.value = Array.isArray(list) ? list : []
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '加载章节失败'
      throw e
    } finally {
      loadingChapters.value = false
    }
  }

  async function createBook(title: string, brief = '', genre = 'xuanhuan') {
    writing.value = true
    lastError.value = ''
    try {
      const book = await storyApi.createBook({ title, brief, genre, language: 'zh' })
      const current = Array.isArray(books.value) ? books.value : []
      books.value = [...current, book]
      currentBookId.value = book.id
      chapters.value = []
      return book
    } catch (e: unknown) {
      lastError.value = e instanceof Error ? e.message : '创建书籍失败'
      throw e
    } finally {
      writing.value = false
    }
  }

  async function loadChapter(bookId: string, num: number) {
    return storyApi.getChapter(bookId, num)
  }

  async function saveChapter(bookId: string, num: number, title: string, content: string) {
    const meta = await storyApi.saveChapter(bookId, num, title, content)
    chapters.value = chapters.value.map((c) => (c.number === num ? meta : c))
    return meta
  }

  async function writeNext(guidance?: string, wordCount?: number) {
    if (!currentBookId.value) throw new Error('未选择书籍')
    writing.value = true
    lastError.value = ''
    try {
      const out = await storyApi.writeNextChapter(currentBookId.value, { guidance, wordCount })
      await fetchChapters(currentBookId.value)
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
    const ok = await ping()
    if (ok) await fetchBooks().catch(() => {})
    return ok
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
    loadingBooks,
    loadingChapters,
    writing,
    agentRunning,
    busy,
    ping,
    init,
    fetchBooks,
    selectBook,
    fetchChapters,
    createBook,
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
  }
})
