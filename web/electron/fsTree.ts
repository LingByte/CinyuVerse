import fs from 'node:fs'
import path from 'node:path'

export interface FsNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FsNode[]
}

/** Supported extensions for all viewable file types */
export const VIEWABLE_EXTS = new Set([
  // Text / Markdown
  '.md', '.txt', '.markdown', '.mdown',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.less',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.sh', '.bash', '.zsh', '.ps1',
  '.sql', '.graphql',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
  // Documents
  '.pdf',
  // Spreadsheets / Data
  '.csv', '.tsv',
  '.xlsx', '.xls',
  // Config
  '.env', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc',
])

const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.git', 'dist', 'dist-electron'])

function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

export function buildDirTree(dirPath: string): FsNode {
  const name = path.basename(dirPath)
  const node: FsNode = { name, path: dirPath, isDirectory: true, children: [] }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return node
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue
      node.children!.push(buildDirTree(fullPath))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!VIEWABLE_EXTS.has(ext)) continue
      node.children!.push({ name: entry.name, path: fullPath, isDirectory: false })
    }
  }

  return node
}

export function isEditableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ['.md', '.txt', '.markdown', '.mdown',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
    '.html', '.htm', '.css', '.scss', '.less',
    '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.sh', '.bash', '.zsh', '.ps1',
    '.sql', '.graphql',
    '.csv', '.tsv',
    '.env', '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc',
  ].includes(ext)
}

export function isTextFile(filePath: string): boolean {
  return isEditableFile(filePath)
}

export function isImageFile(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(
    path.extname(filePath).toLowerCase()
  )
}

export function isBinaryFile(filePath: string): boolean {
  return !isTextFile(filePath)
}
