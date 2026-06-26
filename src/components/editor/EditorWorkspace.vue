<script lang="ts">
export type EditorWorkspaceHandle = {
  openFile: (path: string) => Promise<void>
  closeActive: () => void
  saveActive: () => Promise<void>
}
</script>

<script setup lang="ts">
import { ref, shallowRef, computed, watch } from 'vue'
import TabsBar, { type EditorTab } from '@/components/editor/TabsBar.vue'
import FileViewer from '@/components/viewers/FileViewer.vue'
import { viewerIdFromPath } from '@/components/viewers/defaultRenderers'
import { readFile, writeFile, getFileName } from '@/services/desktopApi'
import { detectFileType } from '@/features/editor/utils/fileTypes'
import type { FileViewerTabModel } from '@/components/viewers/types'

type TabState = FileViewerTabModel & {
  savedValue: string
  isDirty: boolean
}

const emit = defineEmits<{
  dirtyChange: [dirty: boolean]
  saveStatus: [status: string]
}>()

function setStatus(status: string) {
  emit('saveStatus', status)
}

function updateDirtyFlag() {
  const anyDirty = tabs.value.some((t) => t.isDirty)
  emit('dirtyChange', anyDirty)
}

const tabs = shallowRef<TabState[]>([])
const activeId = ref<string | null>(null)

const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? null)

const editorTabs = computed<EditorTab[]>(() =>
  tabs.value.map((t) => ({
    id: t.id,
    path: t.path,
    title: t.title,
    isDirty: t.isDirty,
  })),
)

function closeActive() {
  if (activeId.value) closeTab(activeId.value)
}

async function openFile(path: string) {
  const existing = tabs.value.find((t) => t.path === path)
  if (existing) {
    activeId.value = existing.id
    return
  }

  setStatus('加载中...')
  try {
    const { content, encoding } = await readFile(path)
    const viewerId = viewerIdFromPath(path)
    const readOnly = !detectFileType(path).editable
    const tab: TabState = {
      id: path,
      path,
      title: getFileName(path),
      viewerId,
      readOnly,
      value: content,
      savedValue: content,
      encoding,
      isDirty: false,
    }
    tabs.value = [...tabs.value, tab]
    activeId.value = tab.id
    setStatus('就绪')
  } catch (err: unknown) {
    setStatus(err instanceof Error ? err.message : '打开失败')
    throw err
  }
}

function closeTab(id: string) {
  const idx = tabs.value.findIndex((t) => t.id === id)
  if (idx < 0) return
  const next = tabs.value.filter((t) => t.id !== id)
  tabs.value = next
  if (activeId.value === id) {
    activeId.value = next[Math.max(0, idx - 1)]?.id ?? null
  }
  updateDirtyFlag()
}

function onTabChange(id: string, value: string) {
  tabs.value = tabs.value.map((t) => {
    if (t.id !== id) return t
    const isDirty = value !== t.savedValue
    return { ...t, value, isDirty }
  })
  updateDirtyFlag()
}

async function saveActive() {
  const tab = activeTab.value
  if (!tab || tab.readOnly || !tab.isDirty) return
  setStatus('保存中...')
  try {
    await writeFile(tab.path, tab.value)
    tabs.value = tabs.value.map((t) =>
      t.id === tab.id ? { ...t, savedValue: t.value, isDirty: false } : t,
    )
    setStatus('已保存 ' + new Date().toLocaleTimeString())
    updateDirtyFlag()
  } catch (err: unknown) {
    setStatus(err instanceof Error ? err.message : '保存失败')
  }
}

defineExpose<EditorWorkspaceHandle>({
  openFile,
  closeActive,
  saveActive,
})

watch(activeTab, (tab) => {
  if (!tab) return
  emit('dirtyChange', tab.isDirty)
})
</script>

<template>
  <div class="editor-workspace">
    <TabsBar
      :tabs="editorTabs"
      :active-id="activeId"
      @activate="activeId = $event"
      @close="closeTab"
    />
    <div class="editor-body">
      <FileViewer
        v-if="activeTab"
        :tab="activeTab"
        :on-change="(v) => onTabChange(activeTab!.id, v)"
        @save="saveActive"
      />
      <div v-else class="editor-empty">
        <p>打开文件或从左侧目录选择章节</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: transparent;
}

.editor-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
