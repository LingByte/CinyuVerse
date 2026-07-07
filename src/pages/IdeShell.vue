<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, watch, nextTick } from 'vue'
import { Files, BookOpen, List, Search, History, ListTodo, Archive } from 'lucide-vue-next'
import MenuBar from '@/components/layouts/MenuBar.vue'
import StatusBar from '@/components/layouts/StatusBar.vue'
import ActivityBar from '@/components/layouts/ActivityBar.vue'
import PanelShell from '@/components/layouts/PanelShell.vue'
import ExplorerTree from '@/components/explorer/ExplorerTree.vue'
import MetaPanel from '@/components/writing/MetaPanel.vue'
import OutlinePanel from '@/components/writing/OutlinePanel.vue'
import EditorWorkspace from '@/components/editor/EditorWorkspace.vue'
import type { EditorWorkspaceHandle } from '@/components/editor/EditorWorkspace.vue'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import AiAssistantDrawer from '@/components/ai/AiAssistantDrawer.vue'
import SearchPanel from '@/components/search/SearchPanel.vue'
import BottomPanel, { type PanelTab } from '@/components/terminal/BottomPanel.vue'
import ThemeSettings from '@/components/theme/ThemeSettings.vue'
import WritingDashboard from '@/components/writing/WritingDashboard.vue'
import CreateBookDialog from '@/components/story/CreateBookDialog.vue'
import { provideViewerRegistry } from '@/components/viewers/ViewerRegistry'
import { defaultRenderers } from '@/components/viewers/defaultRenderers'
import { useWorkspace } from '@/features/workspace/composables/useWorkspace'
import { useThemeStore } from '@/features/theme/stores/themeStore'
import { useWritingStatsStore } from '@/features/writing/stores/writingStatsStore'
import { useStoryStore } from '@/features/story/stores/storyStore'
import type { WordStats } from '@/core/types/workspace'
import type { ActivityBarItem } from '@/types/activity-bar'
import { computeWordStats } from '@/features/writing/utils/wordStats'
import { buildWorkspaceExport, downloadText } from '@/features/workspace/utils/localExport'
import BackgroundLayer from '@/components/theme/BackgroundLayer.vue'
import { chapterFilePath } from '@/features/workspace/utils/bookProjectPaths'
import { storyChapterPath } from '@/core/types/story'
import { isModKey } from '@/core/platform'
import ProjectSettings from '@/components/writing/ProjectSettings.vue'
import ExportDialog from '@/components/writing/ExportDialog.vue'
import VersionPanel from '@/components/writing/VersionPanel.vue'
import AiTaskPanel from '@/components/writing/AiTaskPanel.vue'
import BackupPanel from '@/components/writing/BackupPanel.vue'
import PlotAuditDialog from '@/components/writing/PlotAuditDialog.vue'
import ExtensionHub from '@/components/writing/ExtensionHub.vue'
import { useEditorAi, type EditorAiAction } from '@/features/workspace/composables/useEditorAi'
import type { OutlineNode } from '@/core/types/workspace'
import { desktopApi, getFileName } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import { useShellSyncStore } from '@/features/shell/stores/shellSyncStore'

const props = defineProps<{
  detachPanel?: 'ai' | 'outline' | null
}>()

provideViewerRegistry(shallowRef(defaultRenderers))

const workspace = useWorkspace()
const {
  currentWorkspace,
  tree,
  folderName,
  refreshTree,
  restoreLastSession,
  localRootPath,
  isBookProject,
  bookChapters,
  libraryBooks,
  libraryRootPath,
  bookRootPath,
  chapterPath,
} = workspace

const isLibrary = computed(() => !!libraryRootPath.value)

