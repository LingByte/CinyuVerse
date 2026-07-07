import { ref, shallowRef } from 'vue'
import type { WorkspaceDetail } from '@/core/types/workspace'
import type { FileContent, FsNode } from '@/core/types/desktop'
import type { BookState, ChapterMeta } from '@/core/types/story'
import { SESSION_KEYS } from '@/core/storage/keys'
import {
  buildLocalSingleFileWorkspace,
  buildLocalWorkspace,
  type LocalFileEntry,
} from '@/features/workspace/utils/localWorkspace'
import { buildBookWorkspace } from '@/features/workspace/utils/buildBookWorkspace'
import {
  createBookFolder,
  createBookInLibrary,
  detectBookContext,
  loadBookState,
  saveBookState,
  type LibraryBookEntry,
} from '@/services/bookProjectStore'

import { desktopApi, requireDesktop } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

function requireAPI() {
  return requireDesktop()
}

export function useWorkspace() {
  const currentWorkspace = shallowRef<WorkspaceDetail | null>(null)
  const tree = shallowRef<FsNode | null>(null)
  const currentFilePath = ref<string | null>(null)
  const folderName = ref('')
  const loading = ref(false)
  const error = ref('')
  const isLocalMode = ref(false)
  const localRootPath = ref<string | null>(null)
  const localFilePaths = ref<Map<string, string>>(new Map())

  /** Folder containing cinyuverse/book.json */
  const bookRootPath = ref<string | null>(null)
  const isBookProject = ref(false)
  const libraryRootPath = ref<string | null>(null)
  const libraryBooks = ref<LibraryBookEntry[]>([])
  const bookChapters = ref<ChapterMeta[]>([])
  const chapterNumToPath = ref<Map<number, string>>(new Map())

  /** Called by storyStore after binding — set via IdeShell */
  let onBookBound: ((root: string, state: BookState) => void) | null = null

  function setBookBoundHandler(fn: (root: string, state: BookState) => void) {
    onBookBound = fn
  }

  function resolveLocalPath(chId: string): string | null {
    return localFilePaths.value.get(chId) ?? chId
  }

  function chapterPath(num: number): string | null {
    return chapterNumToPath.value.get(num) ?? null
  }

  async function refreshTree() {
    if (!localRootPath.value) {
      tree.value = null
      return
    }
    tree.value = await requireAPI().listDirTree(localRootPath.value)
  }

  async function rebuildWorkspaceMetadata(folderPath: string) {
    if (!isDesktop()) return
    if (isBookProject.value && bookRootPath.value) {
      const state = await loadBookState(bookRootPath.value)
      const { workspace, filePaths, chapterPaths } = buildBookWorkspace(bookRootPath.value, state)
      currentWorkspace.value = workspace
      localFilePaths.value = filePaths
      chapterNumToPath.value = chapterPaths
      bookChapters.value = state.chapters.map((c) => c.meta)
      onBookBound?.(bookRootPath.value, state)
      return
    }
    const files = (await desktopApi.scanFolder(folderPath)) as LocalFileEntry[]
    const { workspace, filePaths } = buildLocalWorkspace(folderPath, files)
    currentWorkspace.value = workspace
    localFilePaths.value = filePaths
    bookChapters.value = []
    chapterNumToPath.value = new Map()
  }

  async function bindBookProject(bookRoot: string) {
    bookRootPath.value = bookRoot
    isBookProject.value = true
    folderName.value = bookRoot.split(/[/\\]/).pop() || bookRoot
    const state = await loadBookState(bookRoot)
    const { workspace, filePaths, chapterPaths } = buildBookWorkspace(bookRoot, state)
    currentWorkspace.value = workspace
    localFilePaths.value = filePaths
    chapterNumToPath.value = chapterPaths
    bookChapters.value = state.chapters.map((c) => c.meta)
    onBookBound?.(bookRoot, state)
  }

  async function resolveAndBindBook(folderPath: string) {
    const ctx = await detectBookContext(folderPath)
    if (ctx.type === 'book') {
      libraryRootPath.value = null
      libraryBooks.value = []
      await bindBookProject(ctx.root)
      return
    }
    if (ctx.type === 'library') {
      libraryRootPath.value = ctx.root
      libraryBooks.value = ctx.books
      isBookProject.value = false
      bookRootPath.value = null
      bookChapters.value = []
      if (ctx.books.length === 1) {
        await openBookInLibrary(ctx.books[0].path)
      }
      return
    }
    isBookProject.value = false
    bookRootPath.value = null
    libraryRootPath.value = null
    libraryBooks.value = []
    bookChapters.value = []
    chapterNumToPath.value = new Map()
  }

  async function openBookInLibrary(bookPath: string) {
    localRootPath.value = bookPath
    isLocalMode.value = true
    localStorage.setItem(SESSION_KEYS.lastFolder, bookPath)
    tree.value = await requireAPI().listDirTree(bookPath)
    await bindBookProject(bookPath)
    error.value = ''
  }

  async function openLocalFolder(folderPath?: string): Promise<boolean> {
    loading.value = true
    try {
      const picked = folderPath ?? await requireAPI().openFolder()
      if (!picked) return false

      isLocalMode.value = true
      localRootPath.value = picked
      folderName.value = picked.split(/[/\\]/).pop() || picked
      localStorage.setItem(SESSION_KEYS.lastFolder, picked)

      tree.value = await requireAPI().listDirTree(picked)
      await resolveAndBindBook(picked)
      if (!isBookProject.value) {
        await rebuildWorkspaceMetadata(picked)
      }
      error.value = ''
      return true
    } catch {
      error.value = '打开本地文件夹失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function createBookProject(title: string, brief = ''): Promise<string | null> {
    const parent = await requireAPI().openFolder()
    if (!parent) return null
    loading.value = true
    try {
      const root = await createBookFolder(parent, title)
      void brief
      await openLocalFolder(root)
      return root
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '创建书籍失败'
      return null
    } finally {
      loading.value = false
    }
  }

  async function persistBookState(state: BookState) {
    if (!bookRootPath.value) return
    await saveBookState(bookRootPath.value, state)
    await rebuildWorkspaceMetadata(bookRootPath.value)
  }

  async function openFileByPath(filePath: string): Promise<FileContent> {
    error.value = ''
    const api = requireAPI()
    const parentDir = await api.dirname(filePath)

    if (!localRootPath.value || !filePath.startsWith(localRootPath.value)) {
      localRootPath.value = parentDir
      folderName.value = parentDir.split(/[/\\]/).pop() || parentDir
      localStorage.setItem(SESSION_KEYS.lastFolder, parentDir)
      tree.value = await api.listDirTree(parentDir)
      await resolveAndBindBook(parentDir)
      if (!isBookProject.value) {
        await rebuildWorkspaceMetadata(parentDir)
      }
    }

    currentFilePath.value = filePath
    localStorage.setItem(SESSION_KEYS.lastFile, filePath)
    isLocalMode.value = true

    const result = await api.readFile(filePath)
    if (typeof result === 'string') {
      return { content: result, encoding: 'utf8' }
    }
    return result
  }

  async function openLocalFile(filePath: string, fileName: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<boolean> {
    const parentDir = filePath.replace(/[/\\][^/\\]+$/, '') || filePath
    isLocalMode.value = true
    localRootPath.value = parentDir
    folderName.value = parentDir.split(/[/\\]/).pop() || parentDir
    currentFilePath.value = filePath
    localStorage.setItem(SESSION_KEYS.lastFolder, parentDir)
    localStorage.setItem(SESSION_KEYS.lastFile, filePath)
    isBookProject.value = false
    bookRootPath.value = null

    if (encoding === 'utf8') {
      const { workspace, filePaths } = buildLocalSingleFileWorkspace(filePath, fileName, content)
      currentWorkspace.value = workspace
      localFilePaths.value = filePaths
    } else {
      currentWorkspace.value = {
        id: `local:file:${filePath}`,
        book_name: fileName.replace(/\.[^.]+$/, ''),
        type: '',
        world_view: '',
        character: '',
        outline: '',
        style: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        volumes: [],
      }
    }

    try {
      tree.value = await requireAPI().listDirTree(parentDir)
    } catch {
      tree.value = null
    }
    return true
  }

  async function createFile(parentPath: string, fileName: string) {
    const fullPath = await requireAPI().createFile(parentPath, fileName)
    await refreshTree()
    if (bookRootPath.value) {
      await rebuildWorkspaceMetadata(bookRootPath.value)
    } else if (localRootPath.value) {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
    return fullPath
  }

  async function createDir(parentPath: string, dirName: string) {
    const fullPath = await requireAPI().createDir(parentPath, dirName)
    await refreshTree()
    return fullPath
  }

  async function deletePath(targetPath: string) {
    await requireAPI().deletePath(targetPath)
    if (currentFilePath.value === targetPath) {
      currentFilePath.value = null
    }
    await refreshTree()
    if (bookRootPath.value) {
      await rebuildWorkspaceMetadata(bookRootPath.value)
    } else if (localRootPath.value) {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
  }

  function closeCurrent() {
    isLocalMode.value = false
    localRootPath.value = null
    localFilePaths.value = new Map()
    currentWorkspace.value = null
    tree.value = null
    folderName.value = ''
    currentFilePath.value = null
    bookRootPath.value = null
    isBookProject.value = false
    libraryRootPath.value = null
    libraryBooks.value = []
    bookChapters.value = []
    chapterNumToPath.value = new Map()
    localStorage.removeItem(SESSION_KEYS.lastFolder)
    localStorage.removeItem(SESSION_KEYS.lastFile)
  }

  async function restoreLastSession() {
    const lastFolder = localStorage.getItem(SESSION_KEYS.lastFolder)
    if (!lastFolder) return
    try {
      await openLocalFolder(lastFolder)
      const lastFile = localStorage.getItem(SESSION_KEYS.lastFile)
      if (lastFile) {
        currentFilePath.value = lastFile
      }
    } catch {
      localStorage.removeItem(SESSION_KEYS.lastFolder)
      localStorage.removeItem(SESSION_KEYS.lastFile)
    }
  }

  async function loadChapterContent(_volId: string, chId: string): Promise<string> {
    const filePath = resolveLocalPath(chId)
    if (!filePath) return ''
    try {
      const result = await requireAPI().readFile(filePath)
      return typeof result === 'string' ? result : result.content
    } catch {
      error.value = '读取本地文件失败'
      return ''
    }
  }

  async function saveFileContent(filePath: string, content: string) {
    await requireAPI().writeFile(filePath, content)
    if (bookRootPath.value) {
      await rebuildWorkspaceMetadata(bookRootPath.value)
    } else if (localRootPath.value) {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
  }

  async function refreshLocalFolder() {
    if (!isLocalMode.value || !localRootPath.value) return
    await refreshTree()
    if (bookRootPath.value) {
      await rebuildWorkspaceMetadata(bookRootPath.value)
    } else {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
  }

  return {
    currentWorkspace,
    tree,
    currentFilePath,
    folderName,
    loading,
    error,
    isLocalMode,
    localRootPath,
    bookRootPath,
    isBookProject,
    libraryRootPath,
    libraryBooks,
    bookChapters,
    openLocalFolder,
    openBookInLibrary,
    createBookProject,
    createBookInLibrary,
    persistBookState,
    bindBookProject,
    setBookBoundHandler,
    chapterPath,
    openFileByPath,
    openLocalFile,
    createFile,
    createDir,
    deletePath,
    closeCurrent,
    restoreLastSession,
    refreshTree,
    loadChapterContent,
    saveFileContent,
    refreshLocalFolder,
  }
}
