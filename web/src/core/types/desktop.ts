/** Desktop API shared types (Tauri ↔ renderer). */

export interface FsNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FsNode[]
}

export interface FileContent {
  content: string
  encoding: 'utf8' | 'base64'
}

export interface FileEntry {
  name: string
  path: string
  relativePath: string
  content: string
}

export interface OpenFileResult {
  path: string
  name: string
  content: string
  encoding?: 'utf8' | 'base64'
}

export interface InspirationNote {
  id: string
  content: string
  created_at: string
}
