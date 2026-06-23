<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorView, keymap, placeholder, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useEditorSchemeStore } from '@/stores/editorSchemeStore'
import { detectFileType, type FileTypeInfo } from '@/utils/fileTypes'
import ImageViewer from './ImageViewer.vue'
import PdfViewer from './PdfViewer.vue'
import SpreadsheetViewer from './SpreadsheetViewer.vue'
import BinaryPlaceholder from './BinaryPlaceholder.vue'

const props = defineProps<{
  content: string
  encoding: 'utf8' | 'base64'
  title: string
  wordCount: number
  dirty: boolean
  currentFilePath: string | null
}>()

const emit = defineEmits<{
  updateContent: [content: string]
  save: []
}>()

const fileType = ref<FileTypeInfo>({ category: 'text', extension: '', mimeType: 'text/plain', editable: true })

watch(
  () => props.currentFilePath,
  (path) => {
    fileType.value = path ? detectFileType(path) : { category: 'text', extension: '', mimeType: 'text/plain', editable: true }
  },
  { immediate: true }
)

// ---- CodeMirror (text files only) ----
const schemeStore = useEditorSchemeStore()
const editorRef = ref<HTMLDivElement>()
let view: EditorView | null = null
const schemeCompartment = new Compartment()

const chromeTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
    lineHeight: '1.8',
  },
  '.cm-content': {
    padding: '24px 32px',
    fontFamily: '"JetBrains Mono", "Source Han Serif SC", "Noto Serif CJK SC", serif',
  },
  '.cm-line': { padding: '2px 0' },
  '.cm-gutters': { display: 'none' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--scrollbar-thumb)',
  },
})

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
    chromeTheme,
    drawSelection(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    placeholder(getPlaceholder()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('updateContent', update.state.doc.toString())
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
  applyScheme()
})

let editorMounted = false

function initTextEditor() {
  if (fileType.value.category !== 'text') return
  if (editorMounted) {
    setContent(props.content)
    return
  }
  nextTick(createEditor)
  editorMounted = true
}

onMounted(() => {
  if (fileType.value.category === 'text') initTextEditor()
})

onUnmounted(() => {
  view?.destroy()
})

watch(fileType, (newType) => {
  if (newType.category === 'text') {
    view?.destroy()
    view = null
    editorMounted = false
    nextTick(initTextEditor)
  }
})

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
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
    <div class="tab-bar">
      <div class="tab active">
        <span class="tab-title">{{ title || '未选择章节' }}</span>
        <span v-if="dirty && fileType.editable" class="dirty-dot">●</span>
      </div>
      <div class="tab-info">
        <span v-if="fileType.category === 'text'" class="word-count">{{ wordCount.toLocaleString() }} 字</span>
        <span v-else class="word-count">{{ fileType.extension.toUpperCase() }}</span>
        <button v-if="dirty && fileType.editable" class="save-btn" @click="$emit('save')">保存</button>
      </div>
    </div>

    <!-- Text Editor (CodeMirror) -->
    <div v-if="fileType.category === 'text'" ref="editorRef" class="editor-area"></div>

    <!-- Image Viewer -->
    <ImageViewer
      v-else-if="fileType.category === 'image'"
      :base64="content"
      :mime-type="fileType.mimeType"
      :file-name="title"
    />

    <!-- PDF Viewer -->
    <PdfViewer
      v-else-if="fileType.category === 'pdf'"
      :base64="content"
      :file-name="title"
    />

    <!-- Spreadsheet Viewer -->
    <SpreadsheetViewer
      v-else-if="fileType.category === 'spreadsheet'"
      :content="content"
      :file-name="title"
    />

    <!-- Binary Placeholder -->
    <BinaryPlaceholder
      v-else
      :file-name="title"
      :extension="fileType.extension"
    />
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
  min-height: 36px;
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
  overflow: hidden;
}
</style>
