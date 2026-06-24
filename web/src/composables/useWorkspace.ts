import { ref, shallowRef } from 'vue'
import type { WorkspaceDetail } from '@/types/workspace'
import type { FileContent, FsNode } from '@/types/electron'
import {
  buildLocalSingleFileWorkspace,
  buildLocalWorkspace,
  type LocalFileEntry,
} from '@/utils/localWorkspace'

const STORAGE_FOLDER = 'cinyuverse:lastFolder'
const STORAGE_FILE = 'cinyuverse:lastFile'

function requireAPI() {
  const api = window.electronAPI
  if (!api) throw new Error('仅桌面端可用')
  return api
}

export function useWorkspace() {
  const currentWorkspace = shallowRef<WorkspaceDetail | null>(null)
  const tree = shallowRef<FsNode | null>(null)
  const currentFilePath = ref<string | null>(null)
  const folderName = ref('')
  const loading = ref(false)
  const error = ref('')
  const isLocalMode = ref(false)
  const localRootPath = ref<string | null>(null)
  const localFilePaths = ref<Map<string, string>>(new Map())

  function resolveLocalPath(chId: string): string | null {
    return localFilePaths.value.get(chId) ?? chId
  }

  async function refreshTree() {
    if (!localRootPath.value) {
      tree.value = null
      return
    }
    tree.value = await requireAPI().listDirTree(localRootPath.value)
  }

  async function rebuildWorkspaceMetadata(folderPath: string) {
    const electron = window.electronAPI
    if (!electron?.scanFolder) return
    const files = (await electron.scanFolder(folderPath)) as LocalFileEntry[]
    const { workspace, filePaths } = buildLocalWorkspace(folderPath, files)
    currentWorkspace.value = workspace
    localFilePaths.value = filePaths
  }

  async function openLocalFolder(folderPath?: string): Promise<boolean> {
    loading.value = true
    try {
      const api = requireAPI()
      const picked = folderPath ?? await api.openFolder()
      if (!picked) return false

      isLocalMode.value = true
      localRootPath.value = picked
      folderName.value = picked.split(/[/\\]/).pop() || picked
      localStorage.setItem(STORAGE_FOLDER, picked)

      tree.value = await api.listDirTree(picked)
      await rebuildWorkspaceMetadata(picked)
      error.value = ''
      return true
    } catch {
      error.value = '打开本地文件夹失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function openFileByPath(filePath: string): Promise<FileContent> {
    error.value = ''
    const api = requireAPI()
    const parentDir = await api.dirname(filePath)

    if (!localRootPath.value || !filePath.startsWith(localRootPath.value)) {
      localRootPath.value = parentDir
      folderName.value = parentDir.split(/[/\\]/).pop() || parentDir
      localStorage.setItem(STORAGE_FOLDER, parentDir)
      tree.value = await api.listDirTree(parentDir)
      await rebuildWorkspaceMetadata(parentDir)
    }

    currentFilePath.value = filePath
    localStorage.setItem(STORAGE_FILE, filePath)
    isLocalMode.value = true

    const result = await api.readFile(filePath)
    if (typeof result === 'string') {
      return { content: result, encoding: 'utf8' }
    }
    return result
  }

  async function openLocalFile(filePath: string, fileName: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<boolean> {
    const parentDir = filePath.replace(/[/\\][^/\\]+$/, '') || filePath
    isLocalMode.value = true
    localRootPath.value = parentDir
    folderName.value = parentDir.split(/[/\\]/).pop() || parentDir
    currentFilePath.value = filePath
    localStorage.setItem(STORAGE_FOLDER, parentDir)
    localStorage.setItem(STORAGE_FILE, filePath)

    if (encoding === 'utf8') {
      const { workspace, filePaths } = buildLocalSingleFileWorkspace(filePath, fileName, content)
      currentWorkspace.value = workspace
      localFilePaths.value = filePaths
    } else {
      currentWorkspace.value = {
        id: `local:file:${filePath}`,
        book_name: fileName.replace(/\.[^.]+$/, ''),
        type: '',
        world_view: '',
        character: '',
        outline: '',
        style: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        volumes: [],
      }
    }

    try {
      tree.value = await requireAPI().listDirTree(parentDir)
    } catch {
      tree.value = null
    }
    return true
  }

  async function createFile(parentPath: string, fileName: string) {
    const fullPath = await requireAPI().createFile(parentPath, fileName)
    await refreshTree()
    await rebuildWorkspaceMetadata(localRootPath.value!)
    return fullPath
  }

  async function createDir(parentPath: string, dirName: string) {
    const fullPath = await requireAPI().createDir(parentPath, dirName)
    await refreshTree()
    return fullPath
  }

  async function deletePath(targetPath: string) {
    await requireAPI().deletePath(targetPath)
    if (currentFilePath.value === targetPath) {
      currentFilePath.value = null
    }
    await refreshTree()
    if (localRootPath.value) {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
  }

  function closeCurrent() {
    isLocalMode.value = false
    localRootPath.value = null
    localFilePaths.value = new Map()
    currentWorkspace.value = null
    tree.value = null
    folderName.value = ''
    currentFilePath.value = null
    localStorage.removeItem(STORAGE_FOLDER)
    localStorage.removeItem(STORAGE_FILE)
  }

  async function restoreLastSession() {
    const lastFolder = localStorage.getItem(STORAGE_FOLDER)
    if (!lastFolder) return
    try {
      await openLocalFolder(lastFolder)
      const lastFile = localStorage.getItem(STORAGE_FILE)
      if (lastFile) {
        currentFilePath.value = lastFile
      }
    } catch {
      localStorage.removeItem(STORAGE_FOLDER)
      localStorage.removeItem(STORAGE_FILE)
    }
  }

  async function loadChapterContent(_volId: string, chId: string): Promise<string> {
    const filePath = resolveLocalPath(chId)
    if (!filePath) return ''
    try {
      const result = await requireAPI().readFile(filePath)
      return typeof result === 'string' ? result : result.content
    } catch {
      error.value = '读取本地文件失败'
      return ''
    }
  }

  async function saveFileContent(filePath: string, content: string) {
    await requireAPI().writeFile(filePath, content)
    if (localRootPath.value) {
      await rebuildWorkspaceMetadata(localRootPath.value)
    }
  }

  async function refreshLocalFolder() {
    if (!isLocalMode.value || !localRootPath.value) return
    await refreshTree()
    await rebuildWorkspaceMetadata(localRootPath.value)
  }

  return {
    currentWorkspace,
    tree,
    currentFilePath,
    folderName,
    loading,
    error,
    isLocalMode,
    localRootPath,
    openLocalFolder,
    openFileByPath,
    openLocalFile,
    createFile,
    createDir,
    deletePath,
    closeCurrent,
    restoreLastSession,
    refreshTree,
    loadChapterContent,
    saveFileContent,
    refreshLocalFolder,
  }
}
