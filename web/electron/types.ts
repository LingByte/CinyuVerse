/** Electron preload ↔ renderer 共享类型（单一来源） */

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

export interface ElectronAPI {
  platform: () => Promise<string>
  getAppPath: () => Promise<string>
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[]>
  saveFile: (options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }) => Promise<string | null>
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[]>
  openFolder: () => Promise<string | null>
  listDirTree: (folderPath: string) => Promise<FsNode | null>
  readFile: (filePath: string) => Promise<FileContent>
  writeFile: (filePath: string, content: string) => Promise<void>
  createFile: (parentPath: string, fileName: string) => Promise<string>
  createDir: (parentPath: string, dirName: string) => Promise<string>
  deletePath: (targetPath: string) => Promise<void>
  dirname: (filePath: string) => Promise<string>
  /** @deprecated use listDirTree + readFile */
  scanFolder: (folderPath: string) => Promise<FileEntry[]>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  openInspirationWindow: (wsId: string) => Promise<void>
  openDetachedPanel: (panel: 'ai' | 'outline', wsId: string) => Promise<void>
  listInspiration: (wsId: string) => Promise<InspirationNote[]>
  addInspiration: (wsId: string, note: InspirationNote) => Promise<InspirationNote[]>
  onInspirationSaved: (cb: () => void) => void
  onOpenFile: (cb: (filePath: string) => void) => void
}
