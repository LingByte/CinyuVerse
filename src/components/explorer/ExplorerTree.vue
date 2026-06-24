<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { FilePlus, FolderOpen } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/tauri'
import ExplorerTreeNode from './ExplorerTreeNode.vue'
import PanelShell from '@/components/layouts/PanelShell.vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SKIP_DIR_NAMES, MAX_DIR_ENTRIES, type TreeNode } from './explorerTypes'

const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath'

const props = defineProps<{
  onOpenFile?: (path: string) => void
  rootPath?: string
  onRootPathChange?: (path: string) => void
}>()

const rootPathLocal = ref('')
const tree = ref<TreeNode | null>(null)
const expanded = shallowRef<Record<string, boolean>>({})
const loading = ref(false)
const error = ref('')
const loadingDirs = ref<Record<string, boolean>>({})

const effectiveRootPath = computed(() => props.rootPath ?? rootPathLocal.value)

function setEffectiveRootPath(p: string) {
  if (props.onRootPathChange) props.onRootPathChange(p)
  else rootPathLocal.value = p
}

function sortNodes(nodes: TreeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).slice(-1)[0] || path
}

function isAbsolutePath(p: string) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/')
}

function joinPath(parent: string, child: string) {
  const sep = parent.includes('\\') ? '\\' : '/'
  const p = parent.endsWith('\\') || parent.endsWith('/') ? parent.slice(0, -1) : parent
  const c = child.startsWith('\\') || child.startsWith('/') ? child.slice(1) : child
  return p + sep + c
}

function dirname(p: string) {
  const parts = p.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return ''
  const sep = p.includes('\\') ? '\\' : '/'
  const prefix = /^[a-zA-Z]:/.test(p) ? parts[0] + sep : p.startsWith(sep) ? sep : ''
  return prefix + parts.slice(1, -1).join(sep)
}

function isPathInsideRoot(root: string, p: string) {
  if (!root || !p) return false
  const rootNorm = root.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
  const pNorm = p.replace(/\\/g, '/').toLowerCase()
  return pNorm === rootNorm || pNorm.startsWith(rootNorm + '/')
}

