<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import LeftSidebar from '@/components/ide/LeftSidebar.vue'
import EditorPanel from '@/components/ide/EditorPanel.vue'
import AiChatPanel from '@/components/ide/AiChatPanel.vue'
import StatusBar from '@/components/ide/StatusBar.vue'
import MenuBar from '@/components/ide/MenuBar.vue'
import ThemeSettings from '@/components/ide/ThemeSettings.vue'
import WritingDashboard from '@/components/ide/WritingDashboard.vue'
import ChapterHistoryModal from '@/components/ide/ChapterHistoryModal.vue'
import OutlinePanel from '@/components/ide/OutlinePanel.vue'
import { useWorkspace } from '@/composables/useWorkspace'
import { useWebSocket } from '@/composables/useWebSocket'
import { useThemeStore } from '@/stores/themeStore'
import { useFocusModeStore } from '@/stores/focusModeStore'
import { useWritingStatsStore } from '@/stores/writingStatsStore'
import type { WordStats } from '@/api/ide'
import { createWorkspace, createVolume, createChapter, saveChapterContent } from '@/api/ide'

const props = defineProps<{
  initialWorkspaceId?: string | null
  detachPanel?: 'ai' | 'outline' | null
}>()

const workspace = useWorkspace()
const ws = useWebSocket()

const currentVolId = ref('')
const currentChId = ref('')
const currentTitle = ref('')
const currentContent = ref('')
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
const showChapterHistory = ref(false)
const wordStats = ref<WordStats | null>(null)

const workspaceMeta = computed(() => {
  const ws = workspace.currentWorkspace.value
  if (!ws) return null
  return {
    world_view: ws.world_view,
    character: ws.character,
    outline: ws.outline,
    style: ws.style,
  }
})

// ── Computed ──────────────────────────────────────────────

const wordCount = computed(() => [...currentContent.value].length)

const totalWordCount = computed(() => {
  if (!workspace.currentWorkspace.value) return 0
  let total = 0
  for (const vol of workspace.currentWorkspace.value.volumes) {
    for (const ch of vol.chapters) {
      total += ch.word_count
    }
  }
  return total
})

const totalChapters = computed(() => {
  if (!workspace.currentWorkspace.value) return 0
  return workspace.currentWorkspace.value.volumes.reduce((s, v) => s + v.chapters.length, 0)
})

const totalVolumes = computed(() => {
  return workspace.currentWorkspace.value?.volumes.length || 0
})

// ── Chapter Selection ─────────────────────────────────────

async function onSelectChapter(volId: string, chId: string, title: string) {
  if (isDirty.value) {
    await doSave()
  }
  currentVolId.value = volId
  currentChId.value = chId
  currentTitle.value = title
  isDirty.value = false
  saveStatus.value = '加载中...'

  const content = await workspace.loadChapterContent(volId, chId)
  currentContent.value = content
  savedContent.value = content
  saveStatus.value = '就绪'
}

// ── Save ──────────────────────────────────────────────────

async function doSave() {
  if (!currentChId.value || !currentVolId.value || !isDirty.value) return
  const prevLen = savedContent.value.length
  saveStatus.value = '保存中...'
  await workspace.saveChapterContent(currentVolId.value, currentChId.value, currentContent.value)
  const delta = Math.max(0, currentContent.value.length - prevLen)
  if (workspace.currentWorkspace.value) {
    writingStats.load(workspace.currentWorkspace.value.id)
    writingStats.recordSave(delta)
  }
  savedContent.value = currentContent.value
  isDirty.value = false
  saveStatus.value = '已保存 ' + new Date().toLocaleTimeString()
  if (workspace.currentWorkspace.value) {
    await workspace.openWorkspace(workspace.currentWorkspace.value.id)
  }
}

function onContentUpdate(content: string) {
  currentContent.value = content
  if (content !== savedContent.value) {
    isDirty.value = true
  }
}

// ── Workspace Operations ──────────────────────────────────

