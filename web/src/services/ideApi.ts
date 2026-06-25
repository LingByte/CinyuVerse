/** Tauri IDE commands — terminal, git, search, extensions. */
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

export type GitBranch = { name: string; isCurrent: boolean; isRemote: boolean }
export type GitStatusItem = { path: string; status: string; isStaged: boolean }

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

  async isGitRepository(path: string): Promise<boolean> {
    return invoke<boolean>('is_git_repository', { path })
  },

  async gitInit(path: string): Promise<void> {
    await invoke('git_init', { path })
  },

  async gitCurrentBranch(path: string): Promise<string> {
    return (await invoke<string | null>('git_current_branch', { path })) ?? ''
  },

  async gitBranches(path: string): Promise<GitBranch[]> {
    const raw = await invoke<unknown[]>('git_branches', { path })
    if (!Array.isArray(raw)) return []
    return raw
      .map((x) => {
        const item = x as Record<string, unknown>
        return {
          name: String(item.name ?? ''),
          isCurrent: !!item.isCurrent,
          isRemote: !!item.isRemote,
        }
      })
      .filter((b) => b.name)
  },

  async gitStatus(path: string): Promise<GitStatusItem[]> {
    const raw = await invoke<unknown[]>('git_status', { path })
    if (!Array.isArray(raw)) return []
    return raw
      .map((x) => {
        const item = x as Record<string, unknown>
        return {
          path: String(item.path ?? ''),
          status: String(item.status ?? ''),
          isStaged: !!item.isStaged,
        }
      })
      .filter((s) => s.path)
  },

  async gitAdd(path: string, files: string[]): Promise<void> {
    await invoke('git_add', { path, files })
  },

  async gitCommit(path: string, message: string): Promise<void> {
    await invoke('git_commit', { path, message })
  },

  async gitCheckout(path: string, branch: string): Promise<void> {
    await invoke('git_checkout', { path, branch })
  },

  async gitPull(path: string): Promise<void> {
    await invoke('git_pull', { path })
  },

  async gitPush(path: string): Promise<void> {
    await invoke('git_push', { path })
  },

  async gitDiscard(path: string, files: string[]): Promise<void> {
    await invoke('git_discard', { path, files })
  },

  async gitDiff(path: string, file: string): Promise<Record<string, unknown>> {
    return invoke('git_diff', { path, file })
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

  async extractVsix(vsixPath: string, destDir: string): Promise<void> {
    await invoke('extract_vsix', { vsixPath, destDir })
  },

  async fetchUrlBase64(url: string): Promise<string> {
    return invoke<string>('fetch_url_base64', { url })
  },

  async startExtensionHost(): Promise<void> {
    await invoke('start_extension_host')
  },

  async stopExtensionHost(): Promise<void> {
    await invoke('stop_extension_host')
  },
}
