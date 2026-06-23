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

export interface ElectronAPI {
  platform: () => Promise<string>
  getAppPath: () => Promise<string>
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  saveFile: (options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }) => Promise<string | null>
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[]>
  openFolder: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<FileEntry[]>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  openInspirationWindow?: (wsId: string) => Promise<void>
  openDetachedPanel?: (panel: 'ai' | 'outline', wsId: string) => Promise<void>
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