async function onCreateWorkspace(name: string) {
  const ws = await workspace.create(name)
  if (ws) {
    await workspace.openWorkspace(ws.id)
    ws.connect()
  }
}

async function onCreateVolume(name: string) {
  await workspace.addVolume(name)
}

async function onCreateChapter(volId: string, title: string) {
  await workspace.addChapter(volId, title)
}

async function onDeleteWorkspace() {
  if (!workspace.currentWorkspace.value) return
  if (confirm('确定要关闭工作区吗？')) {
    const id = workspace.currentWorkspace.value.id
    workspace.currentWorkspace.value = null
    currentContent.value = ''
    currentTitle.value = ''
    ws.disconnect()
  }
}

async function onDeleteVolume(volId: string) {
  if (confirm('确定删除该卷及其所有章节？可在回收站中 7 天内恢复。')) {
    await workspace.removeVolume(volId)
    if (volId === currentVolId.value) {
      currentContent.value = ''
      currentTitle.value = ''
      currentChId.value = ''
      currentVolId.value = ''
    }
  }
}

async function onSidebarRestored() {
  if (workspace.currentWorkspace.value) {
    await workspace.openWorkspace(workspace.currentWorkspace.value.id)
  }
}

async function openDashboard() {
  if (!workspace.currentWorkspace.value) return
  writingStats.load(workspace.currentWorkspace.value.id)
  wordStats.value = await workspace.loadWordStats(writingStats.targetWords)
  showDashboard.value = true
}

async function refreshWordStats() {
  if (!workspace.currentWorkspace.value) return
  wordStats.value = await workspace.loadWordStats(writingStats.targetWords)
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

function onRestoreChapter(content: string) {
  currentContent.value = content
  isDirty.value = true
  doSave()
}

async function onDeleteChapter(volId: string, chId: string) {
  if (confirm('确定删除该章节？')) {
    await workspace.removeChapter(volId, chId)
    if (chId === currentChId.value) {
      currentContent.value = ''
      currentTitle.value = ''
    }
  }
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

    // 1. 打开文件选择对话框（多选）
    const files = await api.openFiles({ filters: [{ name: 'Markdown / 文本', extensions: ['md', 'txt'] }] })
    if (!files || files.length === 0) { menuLoading.value = false; return }

    // 2. 如果没有工作区，先创建一个
    let wsId = workspace.currentWorkspace.value?.id
    if (!wsId) {
      const ws = await createWorkspace(files.length === 1
        ? files[0].name.replace(/\.(md|txt)$/i, '')
        : '导入的文件')
      wsId = ws.id
    }

    // 3. 创建卷并导入文件
    const vol = await createVolume(wsId, '导入的文件')
    for (const file of files) {
      const ch = await createChapter(wsId, vol.id, file.name.replace(/\.(md|txt)$/i, ''))
      await saveChapterContent(wsId, vol.id, ch.id, file.content)
    }

    // 4. 刷新工作区
    await workspace.openWorkspace(wsId)
    if (!ws.connected.value) ws.connect()
    menuLoading.value = false
  } catch (err: any) {
    menuError.value = err?.message || '打开文件失败'
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

    // 1. 打开文件夹选择对话框
    const folderPath = await api.openFolder()
    if (!folderPath) { menuLoading.value = false; return }

    // 2. 扫描文件夹
    const files = await api.scanFolder(folderPath)
    if (files.length === 0) {
      menuError.value = '未找到 .md 或 .txt 文件'
      menuLoading.value = false
      return
    }

    // 3. 创建工作区
    const folderName = folderPath.split(/[/\\]/).pop() || '导入内容'
    const ws = await createWorkspace(folderName)

    // 4. 创建卷（按目录分组）
    const dirs = [...new Set(files.map(f => {
      const parts = f.relativePath.split('/')
      parts.pop()
      return parts.join('/') || '根目录'
    }))]

    for (const dir of dirs) {
      const volumeName = dir === '根目录' ? folderName : dir
      const vol = await createVolume(ws.id, volumeName)

      const dirFiles = files.filter(f => {
        const parts = f.relativePath.split('/')
        parts.pop()
        return (parts.join('/') || '根目录') === dir
      })

      for (const file of dirFiles) {
        const ch = await createChapter(ws.id, vol.id, file.name.replace(/\.(md|txt)$/i, ''))
        await saveChapterContent(ws.id, vol.id, ch.id, file.content)
      }
    }

    // 5. 刷新工作区
    await workspace.openWorkspace(ws.id)
    if (!ws.connected.value) ws.connect()
    menuLoading.value = false
  } catch (err: any) {
    menuError.value = err?.message || '打开文件夹失败'
    menuLoading.value = false
  }
}

