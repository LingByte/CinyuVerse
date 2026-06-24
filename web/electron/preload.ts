import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, FileContent, FsNode, InspirationNote, OpenFileResult } from './types'

const electronAPI: ElectronAPI = {
  platform: () => ipcRenderer.invoke('platform'),
  getAppPath: () => ipcRenderer.invoke('getAppPath'),
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  openFiles: (options) =>
    ipcRenderer.invoke('dialog:openFile', options) as Promise<OpenFileResult[]>,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
  listDirTree: (folderPath) =>
    ipcRenderer.invoke('fs:listDirTree', folderPath) as Promise<FsNode | null>,
  readFile: (filePath) =>
    ipcRenderer.invoke('fs:readFile', filePath) as Promise<FileContent>,
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content) as Promise<void>,
  createFile: (parentPath, fileName) =>
    ipcRenderer.invoke('fs:createFile', parentPath, fileName) as Promise<string>,
  createDir: (parentPath, dirName) =>
    ipcRenderer.invoke('fs:createDir', parentPath, dirName) as Promise<string>,
  deletePath: (targetPath) =>
    ipcRenderer.invoke('fs:deletePath', targetPath) as Promise<void>,
  dirname: (filePath) =>
    ipcRenderer.invoke('fs:dirname', filePath) as Promise<string>,
  scanFolder: (folderPath) =>
    ipcRenderer.invoke('fs:scanFolder', folderPath),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  openInspirationWindow: (wsId) => ipcRenderer.invoke('window:openInspiration', wsId),
  openDetachedPanel: (panel, wsId) => ipcRenderer.invoke('window:openDetached', panel, wsId),
  listInspiration: (wsId) =>
    ipcRenderer.invoke('inspiration:list', wsId) as Promise<InspirationNote[]>,
  addInspiration: (wsId, note) =>
    ipcRenderer.invoke('inspiration:add', wsId, note) as Promise<InspirationNote[]>,
  onInspirationSaved: (cb) => {
    ipcRenderer.on('inspiration:saved', cb)
  },
  onOpenFile: (cb) => {
    ipcRenderer.on('app:open-file', (_e, fp: string) => cb(fp))
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
