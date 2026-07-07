<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Circle, Sparkles } from 'lucide-vue-next'
import { EditorView, keymap, placeholder, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useEditorSchemeStore } from '@/features/editor/stores/editorSchemeStore'
import { isModKey } from '@/core/platform'
import { useThemeStore } from '@/features/theme/stores/themeStore'
import { detectFileType, type FileTypeInfo } from '@/features/editor/utils/fileTypes'
import ImageViewer from '@/components/viewers/ImageViewer.vue'
import PdfViewer from '@/components/viewers/PdfViewer.vue'
import SpreadsheetViewer from '@/components/viewers/SpreadsheetViewer.vue'
import BinaryPlaceholder from '@/components/viewers/BinaryPlaceholder.vue'
import { EDITOR_AI_ACTIONS, type EditorAiAction } from '@/features/workspace/composables/useEditorAi'
import { entityLinkExtension, type EntityLinkSpec } from '@/features/editor/utils/entityLinkExtension'
import { useProjectMetaStore } from '@/features/workspace/stores/projectMetaStore'
import { useShellSyncStore } from '@/features/shell/stores/shellSyncStore'
import { useEditorSelectionStore } from '@/features/editor/stores/editorSelectionStore'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'

const props = defineProps<{
  content: string
  encoding: 'utf8' | 'base64'
  title: string
  wordCount: number
  dirty: boolean
  currentFilePath: string | null
  /** Hide inner tab bar when embedded in EditorWorkspace */
  embedded?: boolean
}>()

const emit = defineEmits<{
  updateContent: [content: string]
  save: []
  aiRewrite: [payload: {
    action: EditorAiAction
    selection: string
    from: number
    to: number
    fullText: string
  }]
}>()

const fileType = ref<FileTypeInfo>({ category: 'text', extension: '', mimeType: 'text/plain', editable: true })

watch(
  () => props.currentFilePath,
  (path) => {
    fileType.value = path ? detectFileType(path) : { category: 'text', extension: '', mimeType: 'text/plain', editable: true }
  },
  { immediate: true },
)

const schemeStore = useEditorSchemeStore()
const themeStore = useThemeStore()
const metaStore = useProjectMetaStore()
const shellSync = useShellSyncStore()
const selectionStore = useEditorSelectionStore()
const editorRef = ref<HTMLDivElement>()
let view: EditorView | null = null
const schemeCompartment = new Compartment()
const entityCompartment = new Compartment()

const isMarkdown = computed(() => {
  const ext = fileType.value.extension
  return ['md', 'markdown', 'mdown'].includes(ext)
})

function buildEntitySpecs(): EntityLinkSpec[] {
  const specs: EntityLinkSpec[] = []
  for (const c of metaStore.characters) {
    const name = c.name?.trim()
    if (!name) continue
    specs.push({ text: name, kind: 'character', id: c.id || `char_${name}` })
  }
  for (const g of metaStore.glossary) {
    const term = g.term?.trim()
    if (!term) continue
    specs.push({ text: term, kind: 'glossary', id: g.id || `term_${term}` })
  }
  return specs
}

async function onEntityClick(entity: EntityLinkSpec) {
  const root = metaStore.workspaceRoot
  if (isDesktop() && root) {
    try {
      if (entity.kind === 'character') {
        const found = await desktopApi.getCharacterByName(root, entity.text)
        if (found?.id) shellSync.focusCharacter(found.id)
        else shellSync.focusCharacter(entity.id)
      } else {
        const found = await desktopApi.getGlossaryItem(root, entity.text)
        if (found?.id) shellSync.focusGlossary(found.id)
        else shellSync.focusGlossary(entity.id)
      }
      return
    } catch {
      /* fallback local id */
    }
  }
  if (entity.kind === 'character') shellSync.focusCharacter(entity.id)
  else shellSync.focusGlossary(entity.id)
}

const aiToolbarEnabled = computed(() => selectionStore.hasSelection)

function applyEntityLinks() {
  if (!view || !isMarkdown.value) return
  view.dispatch({
    effects: entityCompartment.reconfigure(
      entityLinkExtension(buildEntitySpecs, onEntityClick),
    ),
  })
}

const chromeTheme = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    fontSize: '15px',
    lineHeight: '1.8',
    background: 'var(--editor-bg)',
    color: 'var(--editor-fg)',
  },
  '.cm-scroller': {
    background: 'var(--editor-bg)',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '24px clamp(16px, 4vw, 48px)',
    fontFamily: '"JetBrains Mono", "Source Han Serif SC", "Noto Serif CJK SC", serif',
    maxWidth: '1150px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
    color: 'var(--editor-fg)',
  },
  '.cm-line': {
    padding: '2px 0',
    color: 'var(--editor-fg)',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  '.cm-gutters': { display: 'none' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--scrollbar-thumb)',
  },
})

