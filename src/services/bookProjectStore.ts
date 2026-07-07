/**
 * Folder-backed book persistence via Tauri FS.
 * Index: {root}/cinyuverse/book.json + chapters.json + chapters/*.md
 */
import type { BookConfig, BookState, ChapterMeta, ChapterWithContent } from '@/core/types/story'
import { desktopApi } from '@/services/desktopApi'
import {
  bookJsonPath,
  chapterFileName,
  chapterFilePath,
  chaptersJsonPath,
  indexJsonPath,
  joinPath,
  slugifyTitle,
  storyDocPath,
  type BookIndexFile,
  type LibraryIndexFile,
} from '@/features/workspace/utils/bookProjectPaths'

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const result = await desktopApi.readFile(path)
    const text = typeof result === 'string' ? result : result.content
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJsonFile(path: string, data: unknown) {
  await desktopApi.writeFile(path, JSON.stringify(data, null, 2))
}

function stripChapterHeading(raw: string, title: string): string {
  const text = raw.trim()
  if (!text.startsWith('# ')) return text
  const lines = text.split('\n')
  if (lines.length >= 2) return lines.slice(1).join('\n').trim()
  if (title && text === `# ${title}`) return ''
  return text
}

function formatChapterBody(title: string, content: string): string {
  return `# ${title}\n\n${content.trim()}`
}

export function emptyBookState(title: string, id?: string): BookState {
  const now = new Date().toISOString()
  const bookId = id ?? slugifyTitle(title)
  return {
    config: {
      id: bookId,
      title,
      genre: 'xuanhuan',
      language: 'zh',
      chapterWordCount: 3000,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    },
    chapters: [],
    documents: {},
  }
}

export async function isBookProjectRoot(root: string): Promise<boolean> {
  const cfg = await readJsonFile<BookConfig>(bookJsonPath(root))
  return cfg != null && !!cfg.id
}

export async function isLibraryRoot(root: string): Promise<boolean> {
  const idx = await readJsonFile<LibraryIndexFile>(indexJsonPath(root))
  return idx?.kind === 'library'
}

export interface LibraryBookEntry {
  id: string
  title: string
  path: string
}

export async function scanLibraryBooks(projectRoot: string): Promise<LibraryBookEntry[]> {
  const tree = await desktopApi.listDirTree(projectRoot)
  if (!tree?.children) return []
  const booksDir = tree.children.find((c) => c.isDirectory && c.name === 'books')
  if (!booksDir?.children) return []
  const entries: LibraryBookEntry[] = []
  for (const child of booksDir.children) {
    if (!child.isDirectory) continue
    if (!(await isBookProjectRoot(child.path))) continue
    const cfg = await readJsonFile<BookConfig>(bookJsonPath(child.path))
    if (!cfg) continue
    entries.push({ id: cfg.id, title: cfg.title, path: child.path })
  }
  entries.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  return entries
}

export type BookDetectResult =
  | { type: 'book'; root: string }
  | { type: 'library'; root: string; books: LibraryBookEntry[] }
  | { type: 'none' }

/** Resolve whether a folder is a book, a multi-book library, or plain files. */
export async function detectBookContext(folderPath: string): Promise<BookDetectResult> {
  if (await isBookProjectRoot(folderPath)) {
    return { type: 'book', root: folderPath }
  }
  if (await isLibraryRoot(folderPath)) {
    const books = await scanLibraryBooks(folderPath)
    return { type: 'library', root: folderPath, books }
  }
  // opened books/{id} under a library without opening library root
  const parent = folderPath.replace(/[/\\][^/\\]+$/, '')
  if (parent !== folderPath && (await isLibraryRoot(parent))) {
    if (await isBookProjectRoot(folderPath)) {
      return { type: 'book', root: folderPath }
    }
  }
  return { type: 'none' }
}

export async function loadBookState(root: string): Promise<BookState> {
  const config = await readJsonFile<BookConfig>(bookJsonPath(root))
  if (!config) throw new Error('未找到书籍索引 cinyuverse/book.json')
  const chapterIndex = (await readJsonFile<ChapterMeta[]>(chaptersJsonPath(root))) ?? []
  const chapters: ChapterWithContent[] = []
  for (const meta of chapterIndex.sort((a, b) => a.number - b.number)) {
    let content = ''
    if (meta.fileName) {
      try {
        const filePath = chapterFilePath(root, meta.fileName)
        const raw = await desktopApi.readFile(filePath)
        const text = typeof raw === 'string' ? raw : raw.content
        content = stripChapterHeading(text, meta.title)
      } catch {
        content = ''
      }
    }
    chapters.push({ meta, content })
  }
  const documents: Record<string, string> = {}
  const storyKeys = [
    'story/story_bible.md',
    'story/volume_outline.md',
    'story/book_rules.md',
    'story/pending_hooks.md',
    'story/current_state.md',
    'story/author_intent.md',
    'story/current_focus.md',
  ]
  for (const rel of storyKeys) {
    const fileName = rel.replace('story/', '')
    try {
      const raw = await desktopApi.readFile(storyDocPath(root, fileName))
      documents[rel] = typeof raw === 'string' ? raw : raw.content
    } catch {
      // optional doc
    }
  }
  return { config, chapters, documents }
}

