import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: () => ipcRenderer.invoke('platform'),
  getAppPath: () => ipcRenderer.invoke('getAppPath'),
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }) =>
    ipcRenderer.invoke('dialog:saveFile', options),
  openFiles: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  listDirTree: (folderPath: string) => ipcRenderer.invoke('fs:listDirTree', folderPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFile: (parentPath: string, fileName: string) => ipcRenderer.invoke('fs:createFile', parentPath, fileName),
  createDir: (parentPath: string, dirName: string) => ipcRenderer.invoke('fs:createDir', parentPath, dirName),
  deletePath: (targetPath: string) => ipcRenderer.invoke('fs:deletePath', targetPath),
  dirname: (filePath: string) => ipcRenderer.invoke('fs:dirname', filePath),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  openInspirationWindow: (wsId: string) => ipcRenderer.invoke('window:openInspiration', wsId),
  listInspiration: (wsId: string) => ipcRenderer.invoke('inspiration:list', wsId),
  addInspiration: (wsId: string, note: { id: string; content: string; created_at: string }) =>
    ipcRenderer.invoke('inspiration:add', wsId, note),
  onInspirationSaved: (cb: () => void) => { ipcRenderer.on('inspiration:saved', cb) },
  onOpenFile: (cb: (filePath: string) => void) => {
    ipcRenderer.on('app:open-file', (_e, fp: string) => cb(fp))
  },
})