function relativeSegments(root: string, p: string) {
  const rootNorm = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const pNorm = p.replace(/\\/g, '/')
  const rel = pNorm.slice(rootNorm.length).replace(/^\//, '')
  return rel.split('/').filter(Boolean)
}

function normalizeEntryPath(parentPath: string, entryPath: string) {
  if (!entryPath) return ''
  if (isAbsolutePath(entryPath)) return entryPath
  return joinPath(parentPath, entryPath)
}

async function readDirectoryEntries(dirPath: string): Promise<unknown[]> {
  try {
    const entries = await invoke<unknown[]>('read_directory', { path: dirPath })
    return Array.isArray(entries) ? entries : []
  } catch (e) {
    try {
      const fs = await import('@tauri-apps/api/fs')
      const entries = await fs.readDir(dirPath, { recursive: false })
      return Array.isArray(entries) ? entries : []
    } catch (fsErr) {
      throw { invokeError: e, fsError: fsErr }
    }
  }
}

function fromDirEntry(entry: Record<string, unknown>, parentPath: string): TreeNode | null {
  const path = normalizeEntryPath(parentPath, String(entry.path ?? ''))
  const name = String(entry.name ?? '') || getNameFromPath(path)
  if (SKIP_DIR_NAMES.has(name.toLowerCase())) return null
  const entryType = (entry.entry_type ?? entry.type ?? entry.entryType) as string | undefined
  const isDir = entryType === 'directory' || Array.isArray(entry.children)
  return {
    name,
    path,
    kind: isDir ? 'dir' : 'file',
    children: isDir ? [] : undefined,
    loaded: !isDir,
  }
}

function mapEntries(entries: unknown[], parentPath: string): TreeNode[] {
  const nodes = entries
    .map((e) => fromDirEntry(e as Record<string, unknown>, parentPath))
    .filter((n): n is TreeNode => n !== null)
  const sorted = sortNodes(nodes)
  if (sorted.length > MAX_DIR_ENTRIES) {
    return sorted.slice(0, MAX_DIR_ENTRIES)
  }
  return sorted
}

function handleOpenFile(path: string) {
  window.setTimeout(() => props.onOpenFile?.(path), 0)
}

function handleToggle(path: string) {
  const next = { ...expanded.value }
  next[path] = !next[path]
  expanded.value = next
}

async function openFolder() {
  error.value = ''
  try {
    const dialog = await import('@tauri-apps/api/dialog')
    const selected = await dialog.open({ directory: true, multiple: false })
    if (!selected) return
    const p = Array.isArray(selected) ? selected[0] : selected
    setEffectiveRootPath(p)
  } catch {
    error.value = 'Open folder is only available in the Tauri desktop app.'
  }
}

async function openFileDialog() {
  error.value = ''
  try {
    const dialog = await import('@tauri-apps/api/dialog')
    const selected = await dialog.open({ directory: false, multiple: false })
    if (!selected) return
    const p = Array.isArray(selected) ? selected[0] : selected
    if (!effectiveRootPath.value && props.rootPath === undefined) {
      const parent = dirname(p)
      if (parent) setEffectiveRootPath(parent)
    }
    props.onOpenFile?.(p)
  } catch {
    error.value = 'Open file is only available in the Tauri desktop app.'
  }
}

async function ensureDirLoaded(dirPath: string) {
  if (!tree.value) return
  if (loadingDirs.value[dirPath]) return

  const findNode = (node: TreeNode): TreeNode | null => {
    if (node.path === dirPath) return node
    if (!node.children) return null
    for (const c of node.children) {
      const found = findNode(c)
      if (found) return found
    }
    return null
  }

  const target = findNode(tree.value)
  if (!target || target.kind !== 'dir' || target.loaded) return

  loadingDirs.value = { ...loadingDirs.value, [dirPath]: true }
  try {
    const entries = await readDirectoryEntries(dirPath)
    const update = (node: TreeNode): TreeNode => {
      if (node.path === dirPath) {
        return {
          ...node,
          loaded: true,
          children: mapEntries(entries, dirPath),
        }
      }
      if (!node.children) return node
      return { ...node, children: node.children.map(update) }
    }
    tree.value = tree.value ? update(tree.value) : tree.value
  } catch (e) {
    console.error('ExplorerTree: Failed to read directory:', dirPath, e)
    error.value = 'Failed to read directory.'
  } finally {
    const next = { ...loadingDirs.value }
    delete next[dirPath]
    loadingDirs.value = next
  }
}

const headerTitle = computed(() => {
  if (!effectiveRootPath.value) return 'Explorer'
  return effectiveRootPath.value.split(/[\\/]/).filter(Boolean).slice(-1)[0] || 'Explorer'
})

watch(
  () => props.rootPath,
  () => {
    if (props.rootPath !== undefined) return
    const saved = localStorage.getItem(EXPLORER_ROOT_KEY)
    if (saved) rootPathLocal.value = saved
  },
  { immediate: true },
)

watch(effectiveRootPath, (p) => {
  if (p) localStorage.setItem(EXPLORER_ROOT_KEY, p)
  else localStorage.removeItem(EXPLORER_ROOT_KEY)
})

watch(
  effectiveRootPath,
  async (p) => {
    if (!p) {
      tree.value = null
      return
    }
    loading.value = true
    error.value = ''
    try {
      const entries = await readDirectoryEntries(p)
      tree.value = {
        path: p,
        name: getNameFromPath(p),
        kind: 'dir',
        loaded: true,
        children: mapEntries(entries, p),
      }
      expanded.value = { [p]: true }
    } catch (e) {
      console.error('ExplorerTree: Failed to read directory:', p, e)
      error.value = 'Failed to read directory.'
      tree.value = null
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function onRevealInExplorer(evt: Event) {
  const e = evt as CustomEvent<{ path?: string }>
  const targetPath = e?.detail?.path
  const root = effectiveRootPath.value
  if (!targetPath || !root || !tree.value) return
  if (!isPathInsideRoot(root, targetPath)) return

  const fileDir = dirname(targetPath)
  const dirSegs = relativeSegments(root, fileDir)

  void (async () => {
    let current = root
    expanded.value = { ...expanded.value, [root]: true }
    for (const seg of dirSegs) {
      await ensureDirLoaded(current)
      current = joinPath(current, seg)
      expanded.value = { ...expanded.value, [current]: true }
    }
  })()
}

onMounted(() => {
  window.addEventListener('gopilot:revealInExplorer', onRevealInExplorer as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('gopilot:revealInExplorer', onRevealInExplorer as EventListener)
})
</script>

<template>
  <PanelShell :title="headerTitle">
    <template #actions>
      <Button variant="ghost" size="icon-sm" aria-label="Open File" title="Open File" @click="openFileDialog">
        <FilePlus class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Open Folder" title="Open Folder" @click="openFolder">
        <FolderOpen class="h-4 w-4" />
      </Button>
    </template>

    <template v-if="error" #alert>
      <Alert variant="destructive">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
    </template>

    <template v-if="loading" #status>Loading…</template>

    <ExplorerTreeNode
      v-if="tree"
      :node="tree"
      :depth="0"
      :expanded="expanded"
      :loading-dirs="loadingDirs"
      @toggle="handleToggle"
      @ensure-load="ensureDirLoaded"
      @open-file="handleOpenFile"
    />
    <div v-else-if="!loading" class="p-3 text-xs text-muted-foreground">No folder opened.</div>
  </PanelShell>
</template>
