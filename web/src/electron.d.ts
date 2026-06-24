import type { ElectronAPI, FileContent, FileEntry, FsNode, InspirationNote, OpenFileResult } from '../electron/types'

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export type { ElectronAPI, FileContent, FileEntry, FsNode, InspirationNote, OpenFileResult }
