/** Tauri IDE commands — terminal, search. */
import { isTauri } from './runtime'

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('仅桌面端可用')
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/tauri')
  return tauriInvoke<T>(cmd, args)
}

export type SearchMatch = {
  path: string
  line: number
  column: number
  text: string
}

export const ideApi = {
  async searchWorkspace(rootPath: string, query: string, maxResults = 500): Promise<SearchMatch[]> {
    const res = await invoke<unknown[]>('search_workspace', {
      path: rootPath,
      query,
      max_results: maxResults,
    })
    if (!Array.isArray(res)) return []
    return res
      .map((x) => {
        const item = x as Record<string, unknown>
        return {
          path: String(item.path ?? ''),
          line: Number(item.line ?? 0),
          column: Number(item.column ?? 0),
          text: String(item.text ?? ''),
        }
      })
      .filter((m) => m.path && m.line > 0)
  },

  async executeCommand(command: string, workingDir?: string): Promise<string> {
    return invoke<string>('execute_command', {
      command,
      working_dir: workingDir,
    })
  },

  async terminalStart(cwd: string | undefined, cols: number, rows: number): Promise<string> {
    return invoke<string>('terminal_start', { cwd, cols, rows })
  },

  async terminalWrite(sessionId: string, data: string): Promise<void> {
    await invoke('terminal_write', { sessionId, data })
  },

  async terminalResize(sessionId: string, cols: number, rows: number): Promise<void> {
    await invoke('terminal_resize', { sessionId, cols, rows })
  },

  async terminalKill(sessionId: string): Promise<void> {
    await invoke('terminal_kill', { sessionId })
  },

  async downloadFile(url: string, savePath: string): Promise<void> {
    await invoke('download_file', { url, savePath })
  },
}