async function onMenuCloseWorkspace() {
  if (!workspace.currentWorkspace.value) return
  if (isDirty.value) await doSave()
  workspace.currentWorkspace.value = null
  currentContent.value = ''
  currentTitle.value = ''
  ws.disconnect()
}

// ── AI Generation ─────────────────────────────────────────

async function onGenerate(opts: { type: 'chat' | 'create' | 'new_chapter'; mode: string; instruction: string; temperature: number; maxTokens: number; model: string; history: { role: 'user' | 'assistant'; content: string }[] }) {
  // 重置错误状态
  ws.error.value = ''

  // 没有工作区时自动创建
  if (!workspace.currentWorkspace.value) {
    ws.error.value = '正在创建工作区...'
    const wsItem = await workspace.create('我的工作区')
    if (!wsItem) {
      ws.error.value = '创建工作区失败，请刷新页面重试'
      return
    }
    await workspace.openWorkspace(wsItem.id)
  }

  // WebSocket 未连接时自动连接
  if (!ws.connected.value) {
    ws.connect()
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (ws.connected.value) break
    }
    if (!ws.connected.value) {
      ws.error.value = '连接服务器失败，请确认后端已启动（端口 8080）'
      return
    }
  }

  ws.send({
    type: opts.type,
    mode: opts.mode,
    workspace_id: workspace.currentWorkspace.value!.id,
    volume_id: currentVolId.value || '',
    chapter_id: currentChId.value || '',
    instruction: opts.instruction,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    model: opts.model,
    history: opts.history,
  })
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
  if (!workspace.currentWorkspace.value) return
  try {
    const { exportTxt } = await import('@/api/ide')
    const blob = await exportTxt(workspace.currentWorkspace.value.id)
    downloadBlob(blob, `${workspace.currentWorkspace.value.book_name}.txt`)
  } catch {
    saveStatus.value = '导出失败'
  }
}

async function onExportMd() {
  if (!workspace.currentWorkspace.value) return
  try {
    const { exportMd } = await import('@/api/ide')
    const blob = await exportMd(workspace.currentWorkspace.value.id)
    downloadBlob(blob, `${workspace.currentWorkspace.value.book_name}.md`)
  } catch {
    saveStatus.value = '导出失败'
  }
}

async function exportBlob(fn: (id: string) => Promise<Blob>, ext: string) {
  if (!workspace.currentWorkspace.value) return
  try {
    const blob = await fn(workspace.currentWorkspace.value.id)
    downloadBlob(blob, `${workspace.currentWorkspace.value.book_name}.${ext}`)
  } catch {
    saveStatus.value = '导出失败'
  }
}

async function onExportEpub() {
  const { exportEpub } = await import('@/api/ide')
  await exportBlob(exportEpub, 'epub')
}

async function onExportDocx() {
  const { exportDocx } = await import('@/api/ide')
  await exportBlob(exportDocx, 'docx')
}

async function onExportFanqie() {
  const { exportPlatform } = await import('@/api/ide')
  await exportBlob((id) => exportPlatform(id, 'fanqie'), 'txt')
}

async function onExportQidian() {
  const { exportPlatform } = await import('@/api/ide')
  await exportBlob((id) => exportPlatform(id, 'qidian'), 'txt')
}

async function onExportJinjiang() {
  const { exportPlatform } = await import('@/api/ide')
  await exportBlob((id) => exportPlatform(id, 'jjwxc'), 'txt')
}

