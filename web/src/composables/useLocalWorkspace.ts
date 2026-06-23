import { ref, shallowRef } from 'vue'
import type { FileContent } from '@/electron'

export interface FsNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FsNode[]
}

const STORAGE_FOLDER = 'cinyuverse:lastFolder'
const STORAGE_FILE = 'cinyuverse:lastFile'

function requireAPI() {
  const api = window.electronAPI
  if (!api) throw new Error('仅桌面端可用')
  return api
}

export function useLocalWorkspace() {
  const rootPath = ref<string | null>(null)
  const tree = shallowRef<FsNode | null>(null)
  const currentFilePath = ref<string | null>(null)
  const folderName = ref('')
  const error = ref('')

  async function refreshTree() {
    if (!rootPath.value) {
      tree.value = null
      return
    }
    tree.value = await requireAPI().listDirTree(rootPath.value)
  }

  async function openFolder(folderPath?: string) {
    error.value = ''
    const picked = folderPath ?? await requireAPI().openFolder()
    if (!picked) return false
    rootPath.value = picked
    folderName.value = picked.split(/[/\\]/).pop() || picked
    localStorage.setItem(STORAGE_FOLDER, picked)
    await refreshTree()
    return true
  }

  async function openFileByPath(filePath: string): Promise<FileContent> {
    error.value = ''
    const api = requireAPI()
    const parentDir = await api.dirname(filePath)
    if (!rootPath.value || !filePath.startsWith(rootPath.value)) {
      rootPath.value = parentDir
      folderName.value = parentDir.split(/[/\\]/).pop() || parentDir
      localStorage.setItem(STORAGE_FOLDER, parentDir)
      await refreshTree()
    }
    currentFilePath.value = filePath
    localStorage.setItem(STORAGE_FILE, filePath)
    const result = await api.readFile(filePath)
    // Handle both old (string) and new (object) response formats
    if (typeof result === 'string') {
      return { content: result, encoding: 'utf8' }
    }
    return result
  }

  async function readCurrentFile(): Promise<FileContent | null> {
    if (!currentFilePath.value) return null
    const result = await requireAPI().readFile(currentFilePath.value)
    if (typeof result === 'string') {
      return { content: result, encoding: 'utf8' }
    }
    return result
  }

  async function saveFile(filePath: string, content: string) {
    await requireAPI().writeFile(filePath, content)
  }

  async function createFile(parentPath: string, fileName: string) {
    const fullPath = await requireAPI().createFile(parentPath, fileName)
    await refreshTree()
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
  }

  function closeFolder() {
    rootPath.value = null
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
      await openFolder(lastFolder)
      const lastFile = localStorage.getItem(STORAGE_FILE)
      if (lastFile) {
        currentFilePath.value = lastFile
      }
    } catch {
      localStorage.removeItem(STORAGE_FOLDER)
      localStorage.removeItem(STORAGE_FILE)
    }
  }

  return {
    rootPath,
    tree,
    currentFilePath,
    folderName,
    error,
    openFolder,
    openFileByPath,
    readCurrentFile,
    saveFile,
    createFile,
    createDir,
    deletePath,
    closeFolder,
    refreshTree,
    restoreLastSession,
  }
}
