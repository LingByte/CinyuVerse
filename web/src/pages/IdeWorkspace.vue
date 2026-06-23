<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import LeftSidebar from '@/components/ide/LeftSidebar.vue'
import EditorPanel from '@/components/ide/EditorPanel.vue'
import StatusBar from '@/components/ide/StatusBar.vue'
import MenuBar from '@/components/ide/MenuBar.vue'
import ThemeSettings from '@/components/ide/ThemeSettings.vue'
import { useLocalWorkspace } from '@/composables/useLocalWorkspace'
import { useThemeStore } from '@/stores/themeStore'
import { useFocusModeStore } from '@/stores/focusModeStore'
import { isText } from '@/utils/fileTypes'

const {
  rootPath,
  tree,
  folderName,
  currentFilePath,
  openFolder,
  openFileByPath,
  readCurrentFile,
  saveFile,
  createFile,
  createDir,
  deletePath,
  closeFolder,
  restoreLastSession,
} = useLocalWorkspace()
const themeStore = useThemeStore()
const focusMode = useFocusModeStore()

const currentContent = ref('')
const currentEncoding = ref<'utf8' | 'base64'>('utf8')
const currentTitle = ref('')
const isDirty = ref(false)
const saveStatus = ref('就绪')
const savedContent = ref('')
const panelWidths = ref({ left: 260 })
const resizing = ref(false)
const showSidebar = ref(true)
const editorZoom = ref(0)
const showPreferences = ref(false)
const menuBarRef = ref<InstanceType<typeof MenuBar> | null>(null)
const menuLoading = ref(false)
const menuError = ref('')

const wordCount = computed(() => {
  return isText(currentFilePath.value || '') ? [...currentContent.value].length : 0
})

watch(menuError, (msg) => {
  if (msg) {
    toast.error(msg, { duration: 4000 })
    setTimeout(() => { menuError.value = '' }, 4000)
  }
})

async function onSelectFile(filePath: string) {
  if (isDirty.value && isText(currentFilePath.value || '')) await doSave()
  saveStatus.value = '加载中...'
  try {
    const result = await openFileByPath(filePath)
    currentTitle.value = filePath.split(/[/\\]/).pop() || filePath
    currentContent.value = result.content
    currentEncoding.value = result.encoding
    savedContent.value = result.content
    isDirty.value = false
    saveStatus.value = '就绪'
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件失败'
    saveStatus.value = '就绪'
  }
}

async function doSave() {
  if (!currentFilePath.value || !isDirty.value) return
  if (!isText(currentFilePath.value)) return
  saveStatus.value = '保存中...'
  try {
    await saveFile(currentFilePath.value, currentContent.value)
    savedContent.value = currentContent.value
    isDirty.value = false
    saveStatus.value = '已保存 ' + new Date().toLocaleTimeString()
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '保存失败'
    saveStatus.value = '保存失败'
  }
}

function onContentUpdate(content: string) {
  currentContent.value = content
  if (isText(currentFilePath.value || '')) {
    isDirty.value = content !== savedContent.value
  }
}

async function onMenuOpenFolder() {
  if (!window.electronAPI) {
    menuError.value = '仅桌面端支持打开文件夹'
    return
  }
  if (isDirty.value) await doSave()
  try {
    menuLoading.value = true
    menuError.value = ''
    const ok = await openFolder()
    if (ok) {
      currentContent.value = ''
      currentEncoding.value = 'utf8'
      currentTitle.value = ''
      savedContent.value = ''
      isDirty.value = false
    }
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件夹失败'
  } finally {
    menuLoading.value = false
  }
}

async function onMenuOpenFile() {
  if (!window.electronAPI) {
    menuError.value = '仅桌面端支持打开文件'
    return
  }
  try {
    menuLoading.value = true
    menuError.value = ''
    const files = await window.electronAPI.openFiles()
    if (!files?.length) return
    // Pick last file if multiple selected
    const file = files[files.length - 1]
    await onSelectFile(file.path)
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件失败'
  } finally {
    menuLoading.value = false
  }
}

async function onMenuCloseFolder() {
  if (isDirty.value && isText(currentFilePath.value || '')) await doSave()
  closeFolder()
  currentContent.value = ''
  currentEncoding.value = 'utf8'
  currentTitle.value = ''
  savedContent.value = ''
  isDirty.value = false
}

async function onCreateFile(parentPath: string, fileName: string) {
  if (!fileName.trim()) return
  try {
    const filePath = await createFile(parentPath, fileName.trim())
    await onSelectFile(filePath)
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '创建文件失败'
  }
}

async function onCreateDir(parentPath: string, dirName: string) {
  if (!dirName.trim()) return
  try {
    await createDir(parentPath, dirName.trim())
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '创建文件夹失败'
  }
}

async function onDeletePath(targetPath: string) {
  if (currentFilePath.value === targetPath && isDirty.value && isText(currentFilePath.value)) await doSave()
  try {
    await deletePath(targetPath)
    if (currentFilePath.value === targetPath) {
      currentContent.value = ''
      currentEncoding.value = 'utf8'
      currentTitle.value = ''
      savedContent.value = ''
      isDirty.value = false
    }
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '删除失败'
  }
}

function onOpenInspiration() {
  const key = rootPath.value ?? 'default'
  window.electronAPI?.openInspirationWindow?.(key)
}

