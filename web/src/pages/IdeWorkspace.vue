<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LeftSidebar from '@/components/ide/LeftSidebar.vue'
import EditorPanel from '@/components/ide/EditorPanel.vue'
import AiChatPanel from '@/components/ide/AiChatPanel.vue'
import StatusBar from '@/components/ide/StatusBar.vue'
import MenuBar from '@/components/ide/MenuBar.vue'
import ThemeSettings from '@/components/ide/ThemeSettings.vue'
import WritingDashboard from '@/components/ide/WritingDashboard.vue'
import OutlinePanel from '@/components/ide/OutlinePanel.vue'
import { useWorkspace } from '@/composables/useWorkspace'
import { useThemeStore } from '@/stores/themeStore'
import { useFocusModeStore } from '@/stores/focusModeStore'
import { useWritingStatsStore } from '@/stores/writingStatsStore'
import type { WordStats } from '@/types/workspace'
import { computeWordStats } from '@/utils/wordStats'
import { buildWorkspaceExport, downloadText } from '@/utils/localExport'
import { isModKey } from '@/utils/platform'
import { isText } from '@/utils/fileTypes'

const props = defineProps<{
  detachPanel?: 'ai' | 'outline' | null
}>()

const workspace = useWorkspace()
const {
  currentWorkspace,
  tree,
  folderName,
  refreshTree,
  restoreLastSession,
} = workspace
const aiError = ref('')

const currentVolId = ref('')
const currentChId = ref('')
const currentFilePath = ref<string | null>(null)
const currentTitle = ref('')
const currentContent = ref('')
const currentEncoding = ref<'utf8' | 'base64'>('utf8')
const isDirty = ref(false)
const saveStatus = ref('就绪')
const savedContent = ref('')
const panelWidths = ref({ left: 260, right: 340 })
const resizing = ref<'left' | 'right' | null>(null)

// View 状态
const showSidebar = ref(true)
const showAiPanel = ref(true)
const editorZoom = ref(0) // 字体缩放等级，0=默认
const showPreferences = ref(false)
const menuBarRef = ref<InstanceType<typeof MenuBar> | null>(null)
const themeStore = useThemeStore()
const focusMode = useFocusModeStore()
const writingStats = useWritingStatsStore()
const showDashboard = ref(false)
const wordStats = ref<WordStats | null>(null)

const workspaceMeta = computed(() => {
  const ws = currentWorkspace.value
  if (!ws) return null
  return {
    world_view: ws.world_view,
    character: ws.character,
    outline: ws.outline,
    style: ws.style,
  }
})

// ── Computed ──────────────────────────────────────────────

const wordCount = computed(() =>
  isText(currentFilePath.value || '') ? [...currentContent.value].length : 0
)

const totalWordCount = computed(() => {
  if (!currentWorkspace.value) return 0
  let total = 0
  for (const vol of currentWorkspace.value.volumes) {
    for (const ch of vol.chapters) {
      total += ch.word_count
    }
  }
  return total
})

const totalChapters = computed(() => {
  if (!currentWorkspace.value) return 0
  return currentWorkspace.value.volumes.reduce((s, v) => s + v.chapters.length, 0)
})

const totalVolumes = computed(() => {
  return currentWorkspace.value?.volumes.length || 0
})

// ── File Selection ─────────────────────────────────────

async function onSelectFile(filePath: string) {
  if (isDirty.value && isText(currentFilePath.value || '')) {
    await doSave()
  }
  saveStatus.value = '加载中...'
  try {
    const result = await workspace.openFileByPath(filePath)
    currentFilePath.value = filePath
    currentTitle.value = filePath.split(/[/\\]/).pop() || filePath
    currentContent.value = result.content
    currentEncoding.value = result.encoding
    savedContent.value = result.content
    isDirty.value = false
    currentVolId.value = ''
    currentChId.value = filePath
    saveStatus.value = '就绪'
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件失败'
    saveStatus.value = '就绪'
  }
}

async function onSelectChapter(volId: string, chId: string, title: string) {
  await onSelectFile(chId)
  currentVolId.value = volId
  currentChId.value = chId
  currentTitle.value = title
}

// ── Save ──────────────────────────────────────────────────

