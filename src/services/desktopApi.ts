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

  async ensureProjectMeta(workspaceRoot: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_ensure_project_meta', { workspaceRoot })
  },

  async loadProjectMeta(workspaceRoot: string): Promise<unknown> {
    requireTauri()
    return tauriInvoke('cv_load_project_meta', { workspaceRoot })
  },

  async saveProjectMeta(workspaceRoot: string, fileKey: string, jsonContent: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_save_project_meta', { workspaceRoot, fileKey, jsonContent })
  },

  async buildWritingPrompt(request: Record<string, unknown>): Promise<{
    system_prompt: string
    user_prompt: string
    context_summary: string
  }> {
    requireTauri()
    return tauriInvoke('cv_build_writing_prompt', { request })
  },

  async checkContent(request: Record<string, unknown>): Promise<unknown> {
    requireTauri()
    return tauriInvoke('cv_check_content', { request })
  },

  async snapshotVersion(
    workspaceRoot: string,
    filePath: string,
    content: string,
    label?: string,
  ): Promise<unknown> {
    requireTauri()
    return tauriInvoke('cv_snapshot_version', {
      workspaceRoot,
      filePath,
      content,
      label,
    })
  },

  async listVersions(workspaceRoot: string, filePath: string): Promise<unknown[]> {
    requireTauri()
    return tauriInvoke('cv_list_versions', { workspaceRoot, filePath })
  },

  async restoreVersion(workspaceRoot: string, filePath: string, versionId: string): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_restore_version', { workspaceRoot, filePath, versionId })
  },

  async writeFileWithSnapshot(workspaceRoot: string, filePath: string, content: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_write_file_with_snapshot', { workspaceRoot, filePath, content })
  },

  async exportBook(request: Record<string, unknown>): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_export_book', { request })
  },

  async moveOutlineFile(fromPath: string, toPath: string): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_move_outline_file', { fromPath, toPath })
  },

  async renameOutlineFile(filePath: string, newName: string): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_rename_outline_file', { filePath, newName })
  },

  async generateSummaryMd(workspaceRoot: string): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_generate_summary_md', { workspaceRoot })
  },

  async backupWorkspace(workspaceRoot: string, destZip: string): Promise<string> {
    requireTauri()
    return tauriInvoke('cv_backup_workspace', { workspaceRoot, destZip })
  },

  async watchWorkspace(workspaceRoot: string): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_watch_workspace', { workspaceRoot })
  },

  async unwatchWorkspace(): Promise<void> {
    requireTauri()
    await tauriInvoke('cv_unwatch_workspace')
  },

  async relocateChapter(
    workspaceRoot: string,
    filePath: string,
    storage: 'draft' | 'final' | 'workspace',
  ): Promise<{ oldPath: string; newPath: string; storage: string }> {
    requireTauri()
    return tauriInvoke('cv_relocate_chapter', { workspaceRoot, filePath, storage })
  },

  async batchMoveFiles(
    filePaths: string[],
    destDir: string,
  ): Promise<{ path: string; ok: boolean; error?: string }[]> {
    requireTauri()
    return tauriInvoke('cv_batch_move_files', { filePaths, destDir })
  },

  async batchRenameFiles(
    renames: { from: string; to: string }[],
  ): Promise<{ path: string; ok: boolean; error?: string }[]> {
    requireTauri()
    return tauriInvoke('cv_batch_rename_files', { renames })
  },

  async getCharacterByName(workspaceRoot: string, name: string) {
    requireTauri()
    return tauriInvoke<{ id: string; name: string } | null>('cv_get_character_by_name', {
      workspaceRoot,
      name,
    })
  },

  async getGlossaryItem(workspaceRoot: string, term: string) {
    requireTauri()
    return tauriInvoke<{ id: string; term: string } | null>('cv_get_glossary_item', {
      workspaceRoot,
      term,
    })
  },

  async truncateContext(request: Record<string, unknown>) {
    requireTauri()
    return tauriInvoke('cv_truncate_context', { req: request })
  },

  async runPipelineStage(request: Record<string, unknown>) {
    requireTauri()
    return tauriInvoke('cv_run_pipeline_stage', { req: request })
  },

  async enqueueAiTask(workspaceRoot: string, kind: string) {
    requireTauri()
    return tauriInvoke('cv_enqueue_ai_task', { workspaceRoot, kind })
  },

  async getAiTask(workspaceRoot: string, taskId: string) {
    requireTauri()
    return tauriInvoke('cv_get_ai_task', { workspaceRoot, taskId })
  },

  async listAiTasks(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_list_ai_tasks', { workspaceRoot })
  },

  async processAiTask(workspaceRoot: string, taskId: string) {
    requireTauri()
    return tauriInvoke('cv_process_ai_task', { workspaceRoot, taskId })
  },

  async getBatchQueue(workspaceRoot: string, taskId: string) {
    requireTauri()
    return tauriInvoke('cv_get_batch_queue', { workspaceRoot, taskId })
  },

  async updateAiTask(
    workspaceRoot: string,
    taskId: string,
    status: string,
    progress: number,
    total: number,
    message: string,
  ) {
    requireTauri()
    return tauriInvoke('cv_update_ai_task', { workspaceRoot, taskId, status, progress, total, message })
  },

  async clearStreamCheckpoint(workspaceRoot: string, taskId: string) {
    requireTauri()
    return tauriInvoke('cv_clear_stream_checkpoint', { workspaceRoot, taskId })
  },

  async setActiveLlmProvider(workspaceRoot: string, providerId: string) {
    requireTauri()
    return tauriInvoke('cv_set_active_llm_provider', { workspaceRoot, providerId })
  },

  async savePromptTemplate(workspaceRoot: string, template: Record<string, unknown>) {
    requireTauri()
    return tauriInvoke('cv_save_prompt_template', { workspaceRoot, template })
  },

  async deletePromptTemplate(workspaceRoot: string, templateId: string) {
    requireTauri()
    return tauriInvoke('cv_delete_prompt_template', { workspaceRoot, templateId })
  },

  async setPluginEnabled(workspaceRoot: string, pluginId: string, enabled: boolean) {
    requireTauri()
    return tauriInvoke('cv_set_plugin_enabled', { workspaceRoot, pluginId, enabled })
  },

  async resumeStream(workspaceRoot: string, taskId: string) {
    requireTauri()
    return tauriInvoke('cv_resume_stream', { workspaceRoot, taskId })
  },

  async saveStreamCheckpoint(workspaceRoot: string, taskId: string, partialText: string) {
    requireTauri()
    return tauriInvoke('cv_save_stream_checkpoint', { workspaceRoot, taskId, partialText })
  },

  async runPlotAudit(workspaceRoot: string, deep = false) {
    requireTauri()
    return tauriInvoke('cv_run_plot_audit', { workspaceRoot, deep })
  },

  async getWritingStats(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_get_writing_stats', { workspaceRoot })
  },

  async exportPlatform(
    workspaceRoot: string,
    platform: string,
    destPath: string,
    chapters: { title: string; content: string }[],
  ) {
    requireTauri()
    return tauriInvoke('cv_export_platform', { workspaceRoot, platform, destPath, chapters })
  },

  async exportVolumeBundle(workspaceRoot: string, volumeId: string, destZip: string) {
    requireTauri()
    return tauriInvoke('cv_export_volume_bundle', { workspaceRoot, volumeId, destZip })
  },

  async listBackups(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_list_backups', { workspaceRoot })
  },

  async backupWorkspaceIncremental(workspaceRoot: string, destZip?: string) {
    requireTauri()
    return tauriInvoke<{
      path: string
      changed_files?: number
      changedFiles?: number
      total_tracked?: number
      totalTracked?: number
      skipped: boolean
    }>('cv_backup_workspace_incremental', { workspaceRoot, destZip })
  },

  async listLlmProviders(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_list_llm_providers', { workspaceRoot })
  },

  async listPromptTemplates(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_list_prompt_templates', { workspaceRoot })
  },

  async listPlugins(workspaceRoot: string) {
    requireTauri()
    return tauriInvoke('cv_list_plugins', { workspaceRoot })
  },

  async extractStyleSample(workspaceRoot: string, maxSamples = 5, maxChars = 2000) {
    requireTauri()
    return tauriInvoke('cv_extract_style_sample', {
      req: { workspaceRoot, maxSamples, maxChars },
    })
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