function onOpenInspiration() {
  const wsId = workspace.currentWorkspace.value?.id ?? 'default'
  window.electronAPI?.openInspirationWindow?.(wsId)
}

function onDetachPanel(panel: 'ai' | 'outline') {
  const wsId = workspace.currentWorkspace.value?.id
  if (!wsId) return
  window.electronAPI?.openDetachedPanel?.(panel, wsId)
}

function onJumpChapter(volId: string, chId: string, title: string) {
  onSelectChapter(volId, chId, title)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    onOpenInspiration()
    return
  }
  if (e.ctrlKey && !e.altKey && e.key === ',') {
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

// ── File Menu Actions (new workspace/volume/chapter) ──────

async function onMenuNewWorkspace() {
  const ws = await workspace.create('新工作区')
  if (ws) {
    await workspace.openWorkspace(ws.id)
    if (!ws.connected.value) ws.connect()
  }
}

async function onMenuNewVolume() {
  if (!workspace.currentWorkspace.value) return
  const name = prompt('请输入卷名：')
  if (name) await workspace.addVolume(name)
}

async function onMenuNewChapter() {
  if (!workspace.currentWorkspace.value) return
  const wsd = workspace.currentWorkspace.value
  if (wsd.volumes.length === 0) {
    const vol = await workspace.addVolume('第一卷')
    if (!vol) return
    const title = prompt('请输入章节标题：')
    if (title) await workspace.addChapter(vol.id, title)
  } else {
    const vol = wsd.volumes[wsd.volumes.length - 1]
    const title = prompt('请输入章节标题：')
    if (title) await workspace.addChapter(vol.id, title)
  }
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
    if (isDirty.value) doSave()
  }, 30000)

  // Auto-open workspace if passed via prop
  if (props.initialWorkspaceId) {
    await workspace.openWorkspace(props.initialWorkspaceId)
    writingStats.load(props.initialWorkspaceId)
    ws.connect()
  } else {
    // 没有工作区时自动创建一个默认的，确保AI对话可用
    const wsItem = await workspace.create('我的工作区')
    if (wsItem) {
      await workspace.openWorkspace(wsItem.id)
      ws.connect()
    }
  }
})

// Watch for initialWorkspaceId changes (e.g. when navigating from Landing)
watch(() => props.initialWorkspaceId, (newId) => {
  if (newId) {
    workspace.openWorkspace(newId).then(() => {
      ws.connect()
    })
  }
})

// AI 完成创作后自动刷新目录树（AI 可能新建了卷/章节）
watch(() => ws.streaming.value, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming && workspace.currentWorkspace.value) {
    // 刷新工作区目录
    workspace.openWorkspace(workspace.currentWorkspace.value.id)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('keydown', onGlobalKeydown)
  if (autoSaveTimer) clearInterval(autoSaveTimer)
  ws.disconnect()
})
</script>

