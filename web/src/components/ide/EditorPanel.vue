<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { EditorView, keymap, placeholder, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useEditorSchemeStore } from '@/stores/editorSchemeStore'

const props = defineProps<{
  content: string
  title: string
  wordCount: number
  dirty: boolean
}>()

const emit = defineEmits<{
  updateContent: [content: string]
  save: []
}>()

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
    maxWidth: '780px',
    margin: '0 auto',
  },
  '.cm-line': { padding: '2px 0' },
  '.cm-gutters': { display: 'none' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--scrollbar-thumb)',
  },
})

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
    placeholder('开始创作...'),
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
  if (document.activeElement !== view?.contentDOM) {
    setContent(val)
  }
})

watch(() => schemeStore.revision, () => {
  applyScheme()
})

onMounted(() => {
  nextTick(createEditor)
})

onUnmounted(() => {
  view?.destroy()
})

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    emit('save')
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
        <span v-if="dirty" class="dirty-dot">●</span>
      </div>
      <div class="tab-info">
        <span class="word-count">{{ wordCount.toLocaleString() }} 字</span>
        <button v-if="dirty" class="save-btn" @click="$emit('save')">保存</button>
      </div>
    </div>
    <div ref="editorRef" class="editor-area"></div>
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
  overflow: hidden;
}
</style>
