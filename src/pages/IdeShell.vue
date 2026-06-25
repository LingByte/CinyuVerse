<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { Files, BookOpen, List, Search } from 'lucide-vue-next'
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
import { provideViewerRegistry } from '@/components/viewers/ViewerRegistry'
import { defaultRenderers } from '@/components/viewers/defaultRenderers'
import { useWorkspace } from '@/features/workspace/composables/useWorkspace'
import { useThemeStore } from '@/features/theme/stores/themeStore'
import { useWritingStatsStore } from '@/features/writing/stores/writingStatsStore'
import type { WordStats } from '@/core/types/workspace'
import type { ActivityBarItem } from '@/types/activity-bar'
import { computeWordStats } from '@/features/writing/utils/wordStats'
import { buildWorkspaceExport, downloadText } from '@/features/workspace/utils/localExport'
import { isModKey } from '@/core/platform'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

const props = defineProps<{
  detachPanel?: 'ai' | 'outline' | null
}>()

provideViewerRegistry(shallowRef(defaultRenderers))

const workspace = useWorkspace()
const { currentWorkspace, tree, folderName, refreshTree, restoreLastSession, localRootPath } = workspace

const workspaceRef = ref<EditorWorkspaceHandle | null>(null)
const activePanelId = ref('explorer')
const aiPanelOpen = ref(false)
const saveStatus = ref('就绪')
const aiError = ref('')
const aiStreaming = ref(false)
const aiStreamText = ref('')
const menuError = ref('')
const menuLoading = ref(false)
const showPreferences = ref(false)
const showDashboard = ref(false)
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

const activityItems: ActivityBarItem[] = [
  { id: 'explorer', label: '目录', icon: Files },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'meta', label: '设定', icon: BookOpen },
  { id: 'outline', label: '大纲', icon: List },
]

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value
}

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

function onExportUnavailable() {
  saveStatus.value = 'EPUB/DOCX/平台导出需后续实现'
}

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