<template>
  <div class="ide-workspace" :class="{ resizing: !!resizing, 'typewriter-mode': focusMode.typewriterMode, 'detach-mode': !!props.detachPanel }">
    <!-- Detached panel only -->
    <div v-if="props.detachPanel === 'ai'" class="detach-full">
      <AiChatPanel
        :connected="ws.connected.value"
        :streaming="ws.streaming.value"
        :stream-text="ws.streamText.value"
        :log-messages="ws.logMessages.value"
        :tool-calls="ws.toolCalls.value"
        :error="ws.error.value"
        :chapter-id="currentChId"
        :workspace-id="workspace.currentWorkspace.value?.id"
        :workspace-name="workspace.currentWorkspace.value?.book_name"
        :workspace-meta="workspaceMeta"
        @generate="onGenerate"
        @stop="ws.stop()"
        @insert="onInsertGenerated"
      />
    </div>
    <div v-else-if="props.detachPanel === 'outline'" class="detach-full">
      <OutlinePanel
        :workspace-id="workspace.currentWorkspace.value?.id ?? null"
        @jump-chapter="onJumpChapter"
      />
    </div>

    <template v-else>
    <!-- Menu Bar (top) -->
    <MenuBar
      v-if="!focusMode.typewriterMode"
      ref="menuBarRef"
      class="menu-bar-top"
      :workspace-name="workspace.currentWorkspace.value?.book_name"
      @open-file="onMenuOpenFile"
      @open-folder="onMenuOpenFolder"
      @save="doSave"
      @export-txt="onExportTxt"
      @export-md="onExportMd"
      @export-epub="onExportEpub"
      @export-docx="onExportDocx"
      @export-fanqie="onExportFanqie"
      @export-qidian="onExportQidian"
      @export-jinjiang="onExportJinjiang"
      @close-workspace="onMenuCloseWorkspace"
      @new-workspace="onMenuNewWorkspace"
      @new-volume="onMenuNewVolume"
      @new-chapter="onMenuNewChapter"
      @toggle-sidebar="toggleSidebar"
      @toggle-ai-panel="toggleAiPanel"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @zoom-reset="zoomReset"
      @reset-layout="resetLayout"
      @open-preferences="onOpenPreferences"
      @toggle-typewriter="toggleTypewriter"
      @open-dashboard="openDashboard"
      @open-chapter-history="showChapterHistory = true"
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
        :workspace="workspace.currentWorkspace.value"
        @select-chapter="onSelectChapter"
        @create-workspace="onCreateWorkspace"
        @create-volume="onCreateVolume"
        @create-chapter="onCreateChapter"
        @delete-workspace="onDeleteWorkspace"
        @delete-volume="onDeleteVolume"
        @delete-chapter="onDeleteChapter"
        @restored="onSidebarRestored"
        @jump-chapter="onJumpChapter"
      />
    </div>

    <!-- Resize Handle -->
    <div v-if="showSidebar && !focusMode.typewriterMode" class="resize-handle" @mousedown="startResize('left')"></div>

    <!-- Center Panel: Editor -->
    <div class="panel center-panel" :style="{ fontSize: (1 + editorZoom * 0.1) + 'em' }">
      <EditorPanel
        :content="currentContent"
        :title="currentTitle"
        :word-count="wordCount"
        :dirty="isDirty"
        @update-content="onContentUpdate"
        @save="doSave"
      />
    </div>

    <!-- Resize Handle -->
    <div v-if="showAiPanel && !focusMode.typewriterMode" class="resize-handle" @mousedown="startResize('right')"></div>

    <!-- Right Panel: AI Chat -->
    <div v-if="showAiPanel && !focusMode.typewriterMode" class="panel right-panel" :style="{ width: panelWidths.right + 'px' }">
      <AiChatPanel
        :connected="ws.connected.value"
        :streaming="ws.streaming.value"
        :stream-text="ws.streamText.value"
        :log-messages="ws.logMessages.value"
        :tool-calls="ws.toolCalls.value"
        :error="ws.error.value"
        :chapter-id="currentChId"
        :workspace-id="workspace.currentWorkspace.value?.id"
        :workspace-name="workspace.currentWorkspace.value?.book_name"
        :workspace-meta="workspaceMeta"
        @generate="onGenerate"
        @stop="ws.stop()"
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
      :connected="ws.connected.value"
      :streaming="ws.streaming.value"
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
      :workspace-id="workspace.currentWorkspace.value?.id ?? null"
      :stats="wordStats"
      @close="showDashboard = false"
    />

    <ChapterHistoryModal
      :visible="showChapterHistory"
      :workspace-id="workspace.currentWorkspace.value?.id ?? null"
      :vol-id="currentVolId"
      :ch-id="currentChId"
      :current-content="currentContent"
      @close="showChapterHistory = false"
      @restore="onRestoreChapter"
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
}

.panel {
  height: 100%;
  overflow: hidden;
}

.left-panel {
  flex-shrink: 0;
}

.center-panel {
  flex: 1;
  min-width: 300px;
}

.right-panel {
  flex-shrink: 0;
}

.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
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
