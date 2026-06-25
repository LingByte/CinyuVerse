/**
 * Desktop API — Tauri (Rust) backend.
 * Web preview mode throws or no-ops where noted.
 */
import type {
  FileContent,
  FileEntry,
  FsNode,
  InspirationNote,
  OpenFileResult,
} from '@/core/types/desktop'
import { inspirationFallbackKey } from '@/core/storage/keys'
import { isTauri } from './runtime'

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/tauri')
  return invoke<T>(cmd, args)
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

async function tauriReadFile(path: string): Promise<FileContent> {
  const result = await tauriInvoke<{ content: string; encoding: string }>('cv_read_file', { filePath: path })
  return {
    content: result.content,
    encoding: result.encoding === 'base64' ? 'base64' : 'utf8',
  }
}

function readInspirationNotes(wsId: string): InspirationNote[] {
  try {
    const raw = localStorage.getItem(inspirationFallbackKey(wsId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeInspirationNotes(wsId: string, notes: InspirationNote[]) {
  localStorage.setItem(inspirationFallbackKey(wsId), JSON.stringify(notes))
}

function requireTauri() {
  if (!isTauri()) throw new Error('仅桌面端可用')
}

export const desktopApi = {
  kind: () => (isTauri() ? 'tauri' as const : 'web' as const),

  async platform(): Promise<string> {
    requireTauri()
    const { platform } = await import('@tauri-apps/api/os')
    const p = await platform()
    return p === 'darwin' ? 'darwin' : p === 'win32' ? 'win32' : p
  },

  async getAppPath(): Promise<string> {
    requireTauri()
    const { appDataDir } = await import('@tauri-apps/api/path')
    return appDataDir()
  },

  async openFolder(): Promise<string | null> {
    requireTauri()
    return tauriInvoke<string | null>('open_folder_dialog')
  },

  async openFiles(): Promise<OpenFileResult[]> {
    requireTauri()
    const path = await tauriInvoke<string | null>('open_file_dialog')
    if (!path) return []
    const { content, encoding } = await tauriReadFile(path)
    return [{ path, name: basename(path), content, encoding }]
  },

  async listDirTree(folderPath: string): Promise<FsNode | null> {
    requireTauri()
    return tauriInvoke<FsNode | null>('cv_list_dir_tree', { folderPath })
  },

  async readFile(filePath: string): Promise<FileContent> {
    requireTauri()
    return tauriReadFile(filePath)
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_write_file', { filePath, content })
  },

  async createFile(parentPath: string, fileName: string): Promise<string> {
    requireTauri()
    return tauriInvoke<string>('cv_create_file', { parentPath, fileName })
  },

  async createDir(parentPath: string, dirName: string): Promise<string> {
    requireTauri()
    return tauriInvoke<string>('cv_create_dir', { parentPath, dirName })
  },

  async deletePath(targetPath: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_delete_path', { targetPath })
  },

  async dirname(filePath: string): Promise<string> {
    requireTauri()
    return tauriInvoke<string>('cv_dirname', { filePath })
  },

  async scanFolder(folderPath: string): Promise<FileEntry[]> {
    requireTauri()
    return tauriInvoke<FileEntry[]>('cv_scan_folder', { folderPath })
  },

  async saveFile(options?: { defaultPath?: string; content?: string; encoding?: 'utf8' | 'base64' }): Promise<string | null> {
    requireTauri()
    const { save } = await import('@tauri-apps/api/dialog')
    const path = await save({ defaultPath: options?.defaultPath })
    if (!path || options?.content == null) return path
    await tauriInvoke('write_file', { path, content: options.content })
    return path
  },

  async minimizeWindow(): Promise<void> {
    requireTauri()
    const { appWindow } = await import('@tauri-apps/api/window')
    await appWindow.minimize()
  },

  async toggleMaximizeWindow(): Promise<boolean> {
    requireTauri()
    const { appWindow } = await import('@tauri-apps/api/window')
    await appWindow.toggleMaximize()
    return appWindow.isMaximized()
  },

  async closeWindow(): Promise<void> {
    requireTauri()
    const { appWindow } = await import('@tauri-apps/api/window')
    await appWindow.close()
  },

  async isWindowMaximized(): Promise<boolean> {
    requireTauri()
    const { appWindow } = await import('@tauri-apps/api/window')
    return appWindow.isMaximized()
  },

  async openInspirationWindow(wsId: string): Promise<void> {
    requireTauri()
    const { WebviewWindow } = await import('@tauri-apps/api/window')
    const label = `inspiration-${wsId}`
    const existing = WebviewWindow.getByLabel(label)
    if (existing) {
      await existing.setFocus()
      return
    }
    const url = `${window.location.origin}?mode=inspiration&wsId=${encodeURIComponent(wsId)}`
    new WebviewWindow(label, {
      url,
      title: '灵感草稿箱',
      width: 480,
      height: 640,
      resizable: true,
    })
  },

  async openDetachedPanel(panel: 'ai' | 'outline', wsId: string): Promise<void> {
    requireTauri()
    const { WebviewWindow } = await import('@tauri-apps/api/window')
    const label = `detach-${panel}-${wsId}`
    const existing = WebviewWindow.getByLabel(label)
    if (existing) {
      await existing.setFocus()
      return
    }
    const url = `${window.location.origin}?mode=detach&panel=${panel}&wsId=${encodeURIComponent(wsId)}`
    new WebviewWindow(label, {
      url,
      title: panel === 'ai' ? 'AI 助手' : '大纲',
      width: 420,
      height: 720,
      resizable: true,
    })
  },

  async listInspiration(wsId: string): Promise<InspirationNote[]> {
    return readInspirationNotes(wsId)
  },

  async addInspiration(wsId: string, note: InspirationNote): Promise<InspirationNote[]> {
    const notes = [note, ...readInspirationNotes(wsId)]
    writeInspirationNotes(wsId, notes)
    return notes
  },

  onInspirationSaved(_cb: () => void): void {
    // Inspiration notes persist in localStorage; no cross-window event yet.
  },

  onOpenFile(cb: (filePath: string) => void): void {
    if (!isTauri()) return
    void import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string[]>('open-files', (event) => {
        const paths = event.payload
        if (paths?.length) cb(paths[paths.length - 1])
      })
    })
  },

  async aiChatStream(
    options: {
      model: string
      messages: { role: string; content: string }[]
      temperature?: number
      maxTokens?: number
    },
    onChunk: (text: string) => void,
  ): Promise<string> {
    requireTauri()
    const { listen } = await import('@tauri-apps/api/event')

    let fullText = ''
    let streamError: Error | null = null
    let endResolve: (() => void) | null = null
    const endPromise = new Promise<void>((resolve) => { endResolve = resolve })

    const unlistenChunk = await listen<string>('ai-chat-chunk', (e) => {
      const chunk = typeof e.payload === 'string' ? e.payload : ''
      if (chunk) {
        fullText += chunk
        onChunk(chunk)
      }
    })

    const unlistenError = await listen<string>('ai-chat-error', (e) => {
      streamError = new Error(typeof e.payload === 'string' ? e.payload : 'AI 请求失败')
      endResolve?.()
    })

    const unlistenEnd = await listen<string>('ai-chat-end', () => {
      endResolve?.()
    })

    try {
      await tauriInvoke('ai_chat_stream', {
        request: {
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          stream: true,
        },
      })
      await endPromise
      if (streamError) throw streamError
      return fullText
    } finally {
      unlistenChunk()
      unlistenError()
      unlistenEnd()
    }
  },

  async aiGetConfig(): Promise<{ provider: string; base_url: string; model: string } | null> {
    requireTauri()
    return tauriInvoke('ai_get_config')
  },
}

export function requireDesktop() {
  requireTauri()
  return desktopApi
}

export { basename as getFileName }

export async function readFile(path: string): Promise<FileContent> {
  return desktopApi.readFile(path)
}

export async function writeFile(path: string, content: string): Promise<void> {
  return desktopApi.writeFile(path, content)
}

export async function listDirTree(folderPath: string): Promise<FsNode | null> {
  return desktopApi.listDirTree(folderPath)
}

export async function openFolderDialog(): Promise<string | null> {
  return desktopApi.openFolder()
}

export async function createFile(parentPath: string, fileName: string): Promise<string> {
  return desktopApi.createFile(parentPath, fileName)
}

export async function createDir(parentPath: string, dirName: string): Promise<string> {
  return desktopApi.createDir(parentPath, dirName)
}

export async function deletePath(targetPath: string): Promise<void> {
  return desktopApi.deletePath(targetPath)
}

export async function dirname(filePath: string): Promise<string> {
  return desktopApi.dirname(filePath)
}
