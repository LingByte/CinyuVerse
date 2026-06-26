/**
 * File type detection and categorization.
 * Determines how to render a file based on its extension.
 */
export type FileCategory = 'text' | 'image' | 'pdf' | 'spreadsheet' | 'binary'

export interface FileTypeInfo {
  category: FileCategory
  extension: string
  mimeType: string
  /** Whether the file can be edited in CodeMirror */
  editable: boolean
}

const TEXT_EXTS = new Set([
  'md', 'txt', 'markdown', 'mdown',
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'js', 'ts', 'jsx', 'tsx', 'vue', 'svelte',
  'html', 'htm', 'css', 'scss', 'less',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs',
  'sh', 'bash', 'zsh', 'ps1',
  'sql', 'graphql',
  'env', 'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
  'csv', 'tsv',
  'log', 'lock',
])

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
])

const PDF_EXTS = new Set(['pdf'])

const SPREADSHEET_EXTS = new Set(['xlsx', 'xls'])

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

import { isStoryChapterPath } from '@/core/types/story'

export function getExt(filePath: string): string {
  if (isStoryChapterPath(filePath)) return 'md'
  return (filePath.split('.').pop() || '').toLowerCase()
}

export function detectFileType(filePath: string): FileTypeInfo {
  if (isStoryChapterPath(filePath)) {
    return {
      category: 'text',
      extension: 'md',
      mimeType: 'text/markdown',
      editable: true,
    }
  }

  const ext = getExt(filePath)

  if (IMAGE_EXTS.has(ext)) {
    return {
      category: 'image',
      extension: ext,
      mimeType: IMAGE_MIME_TYPES[ext] || 'image/' + ext,
      editable: false,
    }
  }

  if (PDF_EXTS.has(ext)) {
    return {
      category: 'pdf',
      extension: ext,
      mimeType: 'application/pdf',
      editable: false,
    }
  }

  if (SPREADSHEET_EXTS.has(ext)) {
    return {
      category: 'spreadsheet',
      extension: ext,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      editable: false,
    }
  }

  if (TEXT_EXTS.has(ext)) {
    return {
      category: 'text',
      extension: ext,
      mimeType: 'text/plain',
      editable: true,
    }
  }

  return {
    category: 'binary',
    extension: ext,
    mimeType: 'application/octet-stream',
    editable: false,
  }
}

export function isText(filePath: string): boolean {
  return TEXT_EXTS.has(getExt(filePath))
}

export function isImage(filePath: string): boolean {
  return IMAGE_EXTS.has(getExt(filePath))
}

export function isPdf(filePath: string): boolean {
  return PDF_EXTS.has(getExt(filePath))
}

export function isSpreadsheet(filePath: string): boolean {
  return SPREADSHEET_EXTS.has(getExt(filePath))
}

/**
 * Parse CSV/TSV text content into a 2D string array.
 */
export function parseDelimited(
  text: string,
  delimiter: ',' | '\t' = ','
): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  for (const line of lines) {
    const cols: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === delimiter) {
          cols.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    cols.push(current.trim())
    rows.push(cols)
  }
  return rows
}