export async function saveBookState(root: string, state: BookState): Promise<void> {
  state.config.updatedAt = new Date().toISOString()
  await writeJsonFile(bookJsonPath(root), state.config)
  const metas: ChapterMeta[] = []
  for (const ch of state.chapters) {
    const meta = { ...ch.meta }
    if (!meta.fileName) {
      meta.fileName = chapterFileName(meta.number, meta.title)
    }
    meta.updatedAt = new Date().toISOString()
    const body = formatChapterBody(meta.title, ch.content)
    await desktopApi.writeFile(chapterFilePath(root, meta.fileName), body)
    metas.push(meta)
  }
  metas.sort((a, b) => a.number - b.number)
  await writeJsonFile(chaptersJsonPath(root), metas)
  for (const [rel, content] of Object.entries(state.documents)) {
    if (!rel.startsWith('story/')) continue
    const fileName = rel.slice('story/'.length)
    await desktopApi.writeFile(storyDocPath(root, fileName), content)
  }
}

export async function initBookLayout(root: string, state: BookState): Promise<void> {
  await desktopApi.createDir(root, 'cinyuverse')
  await desktopApi.createDir(root, 'chapters')
  await desktopApi.createDir(root, 'story')
  const index: BookIndexFile = { version: 1, kind: 'book' }
  await writeJsonFile(indexJsonPath(root), index)
  await saveBookState(root, state)
}

export async function initLibraryLayout(projectRoot: string): Promise<void> {
  await desktopApi.createDir(projectRoot, 'cinyuverse')
  await desktopApi.createDir(projectRoot, 'books')
  const index: LibraryIndexFile = { version: 1, kind: 'library' }
  await writeJsonFile(indexJsonPath(projectRoot), index)
}

/** Merge AI-generated foundation from backend into an on-disk book (non-blocking helper). */
export async function enrichBookFromBackend(
  root: string,
  title: string,
  brief: string,
  genre = 'xuanhuan',
): Promise<BookState> {
  const { createBook } = await import('@/services/storyApi')
  const result = await createBook({ title, brief, genre, language: 'zh' })
  const local = await loadBookState(root)
  if (result.state?.documents) {
    local.documents = { ...local.documents, ...result.state.documents }
  }
  if (result.state?.config) {
    local.config = { ...local.config, ...result.state.config, id: local.config.id, title: local.config.title }
  }
  await saveBookState(root, local)
  return local
}

/** Create a new book folder under parentDir (pick location first). */
export async function createBookFolder(
  parentDir: string,
  title: string,
  state?: BookState,
): Promise<string> {
  const folderName = slugifyTitle(title)
  let root = joinPath(parentDir, folderName)
  let suffix = 1
  while (await isBookProjectRoot(root)) {
    root = joinPath(parentDir, `${folderName}-${suffix++}`)
  }
  await desktopApi.createDir(parentDir, root.split(/[/\\]/).pop()!)
  const bookState = state ?? emptyBookState(title)
  bookState.config.title = title
  await initBookLayout(root, bookState)
  return root
}

/** Create book inside library: parent/libraryRoot/books/{id}/ */
export async function createBookInLibrary(
  libraryRoot: string,
  title: string,
  state?: BookState,
): Promise<string> {
  await desktopApi.createDir(libraryRoot, 'books')
  const folderName = slugifyTitle(title)
  let bookRoot = joinPath(libraryRoot, 'books', folderName)
  let suffix = 1
  while (await isBookProjectRoot(bookRoot)) {
    bookRoot = joinPath(libraryRoot, 'books', `${folderName}-${suffix++}`)
  }
  const dirName = bookRoot.split(/[/\\]/).pop()!
  await desktopApi.createDir(joinPath(libraryRoot, 'books'), dirName)
  const bookState = state ?? emptyBookState(title)
  bookState.config.title = title
  await initBookLayout(bookRoot, bookState)
  return bookRoot
}

/** Turn an opened plain folder into a book project (creates index + imports .md chapters). */
export async function convertFolderToBook(root: string, title?: string): Promise<BookState> {
  if (await isBookProjectRoot(root)) {
    return loadBookState(root)
  }
  const folderName = root.split(/[/\\]/).pop() || 'book'
  const state = emptyBookState(title ?? folderName)
  state.config.title = title ?? folderName

  const files = await desktopApi.scanFolder(root)
  const mdFiles = files
    .filter((f) => /\.md$/i.test(f.name))
    .filter((f) => !f.relativePath.startsWith('story/') && !f.relativePath.startsWith('cinyuverse/'))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh'))

  await desktopApi.createDir(root, 'cinyuverse')
  await desktopApi.createDir(root, 'chapters')
  await desktopApi.createDir(root, 'story')

  let num = 1
  for (const file of mdFiles) {
    const chTitle = file.name.replace(/\.(md|markdown)$/i, '')
    const inChapters = file.relativePath.startsWith('chapters/')
    const fileName = inChapters
      ? file.relativePath.slice('chapters/'.length)
      : chapterFileName(num, chTitle)
    const content = stripChapterHeading(file.content, chTitle)
    if (!inChapters) {
      await desktopApi.writeFile(
        chapterFilePath(root, fileName),
        formatChapterBody(chTitle, content),
      )
    }
    state.chapters.push({
      meta: {
        number: num,
        title: chTitle,
        wordCount: content.replace(/\s/g, '').length,
        status: 'ready-for-review',
        fileName,
        updatedAt: new Date().toISOString(),
      },
      content,
    })
    num++
  }

  const index: BookIndexFile = { version: 1, kind: 'book' }
  await writeJsonFile(indexJsonPath(root), index)
  await saveBookState(root, state)
  return state
}

export async function saveChapterToDisk(
  root: string,
  meta: ChapterMeta,
  content: string,
): Promise<ChapterMeta> {
  const state = await loadBookState(root)
  const idx = state.chapters.findIndex((c) => c.meta.number === meta.number)
  const entry: ChapterWithContent = { meta, content }
  if (idx >= 0) state.chapters[idx] = entry
  else state.chapters.push(entry)
  await saveBookState(root, state)
  return meta
}