const aiMenu = ref({ visible: false, x: 0, y: 0 })
const selectionRange = ref({ from: 0, to: 0, text: '' })

function onEditorContextMenu(e: MouseEvent) {
  if (!view || !fileType.value.editable) return
  const { from, to } = view.state.selection.main
  if (from === to) return
  const text = view.state.doc.sliceString(from, to)
  selectionRange.value = { from, to, text }
  aiMenu.value = { visible: true, x: e.clientX, y: e.clientY }
  e.preventDefault()
}

function closeAiMenu() {
  aiMenu.value.visible = false
}

function emitAiRewrite(action: EditorAiAction, from: number, to: number) {
  if (!view) return
  const text = view.state.doc.sliceString(from, to)
  if (!text.trim()) return
  emit('aiRewrite', {
    action,
    selection: text,
    from,
    to,
    fullText: view.state.doc.toString(),
  })
}

function triggerAiAction(action: EditorAiAction) {
  emitAiRewrite(action, selectionRange.value.from, selectionRange.value.to)
  closeAiMenu()
}

function triggerAiToolbar(action: EditorAiAction) {
  if (!view || !selectionStore.hasSelection) return
  emitAiRewrite(action, selectionStore.selectionFrom, selectionStore.selectionTo)
}

function replaceSelection(newText: string) {
  if (!view) return
  const { from, to } = selectionRange.value
  view.dispatch({
    changes: { from, to, insert: newText },
  })
  emit('updateContent', view.state.doc.toString())
}

defineExpose({ replaceSelection })

function getPlaceholder() {
  const ext = fileType.value.extension
  if (['md', 'markdown', 'mdown'].includes(ext)) return '开始创作...'
  if (['json', 'xml'].includes(ext)) return '在此编辑...'
  if (['csv', 'tsv'].includes(ext)) return 'name,value...'
  return '开始编辑...'
}

function createEditor() {
  if (!editorRef.value) return

  const extensions = [
    markdown({ base: markdownLanguage }),
    schemeCompartment.of(schemeStore.getCodeMirrorExtensions()),
    entityCompartment.of(isMarkdown.value ? entityLinkExtension(buildEntitySpecs, onEntityClick) : []),
    chromeTheme,
    EditorView.lineWrapping,
    drawSelection(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    placeholder(getPlaceholder()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('updateContent', update.state.doc.toString())
      }
      if (update.selectionSet || update.docChanged) {
        const { from, to } = update.state.selection.main
        const text = update.state.doc.sliceString(from, to)
        selectionStore.setSelection(from, to, text)
      }
    }),
    EditorState.tabSize.of(2),
  ]

  const state = EditorState.create({
    doc: props.content,
    extensions,
  })

  view = new EditorView({
    state,
    parent: editorRef.value,
  })
}

function applyScheme() {
  if (!view) return
  view.dispatch({
    effects: schemeCompartment.reconfigure(schemeStore.getCodeMirrorExtensions()),
  })
}

function setContent(text: string) {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === text) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  })
}

watch(() => props.content, (val) => {
  if (view && document.activeElement !== view.contentDOM) {
    setContent(val)
  }
})

watch(() => schemeStore.revision, () => {
  applyEditorChromeFromTheme()
  applyScheme()
})

watch(
  () => [themeStore.activeCategory, themeStore.presetId, themeStore.activeCustomId] as const,
  () => {
    applyEditorChromeFromTheme()
    applyScheme()
  },
)

function applyEditorChromeFromTheme() {
  if (typeof document === 'undefined') return
  const colors = themeStore.activeColors
  const root = document.documentElement
  const hasEditorOverride =
    schemeStore.isCustomActive || Object.keys(schemeStore.editorOverrides).length > 0
  if (hasEditorOverride) {
    const c = schemeStore.activeColors
    root.style.setProperty('--editor-bg', c.background)
    root.style.setProperty('--editor-fg', c.text)
    root.style.setProperty('--editor-placeholder', c.lineNumber)
    root.style.setProperty('--editor-active-line', c.activeLine)
    root.style.setProperty('--editor-selection', c.selection)
  } else {
    root.style.setProperty('--editor-bg', colors['--bg-primary'] ?? '')
    root.style.setProperty('--editor-fg', colors['--text-main'] ?? '')
    root.style.setProperty('--editor-placeholder', colors['--text-muted'] ?? '')
    root.style.setProperty('--editor-active-line', colors['--bg-hover'] ?? '')
    root.style.setProperty('--editor-selection', colors['--accent-light'] ?? '')
  }
}

let editorMounted = false

function initTextEditor() {
  if (fileType.value.category !== 'text') return
  if (editorMounted) {
    setContent(props.content)
    return
  }
  nextTick(() => {
    applyEditorChromeFromTheme()
    createEditor()
  })
  editorMounted = true
}