const workspaceRef = ref<EditorWorkspaceHandle | null>(null)
const shellSync = useShellSyncStore()
const activePanelId = ref('explorer')
const aiPanelOpen = ref(false)
const saveStatus = ref('就绪')
const menuError = ref('')
const menuLoading = ref(false)
const showCreateBookDialog = ref(false)
const createBookError = ref('')
const createBookStage = ref<'idle' | 'pick-folder' | 'creating' | 'generating'>('idle')
const showPreferences = ref(false)
const showProjectSettings = ref(false)
const showExportDialog = ref(false)
const editorAi = useEditorAi()
const showDashboard = ref(false)
const showExtensionHub = ref(false)
const showPlotAudit = ref(false)
const plotAuditData = ref({ summary: '', markdown: '', issues: [] as { severity: string; category: string; message: string }[] })
const wordStats = ref<WordStats | null>(null)
const currentChId = ref('')
const leftPanelWidth = ref(280)
const isLeftDragging = ref(false)
const leftDragStartX = ref(0)
const leftDragStartWidth = ref(0)
const bottomPanelOpen = ref(false)
const bottomPanelTab = ref<PanelTab>('terminal')
const bottomPanelHeight = ref(220)
const outputText = ref('')

const rootPath = computed(() => localRootPath.value ?? '')

const themeStore = useThemeStore()
const writingStats = useWritingStatsStore()
const storyStore = useStoryStore()

const totalWordCount = computed(() => {
  if (!currentWorkspace.value) return 0
  let total = 0
  for (const vol of currentWorkspace.value.volumes) {
    for (const ch of vol.chapters) total += ch.word_count
  }
  return total
})

const totalChapters = computed(() =>
  currentWorkspace.value?.volumes.reduce((s, v) => s + v.chapters.length, 0) ?? 0,
)

const totalVolumes = computed(() => currentWorkspace.value?.volumes.length ?? 0)

const currentBookChapterNum = computed(() => {
  const path = currentChId.value
  if (!path || !isBookProject.value) return null
  for (const ch of bookChapters.value) {
    const p = chapterPath(ch.number)
    if (p === path) return ch.number
  }
  return null
})

const activityItems: ActivityBarItem[] = [
  { id: 'explorer', label: '书籍', icon: Files },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'meta', label: '设定', icon: BookOpen },
  { id: 'outline', label: '大纲', icon: List },
  { id: 'versions', label: '版本', icon: History },
  { id: 'tasks', label: '任务', icon: ListTodo },
  { id: 'backup', label: '备份', icon: Archive },
]

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value
}

const currentFilePath = computed(() => workspace.currentFilePath.value)

async function openFile(path: string) {
  currentChId.value = path
  await workspaceRef.value?.openFile(path)
  workspace.currentFilePath.value = path
}

async function onSelectChapter(volId: string, chId: string, _title: string) {
  void volId
  await openFile(chId)
}

async function onMenuOpenFolder() {
  if (!isDesktop()) {
    menuError.value = '仅桌面端支持打开文件夹'
    return
  }
  menuLoading.value = true
  menuError.value = ''
  try {
    const ok = await workspace.openLocalFolder()
    if (ok) currentChId.value = ''
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件夹失败'
  } finally {
    menuLoading.value = false
  }
}

function onOpenAiPanel() {
  aiPanelOpen.value = true
}

function onCreateBook() {
  if (!isDesktop()) {
    menuError.value = '仅桌面端支持新建书籍'
    return
  }
  menuError.value = ''
  createBookError.value = ''
  createBookStage.value = 'idle'
  showCreateBookDialog.value = true
}

