export interface FsNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FsNode[]
}

export interface OpenFileResult {
  path: string
  name: string
  content: string
  encoding?: 'utf8' | 'base64'
}

export interface FileContent {
  content: string
  encoding: 'utf8' | 'base64'
}

export interface ElectronAPI {
  platform: () => Promise<string>
  getAppPath: () => Promise<string>
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[] | string | null>
  saveFile: (options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }) => Promise<string | null>
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[]>
  openFolder: () => Promise<string | null>
  listDirTree: (folderPath: string) => Promise<FsNode | null>
  readFile: (filePath: string) => Promise<string | FileContent>
  writeFile: (filePath: string, content: string) => Promise<void>
  createFile: (parentPath: string, fileName: string) => Promise<string>
  createDir: (parentPath: string, dirName: string) => Promise<string>
  deletePath: (targetPath: string) => Promise<void>
  dirname: (filePath: string) => Promise<string>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  openInspirationWindow?: (wsId: string) => Promise<void>
  listInspiration?: (wsId: string) => Promise<{ id: string; content: string; created_at: string }[]>
  addInspiration?: (wsId: string, note: { id: string; content: string; created_at: string }) => Promise<{ id: string; content: string; created_at: string }[]>
  onInspirationSaved?: (cb: () => void) => void
  onOpenFile?: (cb: (filePath: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