async function doSave() {
  if (!currentFilePath.value || !isDirty.value) return
  if (!isText(currentFilePath.value)) return
  const prevLen = savedContent.value.length
  saveStatus.value = '保存中...'
  try {
    await workspace.saveFileContent(currentFilePath.value, currentContent.value)
    if (currentWorkspace.value) {
      writingStats.load(currentWorkspace.value.id)
      writingStats.recordSave(Math.max(0, currentContent.value.length - prevLen))
    }
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

// ── Workspace Operations ──────────────────────────────────

async function onDeleteWorkspace() {
  if (!currentWorkspace.value) return
  if (confirm('确定要关闭工作区吗？')) {
    if (isDirty.value && isText(currentFilePath.value || '')) await doSave()
    workspace.closeCurrent()
    currentContent.value = ''
    currentTitle.value = ''
    currentVolId.value = ''
    currentChId.value = ''
    currentFilePath.value = null
    currentEncoding.value = 'utf8'
  }
}

async function onDeletePath(targetPath: string, _isDirectory: boolean) {
  if (targetPath === currentFilePath.value) {
    currentContent.value = ''
    currentTitle.value = ''
    currentFilePath.value = null
    currentEncoding.value = 'utf8'
    isDirty.value = false
  }
}

async function onCreateFile(parentPath: string, fileName: string) {
  try {
    const fullPath = await workspace.createFile(parentPath, fileName)
    await onSelectFile(fullPath)
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '创建文件失败'
  }
}

async function onCreateDir(parentPath: string, dirName: string) {
  try {
    await workspace.createDir(parentPath, dirName)
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '创建文件夹失败'
  }
}

async function openDashboard() {
  if (!currentWorkspace.value) return
  writingStats.load(currentWorkspace.value.id)
  wordStats.value = computeWordStats(currentWorkspace.value, writingStats.targetWords)
  showDashboard.value = true
}

function toggleTypewriter() {
  focusMode.toggle()
  if (focusMode.typewriterMode) {
    showSidebar.value = false
    showAiPanel.value = false
  }
}

function exitTypewriter() {
  focusMode.disable()
  showSidebar.value = true
  showAiPanel.value = true
}

// ── File Operations (MenuBar) ────────────────────────────

const menuLoading = ref(false)
const menuError = ref('')

async function onMenuOpenFile() {
  const api = window.electronAPI
  if (!api) {
    menuError.value = '仅桌面端支持打开文件'
    return
  }
  try {
    menuLoading.value = true
    menuError.value = ''

    const files = await api.openFiles()
    if (!files || files.length === 0) { menuLoading.value = false; return }

    const file = files[files.length - 1]
    await onSelectFile(file.path)
    menuLoading.value = false
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件失败'
    menuLoading.value = false
  }
}

async function onMenuOpenFolder() {
  const api = window.electronAPI
  if (!api) {
    menuError.value = '仅桌面端支持打开文件夹'
    return
  }
  try {
    menuLoading.value = true
    menuError.value = ''

    if (isDirty.value && isText(currentFilePath.value || '')) await doSave()

    const ok = await workspace.openLocalFolder()
    if (ok) {
      currentVolId.value = ''
      currentChId.value = ''
      currentFilePath.value = null
      currentTitle.value = ''
      currentContent.value = ''
      currentEncoding.value = 'utf8'
      savedContent.value = ''
      isDirty.value = false
    }
    menuLoading.value = false
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件夹失败'
    menuLoading.value = false
  }
}

async function onMenuCloseWorkspace() {
  if (!currentWorkspace.value) return
  if (isDirty.value && isText(currentFilePath.value || '')) await doSave()
  workspace.closeCurrent()
  currentContent.value = ''
  currentTitle.value = ''
  currentVolId.value = ''
  currentChId.value = ''
  currentFilePath.value = null
  currentEncoding.value = 'utf8'
}

// ── AI Generation ─────────────────────────────────────────

async function onGenerate(_opts: unknown) {
  aiError.value = '创作模式需直连 LLM，前端版暂未接入后端'
}

function onInsertGenerated(text: string) {
  if (!isDirty.value && currentContent.value !== '') {
    // Append after existing content
    currentContent.value = currentContent.value + '\n\n' + text
  } else {
    currentContent.value = text
  }
  isDirty.value = true
}

// ── Export ────────────────────────────────────────────────

async function onExportTxt() {
  if (!currentWorkspace.value) return
  try {
    const text = await buildWorkspaceExport(
      currentWorkspace.value,
      workspace.loadChapterContent,
      'txt',
    )
    downloadText(text, `${currentWorkspace.value.book_name}.txt`)
  } catch {
    saveStatus.value = '导出失败'
  }
}

async function onExportMd() {
  if (!currentWorkspace.value) return
  try {
    const text = await buildWorkspaceExport(
      currentWorkspace.value,
      workspace.loadChapterContent,
      'md',
    )
    downloadText(text, `${currentWorkspace.value.book_name}.md`)
  } catch {
    saveStatus.value = '导出失败'
  }
}

function onExportUnavailable() {
  saveStatus.value = 'EPUB/DOCX/平台导出需后续在前端实现'
}

function onOpenInspiration() {
  const wsId = currentWorkspace.value?.id ?? 'default'
  window.electronAPI?.openInspirationWindow?.(wsId)
}

function onDetachPanel(panel: 'ai' | 'outline') {
  const wsId = currentWorkspace.value?.id
  if (!wsId) return
  window.electronAPI?.openDetachedPanel?.(panel, wsId)
}

function onJumpChapter(volId: string, chId: string, title: string) {
  onSelectChapter(volId, chId, title)
}

// ── View Menu Actions ─────────────────────────────────────

function toggleSidebar() { showSidebar.value = !showSidebar.value }
function toggleAiPanel() { showAiPanel.value = !showAiPanel.value }
function zoomIn() { editorZoom.value = Math.min(5, editorZoom.value + 1) }
function zoomOut() { editorZoom.value = Math.max(-3, editorZoom.value - 1) }
function zoomReset() { editorZoom.value = 0 }
function resetLayout() {
  panelWidths.value = { left: 260, right: 340 }
  showSidebar.value = true
  showAiPanel.value = true
  editorZoom.value = 0
}

// ── Desktop Window Actions (File menu) ────────────────────

function onOpenPreferences() {
  showPreferences.value = true
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && focusMode.typewriterMode) {
    exitTypewriter()
    return
  }
  if (isModKey(e) && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    onOpenInspiration()
    return
  }
  if (isModKey(e) && !e.altKey && e.key === ',') {
    e.preventDefault()
    onOpenPreferences()
  }
}

async function onMinimizeWindow() {
  await window.electronAPI?.minimizeWindow()
}

async function onToggleMaximize() {
  const api = window.electronAPI
  if (!api) return
  await api.toggleMaximizeWindow()
  await menuBarRef.value?.syncMaximizedState()
}

function onCloseWindow() {
  window.electronAPI?.closeWindow()
}

// ── Resize ────────────────────────────────────────────────

function startResize(side: 'left' | 'right') {
  resizing.value = side
}

function onResizeMove(e: MouseEvent) {
  if (resizing.value === 'left') {
    panelWidths.value.left = Math.max(180, Math.min(400, e.clientX))
  } else if (resizing.value === 'right') {
    panelWidths.value.right = Math.max(260, Math.min(500, window.innerWidth - e.clientX))
  }
}

function stopResize() {
  resizing.value = null
}

// Auto-save every 30 seconds
let autoSaveTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
  document.addEventListener('keydown', onGlobalKeydown)
  themeStore.applyTheme()
  autoSaveTimer = setInterval(() => {
    if (isDirty.value && isText(currentFilePath.value || '')) doSave()
  }, 30000)

  const api = window.electronAPI
  if (api) {
    await restoreLastSession()
    const lastFile = workspace.currentFilePath.value
    if (lastFile) {
      try {
        await onSelectFile(lastFile)
      } catch {
        // ignore restore errors
      }
    }

    if (api.onOpenFile) {
      api.onOpenFile(async (filePath: string) => {
        try {
          if (isDirty.value && isText(currentFilePath.value || '')) await doSave()
          await onSelectFile(filePath)
        } catch {
          menuError.value = '打开文件失败'
        }
      })
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
  <div class="ide-workspace" :class="{ resizing: !!resizing, 'typewriter-mode': focusMode.typewriterMode, 'detach-mode': !!props.detachPanel }">
    <!-- Detached panel only -->
    <div v-if="props.detachPanel === 'ai'" class="detach-full">
      <AiChatPanel
        :connected="!!currentWorkspace"
        :streaming="false"
        :stream-text="''"
        :log-messages="[]"
        :tool-calls="[]"
        :error="aiError"
        :chapter-id="currentChId"
        :workspace-id="currentWorkspace?.id"
        :workspace-name="currentWorkspace?.book_name"
        :workspace-meta="workspaceMeta"
        @generate="onGenerate"
        @stop="() => {}"
        @insert="onInsertGenerated"
      />
    </div>
    <div v-else-if="props.detachPanel === 'outline'" class="detach-full">
      <OutlinePanel
        :workspace-id="currentWorkspace?.id ?? null"
        @jump-chapter="onJumpChapter"
      />
    </div>

    <template v-else>
    <!-- Menu Bar (top) -->
    <MenuBar
      v-if="!focusMode.typewriterMode"
      ref="menuBarRef"
      class="menu-bar-top"
      :workspace-name="currentWorkspace?.book_name"
      @open-file="onMenuOpenFile"
      @open-folder="onMenuOpenFolder"
      @save="doSave"
      @export-txt="onExportTxt"
      @export-md="onExportMd"
      @export-epub="onExportUnavailable"
      @export-docx="onExportUnavailable"
      @export-fanqie="onExportUnavailable"
      @export-qidian="onExportUnavailable"
      @export-jinjiang="onExportUnavailable"
      @close-workspace="onMenuCloseWorkspace"
      @toggle-sidebar="toggleSidebar"
      @toggle-ai-panel="toggleAiPanel"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @zoom-reset="zoomReset"
      @reset-layout="resetLayout"
      @open-preferences="onOpenPreferences"
      @toggle-typewriter="toggleTypewriter"
      @open-dashboard="openDashboard"
      @open-inspiration="onOpenInspiration"
      @detach-panel="onDetachPanel"
      @minimize-window="onMinimizeWindow"
      @toggle-maximize="onToggleMaximize"
      @close-window="onCloseWindow"
    />

    <!-- Main content area -->
    <div class="ide-main">
    <!-- Left Panel: File Tree -->
    <div v-if="showSidebar && !focusMode.typewriterMode" class="panel left-panel" :style="{ width: panelWidths.left + 'px' }">
      <LeftSidebar
        :tree="tree"
        :folder-name="folderName"
        :current-file-path="currentFilePath"
        :workspace="currentWorkspace"
        @select-file="onSelectFile"
        @create-file="onCreateFile"
        @create-dir="onCreateDir"
        @delete-path="onDeletePath"
        @close-folder="onDeleteWorkspace"
        @open-folder="onMenuOpenFolder"
        @refresh-tree="refreshTree"
        @jump-chapter="onJumpChapter"
      />
    </div>

    <!-- Resize Handle -->
    <div v-if="showSidebar && !focusMode.typewriterMode" class="resize-handle" @mousedown="startResize('left')"></div>

    <!-- Center Panel: Editor -->
    <div class="panel center-panel" :style="{ fontSize: (1 + editorZoom * 0.1) + 'em' }">
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

    <!-- Resize Handle -->
    <div v-if="showAiPanel && !focusMode.typewriterMode" class="resize-handle" @mousedown="startResize('right')"></div>

    <!-- Right Panel: AI Chat -->
    <div v-if="showAiPanel && !focusMode.typewriterMode" class="panel right-panel" :style="{ width: panelWidths.right + 'px' }">
      <AiChatPanel
        :connected="!!currentWorkspace"
        :streaming="false"
        :stream-text="''"
        :log-messages="[]"
        :tool-calls="[]"
        :error="aiError"
        :chapter-id="currentChId"
        :workspace-id="currentWorkspace?.id"
        :workspace-name="currentWorkspace?.book_name"
        :workspace-meta="workspaceMeta"
        @generate="onGenerate"
        @stop="() => {}"
        @insert="onInsertGenerated"
      />
    </div>
    </div>

    <button v-if="focusMode.typewriterMode" class="typewriter-exit" @click="exitTypewriter">退出专注模式 (Esc)</button>

    <!-- Status Bar -->
    <StatusBar
      v-if="!focusMode.typewriterMode"
      class="status-bar"
      :word-count="totalWordCount"
      :chapter-count="totalChapters"
      :volume-count="totalVolumes"
      :connected="!!currentWorkspace"
      :streaming="false"
      :save-status="saveStatus"
      @export-txt="onExportTxt"
      @export-md="onExportMd"
      @open-dashboard="openDashboard"
    />

    <!-- Loading overlay -->
    <div v-if="menuLoading" class="loading-overlay">
      <span>正在导入文件...</span>
    </div>
    <div v-if="menuError" class="error-toast">{{ menuError }}</div>

    <ThemeSettings :visible="showPreferences" @close="showPreferences = false" />

    <WritingDashboard
      :visible="showDashboard"
      :workspace-id="currentWorkspace?.id ?? null"
      :stats="wordStats"
      @close="showDashboard = false"
    />
    </template>
  </div>
</template>

<style scoped>
.ide-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}

.menu-bar-top {
  flex-shrink: 0;
  width: 100%;
}

.ide-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 0;
}

.panel {
  height: 100%;
  overflow: hidden;
}

.left-panel {
  flex-shrink: 0;
  border-right: 1px solid var(--border);
}

.center-panel {
  flex: 1;
  min-width: 300px;
  border-right: 1px solid var(--border);
}

.right-panel {
  flex-shrink: 0;
}

.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  background: var(--bg-primary);
  transition: background 0.15s;
}
.resize-handle:hover,
.resizing .resize-handle {
  background: var(--accent);
}

.status-bar {
  flex-shrink: 0;
  width: 100%;
}

/* ── Loading / Error ───────────────────────────────────── */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  z-index: 9999;
}

.error-toast {
  position: fixed;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--danger);
  color: #fff;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  animation: toastIn 0.2s ease;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.ide-workspace.typewriter-mode .center-panel {
  max-width: 720px;
  margin: 0 auto;
}

.typewriter-exit {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 100;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-sub);
  cursor: pointer;
  font-size: 12px;
}
.typewriter-exit:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.detach-full {
  flex: 1;
  height: 100vh;
  overflow: hidden;
}
.ide-workspace.detach-mode {
  display: flex;
  flex-direction: column;
}
</style>
