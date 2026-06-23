import { contextBridge, ipcRenderer } from 'electron'

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
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: () => ipcRenderer.invoke('platform'),
  getAppPath: () => ipcRenderer.invoke('getAppPath'),
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }) =>
    ipcRenderer.invoke('dialog:saveFile', options),
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options) as Promise<OpenFileResult[]>,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
  scanFolder: (folderPath: string) =>
    ipcRenderer.invoke('fs:scanFolder', folderPath) as Promise<FileEntry[]>,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  openInspirationWindow: (wsId: string) => ipcRenderer.invoke('window:openInspiration', wsId),
  openDetachedPanel: (panel: 'ai' | 'outline', wsId: string) => ipcRenderer.invoke('window:openDetached', panel, wsId),
  listInspiration: (wsId: string) => ipcRenderer.invoke('inspiration:list', wsId) as Promise<{ id: string; content: string; created_at: string }[]>,
  addInspiration: (wsId: string, note: { id: string; content: string; created_at: string }) =>
    ipcRenderer.invoke('inspiration:add', wsId, note) as Promise<{ id: string; content: string; created_at: string }[]>,
  onInspirationSaved: (cb: () => void) => {
    ipcRenderer.on('inspiration:saved', cb)
  },
  onOpenFile: (cb: (filePath: string) => void) => {
    ipcRenderer.on('app:open-file', (_e, fp: string) => cb(fp))
  },
})

export type ElectronAPI = {
  platform: () => Promise<string>
  getAppPath: () => Promise<string>
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  saveFile: (options?: { defaultPath?: string; content?: string }) => Promise<string | null>
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<OpenFileResult[]>
  openFolder: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<FileEntry[]>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
}