type GenerateOpts = {
  type: 'chat' | 'create' | 'new_chapter'
  mode: string
  instruction: string
  temperature: number
  maxTokens: number
  model: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

async function onAiGenerate(opts: GenerateOpts) {
  if (!isDesktop()) {
    aiError.value = '创作模式需桌面端运行'
    return
  }
  aiError.value = ''
  aiStreaming.value = true
  aiStreamText.value = ''
  try {
    const config = await desktopApi.aiGetConfig()
    if (!config) {
      aiError.value = 'AI 未配置：请在项目根目录 .env 设置 API Key'
      return
    }
    const systemParts: string[] = []
    const meta = workspaceMeta.value
    if (meta?.world_view?.trim()) systemParts.push('【世界观】\n' + meta.world_view.trim())
    if (meta?.character?.trim()) systemParts.push('【人物设定】\n' + meta.character.trim())
    if (meta?.outline?.trim()) systemParts.push('【大纲】\n' + meta.outline.trim())
    if (meta?.style?.trim()) systemParts.push('【文风】\n' + meta.style.trim())

    const messages: { role: string; content: string }[] = []
    if (systemParts.length) {
      messages.push({ role: 'system', content: systemParts.join('\n\n') })
    }
    messages.push(...opts.history)
    messages.push({ role: 'user', content: opts.instruction })

    await desktopApi.aiChatStream(
      {
        model: opts.model || config.model,
        messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      },
      (chunk) => { aiStreamText.value += chunk },
    )
  } catch (e: unknown) {
    aiError.value = e instanceof Error ? e.message : 'AI 生成失败'
  } finally {
    aiStreaming.value = false
  }
}

function onAiStop() {
  aiStreaming.value = false
}

function openDashboard() {
  if (!currentWorkspace.value) return
  writingStats.load(currentWorkspace.value.id)
  wordStats.value = computeWordStats(currentWorkspace.value, writingStats.targetWords)
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
    showPreferences.value = true
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
  if (isDesktop()) {
    await restoreLastSession()
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
    <div v-if="props.detachPanel === 'ai'" class="detach-full">
      <AiChatPanel
        :connected="!!currentWorkspace"
        :streaming="aiStreaming"
        :stream-text="aiStreamText"
        :log-messages="[]"
        :tool-calls="[]"
        :error="aiError"
        :chapter-id="currentChId"
        :workspace-id="currentWorkspace?.id"
        :workspace-name="currentWorkspace?.book_name"
        :workspace-meta="workspaceMeta"
        @generate="onAiGenerate"
        @stop="onAiStop"
        @insert="() => {}"
      />
    </div>
    <div v-else-if="props.detachPanel === 'outline'" class="detach-full">
      <OutlinePanel
        :workspace-id="currentWorkspace?.id ?? null"
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
        @export-epub="onExportUnavailable"
        @export-docx="onExportUnavailable"
        @export-fanqie="onExportUnavailable"
        @open-dashboard="openDashboard"
        @open-inspiration="onOpenInspiration"
        @toggle-ai-panel="toggleAiPanel"
        @detach-outline="onDetachPanel('outline')"
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
          <PanelShell
            v-show="activePanelId === 'explorer'"
            :title="folderName || '工作区'"
            subtitle="目录"
          >
            <ExplorerTree
              :tree="tree"
              :folder-name="folderName"
              :current-file-path="currentFilePath"
              @select-file="openFile"
              @create-file="onCreateFile"
              @create-dir="onCreateDir"
              @delete-path="onDeletePath"
              @close-folder="workspace.closeCurrent()"
              @open-folder="onMenuOpenFolder"
              @refresh-tree="refreshTree()"
            />
          </PanelShell>
          <SearchPanel
            v-show="activePanelId === 'search'"
            :root-path="rootPath"
            :on-open-match="onSearchOpenMatch"
          />
          <PanelShell v-show="activePanelId === 'meta'" title="设定" subtitle="角色与词条">
            <MetaPanel :workspace-id="currentWorkspace?.id ?? null" />
          </PanelShell>
          <PanelShell v-show="activePanelId === 'outline'" title="大纲" subtitle="章节与时间线">
            <OutlinePanel
              :workspace-id="currentWorkspace?.id ?? null"
              @jump-chapter="onSelectChapter"
            />
          </PanelShell>
          <div
            class="resize-handle-right"
            @mousedown="onLeftResizeMouseDown"
          />
        </div>

        <div class="center-column" :class="{ 'ai-open': aiPanelOpen }">
          <div class="center-panel">
            <EditorWorkspace
              ref="workspaceRef"
              @save-status="saveStatus = $event"
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
          <AiAssistantDrawer :open="aiPanelOpen" @close="aiPanelOpen = false">
            <AiChatPanel
              :connected="!!currentWorkspace"
              :streaming="aiStreaming"
              :stream-text="aiStreamText"
              :log-messages="[]"
              :tool-calls="[]"
              :error="aiError"
              :chapter-id="currentChId"
              :workspace-id="currentWorkspace?.id"
              :workspace-name="currentWorkspace?.book_name"
              :workspace-meta="workspaceMeta"
              @generate="onAiGenerate"
              @stop="onAiStop"
              @insert="() => {}"
            />
          </AiAssistantDrawer>
        </div>
      </div>

      <StatusBar
        :save-status="saveStatus"
        :word-count="totalWordCount"
        :chapter-count="totalChapters"
        :volume-count="totalVolumes"
        :connected="!!currentWorkspace"
        :streaming="aiStreaming"
        @open-dashboard="openDashboard"
        @toggle-terminal="toggleBottomPanel('terminal')"
      />
    </template>

    <ThemeSettings :visible="showPreferences" @close="showPreferences = false" />
    <WritingDashboard
      :visible="showDashboard"
      :workspace-id="currentWorkspace?.id ?? null"
      :stats="wordStats"
      @close="showDashboard = false"
    />
  </div>
</template>

<style scoped>
.ide-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.ide-shell.detach-mode {
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
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
}

.left-panel > * {
  flex: 1;
  min-height: 0;
}

.center-column {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-column.ai-open .center-panel {
  padding-right: 0;
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
}

.resize-handle-right:hover {
  background: var(--accent);
  opacity: 0.4;
}

.resize-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  cursor: ew-resize;
}
</style>