async function onCreateBookConfirm({ title, brief }: { title: string; brief: string }) {
  menuLoading.value = true
  menuError.value = ''
  createBookError.value = ''
  try {
    const {
      createBookFolder,
      createBookInLibrary,
      emptyBookState,
      loadBookState,
      enrichBookFromBackend,
    } = await import('@/services/bookProjectStore')

    let parent: string | null = null
    if (!libraryRootPath.value) {
      createBookStage.value = 'pick-folder'
      saveStatus.value = '请选择保存位置…'
      showCreateBookDialog.value = false
      await nextTick()
      parent = await desktopApi.openFolder()
      if (!parent) {
        createBookError.value = '未选择保存位置'
        createBookStage.value = 'idle'
        saveStatus.value = '就绪'
        showCreateBookDialog.value = true
        return
      }
    }

    createBookStage.value = 'creating'
    saveStatus.value = '创建书籍文件夹…'
    const state = emptyBookState(title)
    let root: string
    if (libraryRootPath.value) {
      root = await createBookInLibrary(libraryRootPath.value, title, state)
    } else {
      root = await createBookFolder(parent!, title, state)
    }

    showCreateBookDialog.value = false
    await workspace.openLocalFolder(root)
    const loaded = await loadBookState(root)
    storyStore.bindFolder(root, loaded)
    currentChId.value = ''
    aiPanelOpen.value = true
    saveStatus.value = '就绪'

    if (storyStore.connected && brief.trim()) {
      createBookStage.value = 'generating'
      saveStatus.value = '正在生成世界观设定…'
      void enrichBookFromBackend(root, title, brief).then(async () => {
        await workspace.refreshLocalFolder()
        const refreshed = await loadBookState(root)
        storyStore.bindFolder(root, refreshed)
        saveStatus.value = '设定已生成'
      }).catch(() => {
        saveStatus.value = '本地书籍已创建（设定生成失败，可稍后重试）'
      }).finally(() => {
        createBookStage.value = 'idle'
      })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '创建书籍失败'
    createBookError.value = message
    menuError.value = message
    createBookStage.value = 'idle'
    showCreateBookDialog.value = true
  } finally {
    menuLoading.value = false
    if (createBookStage.value !== 'generating') {
      createBookStage.value = 'idle'
    }
  }
}

async function onWriteNext() {
  if (!storyStore.currentBookId) return
  saveStatus.value = 'AI 写章中…'
  try {
    const out = await storyStore.writeNext()
    await workspace.refreshLocalFolder()
    if (out.chapterNumber) {
      await onOpenBookChapter(out.chapterNumber)
    }
    saveStatus.value = '就绪'
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '写章失败'
    saveStatus.value = '就绪'
  }
}

async function onOpenBookChapter(chapterNum: number) {
  const bookId = storyStore.currentBookId
  if (!bookId) return
  try {
    const detail = await storyStore.loadChapter(bookId, chapterNum)
    const path = chapterPath(chapterNum) ?? (bookRootPath.value
      ? chapterFilePath(bookRootPath.value, detail.meta.fileName)
      : '')
    if (!path) throw new Error('章节路径未找到')
    workspaceRef.value?.openContent(path, detail.meta.title, detail.content, async (newContent) => {
      await storyStore.saveChapter(bookId, chapterNum, detail.meta.title, newContent)
      await workspace.refreshLocalFolder()
    })
    currentChId.value = path
    workspace.currentFilePath.value = path
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开章节失败'
  }
}

async function onOpenLibraryBook(path: string) {
  menuError.value = ''
  try {
    await workspace.openBookInLibrary(path)
    currentChId.value = ''
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开书籍失败'
  }
}

async function onMenuOpenFile() {
  if (!isDesktop()) {
    menuError.value = '仅桌面端支持打开文件'
    return
  }
  menuLoading.value = true
  try {
    const files = await desktopApi.openFiles()
    if (files?.length) await openFile(files[files.length - 1].path)
  } catch (err: unknown) {
    menuError.value = err instanceof Error ? err.message : '打开文件失败'
  } finally {
    menuLoading.value = false
  }
}

async function doSave() {
  await workspaceRef.value?.saveActive?.()
}

async function onCreateFile(parentPath: string, fileName: string) {
  try {
    const fullPath = await workspace.createFile(parentPath, fileName)
    await openFile(fullPath)
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

async function onDeletePath(targetPath: string, _isDirectory: boolean) {
  if (targetPath === currentFilePath.value) {
    workspace.currentFilePath.value = null
    currentChId.value = ''
  }
}

async function onExportTxt() {
  if (!currentWorkspace.value) return
  const text = await buildWorkspaceExport(currentWorkspace.value, workspace.loadChapterContent, 'txt')
  downloadText(text, `${currentWorkspace.value.book_name}.txt`)
}

async function onExportMd() {
  if (!currentWorkspace.value) return
  const text = await buildWorkspaceExport(currentWorkspace.value, workspace.loadChapterContent, 'md')
  downloadText(text, `${currentWorkspace.value.book_name}.md`)
}

async function onExportEpub() {
  showExportDialog.value = true
}

async function onExportDocx() {
  showExportDialog.value = true
}

async function onExportFanqie() {
  await exportPlatform('fanqie', '番茄')
}

async function onExportQidian() {
  await exportPlatform('qidian', '起点')
}

async function onExportJinjiang() {
  await exportPlatform('jinjiang', '晋江')
}

async function exportPlatform(platform: string, label: string) {
  if (!currentWorkspace.value || !localRootPath.value || !isDesktop()) return
  saveStatus.value = `导出${label}格式…`
  try {
    const chapters: { title: string; content: string }[] = []
    for (const vol of currentWorkspace.value.volumes) {
      for (const ch of vol.chapters) {
        const content = await workspace.loadChapterContent(vol.id, ch.id)
        chapters.push({ title: ch.title, content })
      }
    }
    const dest = `${localRootPath.value}/${currentWorkspace.value.book_name}_${platform}.txt`
    await desktopApi.exportPlatform(localRootPath.value, platform, dest, chapters)
    saveStatus.value = `已导出 ${label} 格式`
  } catch (e: unknown) {
    saveStatus.value = e instanceof Error ? e.message : '导出失败'
  }
}

async function onBackupWorkspace() {
  if (!localRootPath.value || !isDesktop()) return
  saveStatus.value = '增量备份中…'
  try {
    const result = await desktopApi.backupWorkspaceIncremental(localRootPath.value)
    const changed = result.changedFiles ?? result.changed_files ?? 0
    if (result.skipped) {
      saveStatus.value = `无变更文件（已跟踪 ${result.totalTracked ?? result.total_tracked ?? 0} 个）`
    } else {
      saveStatus.value = `增量备份完成：${changed} 个变更文件`
    }
  } catch (e: unknown) {
    saveStatus.value = e instanceof Error ? e.message : '备份失败'
  }
}

async function onWritingStatsMenu() {
  openDashboard()
}

async function onPlotAudit(deep = true) {
  if (!localRootPath.value || !isDesktop()) return
  saveStatus.value = deep ? '生成深度审校报告…' : '生成审校报告…'
  try {
    const report = await desktopApi.runPlotAudit(localRootPath.value, deep) as {
      summary: string
      markdown: string
      issues: { severity: string; category: string; message: string }[]
    }
    plotAuditData.value = {
      summary: report.summary,
      markdown: report.markdown,
      issues: report.issues ?? [],
    }
    showPlotAudit.value = true
    saveStatus.value = report.summary || '审校完成'
  } catch (e: unknown) {
    saveStatus.value = e instanceof Error ? e.message : '审校失败'
  }
}

async function loadRustWordStats() {
  if (!localRootPath.value || !currentWorkspace.value || !isDesktop()) {
    return computeWordStats(currentWorkspace.value!, writingStats.targetWords)
  }
  try {
    const raw = await desktopApi.getWritingStats(localRootPath.value) as {
      total_chars: number
      total_chapters: number
      volumes: { volume_id: string; title: string; chars: number; chapters: { path: string; title: string; chars: number }[] }[]
      daily: Record<string, number>
      target_words: number
      progress_percent: number
    }
    writingStats.load(currentWorkspace.value.id)
    for (const [date, words] of Object.entries(raw.daily ?? {})) {
      const idx = writingStats.dailyStats.findIndex((d) => d.date === date)
      if (idx >= 0) writingStats.dailyStats[idx].words = words
      else writingStats.dailyStats.push({ date, words })
    }
    if (raw.target_words) writingStats.setTarget(raw.target_words)
    return {
      total_words: raw.total_chars,
      body_words: raw.total_chars,
      volume_stats: (raw.volumes ?? []).map((v) => ({
        volume_id: v.volume_id,
        title: v.title,
        total_words: v.chars,
        chapters: v.chapters.map((c) => ({
          chapter_id: c.path,
          title: c.title,
          words: c.chars,
          body_words: c.chars,
        })),
      })),
      target_words: raw.target_words || writingStats.targetWords,
      target_progress: raw.progress_percent,
    } satisfies WordStats
  } catch {
    return computeWordStats(currentWorkspace.value, writingStats.targetWords)
  }
}

async function onEditorAiRewrite(payload: {
  action: string
  selection: string
  from: number
  to: number
  fullText: string
}) {
  if (!localRootPath.value || !currentFilePath.value) return
  saveStatus.value = 'AI 改写中…'
  const result = await editorAi.runSelectionAction({
    workspaceRoot: localRootPath.value,
    chapterPath: currentFilePath.value,
    fullText: payload.fullText,
    selection: payload.selection,
    selectionFrom: payload.from,
    selectionTo: payload.to,
    action: payload.action as EditorAiAction,
  })
  if (result) {
    workspaceRef.value?.applyTextReplacement(payload.from, payload.to, result)
    saveStatus.value = 'AI 改写完成'
  } else {
    saveStatus.value = editorAi.error.value || 'AI 改写失败'
  }
}

async function onGenerateFromOutline(node: OutlineNode) {
  if (!localRootPath.value) return
  saveStatus.value = '基于大纲生成…'
  try {
    const built = await desktopApi.buildWritingPrompt({
      workspace_root: localRootPath.value,
      user_instruction: '根据以下章节细纲撰写完整章节正文，直接输出正文，不要解释。',
      outline_snippet: node.content,
      chapter_path: node.file_path ?? undefined,
    })
    const text = await desktopApi.aiChatStream({
      model: 'default',
      messages: [
        { role: 'system', content: built.system_prompt },
        { role: 'user', content: built.user_prompt },
      ],
    }, () => {})
    if (node.file_path) {
      await workspace.saveFileContent(node.file_path, text)
      await openFile(node.file_path)
    } else {
      aiPanelOpen.value = true
      saveStatus.value = '已生成，请绑定章节路径或从 AI 面板查看'
    }
    saveStatus.value = '章节生成完成'
  } catch (e: unknown) {
    saveStatus.value = e instanceof Error ? e.message : '生成失败'
  }
}

async function onRewriteFromOutline(node: OutlineNode) {
  if (!localRootPath.value || !node.file_path) {
    saveStatus.value = '请先绑定章节文件路径'
    return
  }
  const content = await workspace.loadChapterContent(node.vol_id ?? '', node.file_path)
  saveStatus.value = '基于新大纲改写…'
  try {
    const built = await desktopApi.buildWritingPrompt({
      workspace_root: localRootPath.value,
      user_instruction: '根据更新后的大纲细纲改写本章正文，保持前后连贯。',
      outline_snippet: node.content,
      chapter_path: node.file_path,
      selection: content.slice(0, 4000),
    })
    const text = await desktopApi.aiChatStream({
      model: 'default',
      messages: [
        { role: 'system', content: built.system_prompt },
        { role: 'user', content: built.user_prompt },
      ],
    }, () => {})
    await workspace.saveFileContent(node.file_path, text)
    await openFile(node.file_path)
    saveStatus.value = '改写完成'
  } catch (e: unknown) {
    saveStatus.value = e instanceof Error ? e.message : '改写失败'
  }
}

async function onRestoreVersion(content: string) {
  if (!currentFilePath.value) return
  workspaceRef.value?.openContent(currentFilePath.value, getFileName(currentFilePath.value), content)
  saveStatus.value = '已加载历史版本（未自动保存）'
}


watch(
  () => shellSync.metaFocus,
  (focus) => {
    if (!focus) return
    activePanelId.value = 'meta'
  },
)

function onOpenInspiration() {
  void desktopApi.openInspirationWindow(currentWorkspace.value?.id ?? 'default')
}

function onDetachPanel(panel: 'ai' | 'outline') {
  const wsId = currentWorkspace.value?.id
  if (wsId) void desktopApi.openDetachedPanel(panel, wsId)
}

function toggleBottomPanel(tab: PanelTab = 'terminal') {
  if (bottomPanelOpen.value && bottomPanelTab.value === tab) {
    bottomPanelOpen.value = false
  } else {
    bottomPanelOpen.value = true
    bottomPanelTab.value = tab
  }
}

function onSearchOpenMatch(path: string, _line: number, _column: number) {
  void openFile(path)
}

async function onOpenStoryChapter(
  path: string,
  title: string,
  content: string,
  bookId: string,
  chapterNum: number,
) {
  workspaceRef.value?.openContent(path, title, content, async (newContent) => {
    await storyStore.saveChapter(bookId, chapterNum, title, newContent)
  })
  currentChId.value = path
}

function onChapterWritten(bookId: string, chapterNum: number, title: string, content: string) {
  const path = storyChapterPath(bookId, chapterNum)
  void onOpenStoryChapter(path, title, content, bookId, chapterNum)
}

function onInsertToEditor(_text: string) {
  saveStatus.value = '请在编辑器中粘贴智能体返回的内容'
}

async function openDashboard() {
  if (!currentWorkspace.value) return
  wordStats.value = await loadRustWordStats()
  showDashboard.value = true
}

function onLeftResizeMouseDown(e: MouseEvent) {
  e.preventDefault()
  leftDragStartX.value = e.clientX
  leftDragStartWidth.value = leftPanelWidth.value
  const onMove = (ev: MouseEvent) => {
    isLeftDragging.value = true
    const delta = ev.clientX - leftDragStartX.value
    leftPanelWidth.value = Math.max(180, Math.min(400, leftDragStartWidth.value + delta))
  }
  const stop = () => {
    isLeftDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', stop)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', stop)
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (isModKey(e) && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    onOpenInspiration()
  }
  if (e.key === 'Escape' && aiPanelOpen.value) {
    e.preventDefault()
    aiPanelOpen.value = false
  }
  if (isModKey(e) && !e.altKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    toggleAiPanel()
  }
  if (isModKey(e) && !e.altKey && e.key === ',') {
    e.preventDefault()
    if (e.shiftKey) {
      showProjectSettings.value = true
    } else {
      showPreferences.value = true
    }
  }
  if (isModKey(e) && e.key === '`') {
    e.preventDefault()
    toggleBottomPanel('terminal')
  }
}

watch(workspaceRef, async (ws) => {
  if (!ws) return
  const lastFile = workspace.currentFilePath.value
  if (lastFile) {
    try {
      await ws.openFile(lastFile)
    } catch {
      // ignore
    }
  }
}, { flush: 'post' })

onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown)
  themeStore.applyTheme()
  workspace.setBookBoundHandler((root, state) => {
    storyStore.bindFolder(root, state)
  })
  void storyStore.init()
  if (isDesktop()) {
    await restoreLastSession()
    const { listen } = await import('@tauri-apps/api/event')
    listen<string>('workspace-file-changed', async (ev) => {
      await refreshTree()
      if (currentFilePath.value && ev.payload === currentFilePath.value) {
        try {
          await workspaceRef.value?.openFile(ev.payload)
          saveStatus.value = '外部修改已同步'
        } catch {
          /* ignore */
        }
      }
    })
    desktopApi.onOpenFile(async (filePath: string) => {
      try {
        await openFile(filePath)
      } catch {
        menuError.value = '打开文件失败'
      }
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="ide-shell" :class="{ 'detach-mode': !!props.detachPanel }">
    <div v-if="!props.detachPanel" class="ide-bg" aria-hidden="true">
      <BackgroundLayer />
    </div>
    <div class="ide-content" :class="{ 'detach-mode': !!props.detachPanel }">
    <div v-if="props.detachPanel === 'ai'" class="detach-full">
      <AiChatPanel
        :current-chapter-path="currentChId"
        :current-chapter-num="currentBookChapterNum"
        :folder-open="!!localRootPath"
        :is-book-project="isBookProject"
        :is-library="isLibrary"
        @insert="onInsertToEditor"
        @chapter-written="onChapterWritten"
        @create-book="onCreateBook"
      />
    </div>
    <div v-else-if="props.detachPanel === 'outline'" class="detach-full">
      <OutlinePanel
        :workspace-id="currentWorkspace?.id ?? null"
        :workspace-root="localRootPath"
        @jump-chapter="onSelectChapter"
      />
    </div>

    <template v-else>
      <MenuBar
        class="menu-bar-top"
        :workspace-name="currentWorkspace?.book_name"
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
        @backup-workspace="onBackupWorkspace"
        @writing-stats="onWritingStatsMenu"
        @plot-audit="onPlotAudit"
        @open-extension-hub="showExtensionHub = true"
        @open-dashboard="openDashboard"
        @open-inspiration="onOpenInspiration"
        @toggle-ai-panel="toggleAiPanel"
        @detach-outline="onDetachPanel('outline')"
        @detach-panel="onDetachPanel"
        @open-preferences="showPreferences = true"
      />

      <div class="ide-main">
        <ActivityBar
          :items="activityItems"
          :active-id="activePanelId"
          :on-active-change="(id) => { activePanelId = id }"
        />

        <div
          class="left-panel"
          :style="{ width: leftPanelWidth + 'px' }"
        >
          <div
            v-if="isLeftDragging"
            class="resize-overlay"
          />
          <ExplorerTree
            v-show="activePanelId === 'explorer'"
            :tree="tree"
            :folder-name="folderName"
            :current-file-path="currentFilePath"
            :is-book-project="isBookProject"
            :is-library="isLibrary"
            :book-chapters="bookChapters"
            :library-books="libraryBooks"
            :backend-connected="storyStore.connected"
            :writing="storyStore.writing"
            @select-file="openFile"
            @create-file="onCreateFile"
            @create-dir="onCreateDir"
            @delete-path="onDeletePath"
            @close-folder="workspace.closeCurrent(); storyStore.unbindFolder()"
            @open-folder="onMenuOpenFolder"
            @create-book="onCreateBook"
            @write-next="onWriteNext"
            @open-ai-panel="onOpenAiPanel"
            @open-chapter="onOpenBookChapter"
            @open-library-book="onOpenLibraryBook"
            @refresh-tree="refreshTree()"
          />
          <SearchPanel
            v-show="activePanelId === 'search'"
            :root-path="rootPath"
            :on-open-match="onSearchOpenMatch"
          />
          <PanelShell v-show="activePanelId === 'meta'" title="设定" subtitle="角色与词条">
            <MetaPanel
              :workspace-id="currentWorkspace?.id ?? null"
              :workspace-root="localRootPath"
            />
          </PanelShell>
          <PanelShell v-show="activePanelId === 'outline'" title="大纲" subtitle="章节与时间线">
            <OutlinePanel
              :workspace-id="currentWorkspace?.id ?? null"
              :workspace-root="localRootPath"
              @jump-chapter="onSelectChapter"
              @generate-from-outline="onGenerateFromOutline"
              @rewrite-from-outline="onRewriteFromOutline"
              @refresh-tree="refreshTree()"
            />
          </PanelShell>
          <PanelShell v-show="activePanelId === 'versions'" title="版本" subtitle="章节快照">
            <VersionPanel
              :workspace-root="localRootPath"
              :file-path="currentFilePath"
              @restore="onRestoreVersion"
            />
          </PanelShell>
          <PanelShell v-show="activePanelId === 'tasks'" title="AI 任务" subtitle="异步队列与进度">
            <AiTaskPanel :workspace-root="localRootPath" />
          </PanelShell>
          <PanelShell v-show="activePanelId === 'backup'" title="备份" subtitle="增量与全书打包">
            <BackupPanel :workspace-root="localRootPath" />
          </PanelShell>
          <div
            class="resize-handle-right"
            @mousedown="onLeftResizeMouseDown"
          />
        </div>

        <div class="center-column">
          <div class="center-workbench">
            <div class="center-main">
              <div class="center-panel">
                <EditorWorkspace
                  ref="workspaceRef"
                  @save-status="saveStatus = $event"
                  @ai-rewrite="onEditorAiRewrite"
                />
              </div>
              <BottomPanel
                :open="bottomPanelOpen"
                :active-tab="bottomPanelTab"
                :height="bottomPanelHeight"
                :root-path="rootPath"
                :output-text="outputText"
                @open-change="bottomPanelOpen = $event"
                @active-tab-change="bottomPanelTab = $event"
                @height-change="bottomPanelHeight = $event"
                @clear-output="outputText = ''"
              />
            </div>
            <AiAssistantDrawer :open="aiPanelOpen" @close="aiPanelOpen = false">
              <AiChatPanel
                :current-chapter-path="currentChId"
                :current-chapter-num="currentBookChapterNum"
                :folder-open="!!localRootPath"
                :is-book-project="isBookProject"
                :is-library="isLibrary"
                @insert="onInsertToEditor"
                @chapter-written="onChapterWritten"
                @create-book="onCreateBook"
              />
            </AiAssistantDrawer>
          </div>
        </div>
      </div>

      <StatusBar
        :save-status="saveStatus"
        :word-count="totalWordCount"
        :chapter-count="totalChapters"
        :volume-count="totalVolumes"
        :connected="!!currentWorkspace"
        :backend-connected="storyStore.connected"
        :streaming="storyStore.busy"
        @open-dashboard="openDashboard"
        @toggle-terminal="toggleBottomPanel('terminal')"
      />
    </template>

    <ThemeSettings :visible="showPreferences" @close="showPreferences = false" />
    <CreateBookDialog
      v-model:open="showCreateBookDialog"
      :loading="menuLoading"
      :stage="createBookStage"
      :error="createBookError"
      :is-library="isLibrary"
      @confirm="onCreateBookConfirm"
    />
    <ExportDialog
      :visible="showExportDialog"
      :workspace="currentWorkspace"
      :workspace-root="localRootPath"
      :load-chapter-content="workspace.loadChapterContent"
      @close="showExportDialog = false"
    />
    <ProjectSettings
      :visible="showProjectSettings"
      @close="showProjectSettings = false"
    />
    <PlotAuditDialog
      :visible="showPlotAudit"
      :summary="plotAuditData.summary"
      :markdown="plotAuditData.markdown"
      :issues="plotAuditData.issues"
      @close="showPlotAudit = false"
    />
    <ExtensionHub
      :visible="showExtensionHub"
      :workspace-root="localRootPath"
      @close="showExtensionHub = false"
    />
    <div v-if="menuError" class="menu-error-banner" role="alert">
      {{ menuError }}
      <button type="button" class="dismiss-error" @click="menuError = ''">×</button>
    </div>
    <WritingDashboard
      :visible="showDashboard"
      :workspace-id="currentWorkspace?.id ?? null"
      :stats="wordStats"
      @close="showDashboard = false"
    />
    </div>
  </div>
</template>

<style scoped>
.ide-shell {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

.menu-error-banner {
  position: fixed;
  bottom: 28px;
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(90vw, 520px);
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.92);
  color: #fecaca;
  font-size: 13px;
  transform: translateX(-50%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.dismiss-error {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.8;
}

.ide-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--bg-primary);
}

.ide-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ide-content.detach-mode {
  height: 100%;
}

.detach-full {
  height: 100%;
  overflow: hidden;
}

.menu-bar-top {
  flex-shrink: 0;
}

.ide-main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.left-panel {
  position: relative;
  flex-shrink: 0;
  min-width: 180px;
  max-width: 400px;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.left-panel > * {
  flex: 1;
  min-height: 0;
}

.center-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.center-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.resize-handle-right {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  z-index: 2;
  background: transparent;
}

.resize-handle-right:hover {
  background: var(--accent);
  opacity: 0.35;
}

.resize-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  cursor: ew-resize;
}
</style>