watch(
  () => [metaStore.characters, metaStore.glossary] as const,
  () => applyEntityLinks(),
  { deep: true },
)

watch(isMarkdown, () => {
  if (editorMounted) {
    view?.destroy()
    view = null
    editorMounted = false
    nextTick(initTextEditor)
  }
})

watch(fileType, (newType) => {
  if (newType.category === 'text') {
    view?.destroy()
    view = null
    editorMounted = false
    nextTick(initTextEditor)
  } else {
    view?.destroy()
    view = null
    editorMounted = false
  }
})

onMounted(() => {
  if (fileType.value.category === 'text') initTextEditor()
})

onUnmounted(() => {
  view?.destroy()
})

function handleKeydown(e: KeyboardEvent) {
  if (isModKey(e) && e.key === 's') {
    e.preventDefault()
    if (fileType.value.editable) emit('save')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="editor-panel">
    <div v-if="!embedded" class="tab-bar">
      <div class="tab active">
        <span class="tab-title">{{ title || '未选择章节' }}</span>
        <span v-if="dirty && fileType.editable" class="dirty-dot"><Circle :size="8" fill="currentColor" :stroke-width="0" /></span>
      </div>
      <div class="tab-info">
        <span v-if="fileType.category === 'text'" class="word-count">{{ wordCount.toLocaleString() }} 字</span>
        <span v-else class="word-count">{{ fileType.extension.toUpperCase() || '预览' }}</span>
        <button v-if="dirty && fileType.editable" class="save-btn" @click="$emit('save')">保存</button>
      </div>
    </div>

    <div v-if="fileType.category === 'text' && fileType.editable && isMarkdown" class="ai-toolbar">
      <Sparkles :size="13" class="ai-toolbar-icon" />
      <button
        v-for="act in EDITOR_AI_ACTIONS"
        :key="act.id"
        type="button"
        class="ai-toolbar-btn"
        :class="{ disabled: !aiToolbarEnabled }"
        :disabled="!aiToolbarEnabled"
        :title="aiToolbarEnabled ? `对选区${act.label}` : '请先选中文字'"
        @click="triggerAiToolbar(act.id)"
      >
        {{ act.label }}
      </button>
    </div>

    <div v-if="fileType.category === 'text'" ref="editorRef" class="editor-area" @contextmenu="onEditorContextMenu" />

    <ImageViewer
      v-else-if="fileType.category === 'image'"
      :base64="content"
      :mime-type="fileType.mimeType"
      :file-name="title"
    />

    <PdfViewer
      v-else-if="fileType.category === 'pdf'"
      :base64="content"
      :file-name="title"
    />

    <SpreadsheetViewer
      v-else-if="fileType.category === 'spreadsheet'"
      :content="content"
      :file-name="title"
    />

    <BinaryPlaceholder
      v-else
      :file-name="title"
      :extension="fileType.extension"
    />

    <Teleport to="body">
      <div
        v-if="aiMenu.visible"
        class="ai-context-menu"
        :style="{ left: aiMenu.x + 'px', top: aiMenu.y + 'px' }"
        @click.stop
      >
        <button
          v-for="act in EDITOR_AI_ACTIONS"
          :key="act.id"
          type="button"
          class="ai-menu-item"
          @click="triggerAiAction(act.id)"
        >
          {{ act.label }}
        </button>
      </div>
    </Teleport>
    <div v-if="aiMenu.visible" class="ai-menu-backdrop" @click="closeAiMenu" />
  </div>
</template>

<style scoped>
.editor-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 2px solid var(--accent);
}

.tab-title {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-dot {
  color: var(--warning);
  font-size: 14px;
}

.tab-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--text-sub);
}

.save-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.save-btn:hover { background: var(--accent-hover); }

.editor-area {
  flex: 1;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.editor-area :deep(.cm-editor) {
  height: 100%;
  width: 100%;
}

.editor-area :deep(.cm-scroller) {
  width: 100%;
}

.editor-area :deep(.cm-entity-character) {
  color: var(--accent);
  cursor: pointer;
  border-bottom: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent);
}

.editor-area :deep(.cm-entity-glossary) {
  color: var(--warning);
  cursor: pointer;
  border-bottom: 1px dotted color-mix(in srgb, var(--warning) 60%, transparent);
}

.ai-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.ai-toolbar-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.ai-toolbar-btn {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}

.ai-toolbar-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.ai-toolbar-btn.disabled,
.ai-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.ai-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
}

.ai-context-menu {
  position: fixed;
  z-index: 151;
  min-width: 140px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 20%, transparent);
}

.ai-menu-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ai-menu-item:hover {
  background: var(--bg-hover);
  color: var(--accent);
}
</style>
