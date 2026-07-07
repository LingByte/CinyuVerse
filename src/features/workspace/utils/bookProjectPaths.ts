/** On-disk book project layout (client-owned index, Go backend compute-only). */

export const CINYU_DIR = 'cinyuverse'

export interface BookIndexFile {
  version: 1
  kind: 'book' | 'library'
}

export interface LibraryIndexFile extends BookIndexFile {
  kind: 'library'
  activeBookId?: string
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return [base, ...parts].join(sep).replace(/[/\\]+/g, sep)
}

export function metaDir(root: string) {
  return joinPath(root, CINYU_DIR)
}

export function bookJsonPath(root: string) {
  return joinPath(metaDir(root), 'book.json')
}

export function chaptersJsonPath(root: string) {
  return joinPath(metaDir(root), 'chapters.json')
}

export function indexJsonPath(root: string) {
  return joinPath(metaDir(root), 'index.json')
}

export function chaptersDir(root: string) {
  return joinPath(root, 'chapters')
}

export function storyDir(root: string) {
  return joinPath(root, 'story')
}

export function chapterFilePath(root: string, fileName: string) {
  return joinPath(chaptersDir(root), fileName)
}

export function storyDocPath(root: string, rel: string) {
  return joinPath(storyDir(root), rel)
}

export function slugifyTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return 'book'
  const out = trimmed
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return out || 'book'
}

export function chapterFileName(number: number, title: string): string {
  const safe = slugifyTitle(title) || 'untitled'
  return `${String(number).padStart(4, '0')}-${safe}.md`
}