function toggleSidebar() { showSidebar.value = !showSidebar.value }
function zoomIn() { editorZoom.value = Math.min(5, editorZoom.value + 1) }
function zoomOut() { editorZoom.value = Math.max(-3, editorZoom.value - 1) }
function zoomReset() { editorZoom.value = 0 }

function toggleTypewriter() {
  focusMode.toggle()
  if (focusMode.typewriterMode) showSidebar.value = false
}

function exitTypewriter() {
  focusMode.disable()
  showSidebar.value = true
}

function onOpenPreferences() { showPreferences.value = true }

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && focusMode.typewriterMode) {
    exitTypewriter()
    return
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    onOpenInspiration()
  }
  if (e.ctrlKey && !e.altKey && e.key === ',') {
    e.preventDefault()
    onOpenPreferences()
  }
}

async function onMinimizeWindow() { await window.electronAPI?.minimizeWindow() }
async function onToggleMaximize() {
  await window.electronAPI?.toggleMaximizeWindow()
  await menuBarRef.value?.syncMaximizedState()
}
function onCloseWindow() { window.electronAPI?.closeWindow() }

function startResize() { resizing.value = true }
function onResizeMove(e: MouseEvent) {
  if (resizing.value) panelWidths.value.left = Math.max(180, Math.min(400, e.clientX))
}
function stopResize() { resizing.value = false }

let autoSaveTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
  document.addEventListener('keydown', onGlobalKeydown)
  themeStore.applyTheme()

  autoSaveTimer = setInterval(() => {
    if (isDirty.value && isText(currentFilePath.value || '')) doSave()
  }, 30000)

  window.electronAPI?.onOpenFile?.((filePath) => {
    onSelectFile(filePath)
  })

  if (window.electronAPI) {
    await restoreLastSession()
    if (currentFilePath.value) {
      try {
        const result = await readCurrentFile()
        if (result) {
          currentTitle.value = currentFilePath.value.split(/[/\\]/).pop() || ''
          currentContent.value = result.content
          currentEncoding.value = result.encoding
          savedContent.value = result.content
        }
      } catch {
        // ignore corrupt last file
      }
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('keydown', onGlobalKeydown)
  if (autoSaveTimer) clearInterval(autoSaveTimer)
})
</script>

<template>
  <div
    class="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-primary)]"
    :class="{ 'cursor-col-resize select-none': resizing, 'typewriter-mode': focusMode.typewriterMode }"
  >
    <MenuBar
      v-if="!focusMode.typewriterMode"
      ref="menuBarRef"
      :folder-name="folderName"
      @open-file="onMenuOpenFile"
      @open-folder="onMenuOpenFolder"
      @save="doSave"
      @close-folder="onMenuCloseFolder"
      @toggle-sidebar="toggleSidebar"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @zoom-reset="zoomReset"
      @open-preferences="onOpenPreferences"
      @toggle-typewriter="toggleTypewriter"
      @open-inspiration="onOpenInspiration"
      @minimize-window="onMinimizeWindow"
      @toggle-maximize="onToggleMaximize"
      @close-window="onCloseWindow"
    />

    <div class="flex flex-1 overflow-hidden">
      <div
        v-if="showSidebar && !focusMode.typewriterMode"
        class="h-full shrink-0 overflow-hidden border-r border-[var(--border)]"
        :style="{ width: panelWidths.left + 'px' }"
      >
        <LeftSidebar
          :tree="tree"
          :folder-name="folderName"
          :current-file-path="currentFilePath"
          @select-file="onSelectFile"
          @create-file="onCreateFile"
          @create-dir="onCreateDir"
          @delete-path="onDeletePath"
          @close-folder="onMenuCloseFolder"
          @open-folder="onMenuOpenFolder"
        />
      </div>

      <div
        v-if="showSidebar && !focusMode.typewriterMode"
        class="h-full w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent)]"
        :class="{ '!bg-[var(--accent)]': resizing }"
        @mousedown="startResize"
      />

      <div
        class="min-w-[300px] flex-1 overflow-hidden"
        :class="{ 'mx-auto max-w-[720px]': focusMode.typewriterMode }"
        :style="{ fontSize: (1 + editorZoom * 0.1) + 'em' }"
      >
        <EditorPanel
          :content="currentContent"
          :encoding="currentEncoding"
          :title="currentTitle"
          :word-count="wordCount"
          :dirty="isDirty"
          :current-file-path="currentFilePath"
          @update-content="onContentUpdate"
          @save="doSave"
        />
      </div>
    </div>

    <Button
      v-if="focusMode.typewriterMode"
      variant="outline"
      size="sm"
      class="!fixed right-4 bottom-4 z-[100] border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--bg-hover)]"
      @click="exitTypewriter"
    >
      退出专注模式 (Esc)
    </Button>

    <StatusBar
      v-if="!focusMode.typewriterMode"
      :word-count="wordCount"
      :file-path="currentFilePath"
      :save-status="saveStatus"
    />

    <div
      v-if="menuLoading"
      class="fixed inset-0 z-[9999] flex items-center justify-center gap-3 bg-black/40"
    >
      <Spinner size="lg" class="text-white" />
      <span class="text-sm text-white">处理中...</span>
    </div>

    <ThemeSettings :visible="showPreferences" @close="showPreferences = false" />
  </div>
</template>
