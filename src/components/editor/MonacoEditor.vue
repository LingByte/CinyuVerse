<script lang="ts">
export type MonacoEditorProps = {
  value: string;
  language?: string;
  path?: string;
  height?: string | number;
  readOnly?: boolean;
  reveal?: {
    line: number;
    column?: number;
  };
};

export type MonacoEditorRef = {
  editor: import('monaco-editor').editor.IStandaloneCodeEditor | null;
  monaco: typeof import('monaco-editor') | null;
  focus: () => void;
  revealPosition: (line: number, column?: number) => void;
  getSelection: () => import('monaco-editor').Selection | null;
  setSelection: (selection: import('monaco-editor').Selection) => void;
};

export type MonacoAnchor = {
  id: string;
  lineNumber: number;
  column?: number;
};

export type MonacoEditorHandle = {
  addAnchor: (anchor: Omit<MonacoAnchor, 'id'> & { id?: string }) => string;
  removeAnchor: (id: string) => void;
  clearAnchors: () => void;
  revealAnchor: (id: string) => void;
};
</script>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type * as Monaco from 'monaco-editor';
import {
  applyMonacoProjectConfigIfNeeded,
  ensureMonacoDefaults,
  getMonaco,
} from './monacoSetup';
import { MONACO_PROJECT_CONFIG_CHANGED_EVENT } from './monacoProject';

const props = withDefaults(
  defineProps<{
    value: string;
    language?: string;
    path?: string;
    height?: string | number;
    readOnly?: boolean;
    reveal?: { line: number; column?: number };
  }>(),
  {
    language: 'typescript',
    height: '60vh',
    readOnly: false,
  },
);

const emit = defineEmits<{
  'update:value': [value: string];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<Monaco.editor.IStandaloneCodeEditor | null>(null);
const anchorDecorationIdsRef = ref<Record<string, string[]>>({});
let suppressChangeEvent = false;
let monacoRef: typeof Monaco | null = null;

function getMonacoTheme() {
  if (typeof document === 'undefined') return 'vs-dark';
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

function normalizeLanguage(language: string) {
  const l = language.trim().toLowerCase();
  if (l === 'ts') return 'typescript';
  if (l === 'js') return 'javascript';
  if (l === 'tsx') return 'typescript';
  if (l === 'jsx') return 'javascript';
  if (l === 'golang') return 'go';
  if (l === 'rs') return 'rust';
  if (l === 'py') return 'python';
  if (l === 'md') return 'markdown';
  return l;
}

const normalizedLanguage = computed(() => normalizeLanguage(props.language ?? 'typescript'));
const containerStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

async function createEditor() {
  const container = containerRef.value;
  if (!container || editorRef.value) return;

  const monaco = await getMonaco();
  monacoRef = monaco;
  await ensureMonacoDefaults(monaco);
  await applyMonacoProjectConfigIfNeeded(monaco);

  const model = monaco.editor.createModel(props.value, normalizedLanguage.value);
  const editor = monaco.editor.create(container, {
    model,
    theme: getMonacoTheme(),
    minimap: { enabled: false },
    automaticLayout: true,
    readOnly: props.readOnly,
    wordWrap: 'on',
    quickSuggestions: false,
  });

  editorRef.value = editor;
  editor.onDidChangeModelContent(() => {
    if (suppressChangeEvent) return;
    emit('update:value', editor.getValue());
  });
}

function disposeEditor() {
  const editor = editorRef.value;
  if (editor) {
    editor.getModel()?.dispose();
    editor.dispose();
    editorRef.value = null;
  }
}

onMounted(() => {
  const run = () => void createEditor();
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 200 });
  } else {
    window.setTimeout(run, 0);
  }
  window.addEventListener(MONACO_PROJECT_CONFIG_CHANGED_EVENT, () => {
    void applyMonacoProjectConfigIfNeeded(monacoRef!);
  });
});

onBeforeUnmount(() => {
  disposeEditor();
});

watch(
  () => props.value,
  (next) => {
    const editor = editorRef.value;
    if (!editor) return;
    if (editor.getValue() === next) return;
    suppressChangeEvent = true;
    editor.setValue(next);
    suppressChangeEvent = false;
  },
);

watch(normalizedLanguage, (lang) => {
  const model = editorRef.value?.getModel();
  if (model && monacoRef) monacoRef.editor.setModelLanguage(model, lang);
});

watch(
  () => props.readOnly,
  (readOnly) => {
    editorRef.value?.updateOptions({ readOnly });
  },
);

defineExpose<MonacoEditorHandle & MonacoEditorRef>({
  get editor() {
    return editorRef.value;
  },
  get monaco() {
    return monacoRef;
  },
  focus() {
    editorRef.value?.focus();
  },
  revealPosition(line: number, column = 1) {
    const editor = editorRef.value;
    if (!editor) return;
    editor.revealLineInCenter(Math.max(1, line));
    editor.setPosition({ lineNumber: Math.max(1, line), column: Math.max(1, column) });
  },
  getSelection() {
    return editorRef.value?.getSelection() ?? null;
  },
  setSelection(selection) {
    editorRef.value?.setSelection(selection);
  },
  addAnchor(anchor) {
    const editor = editorRef.value;
    const monaco = monacoRef;
    if (!editor || !monaco) return '';
    const id = anchor.id ?? `a_${Date.now()}`;
    const range = new monaco.Range(anchor.lineNumber, anchor.column ?? 1, anchor.lineNumber, anchor.column ?? 1);
    const next = editor.deltaDecorations(anchorDecorationIdsRef.value[id] ?? [], [
      { range, options: { glyphMarginClassName: 'monaco-anchor-glyph' } },
    ]);
    anchorDecorationIdsRef.value = { ...anchorDecorationIdsRef.value, [id]: next };
    return id;
  },
  removeAnchor(id: string) {
    const editor = editorRef.value;
    if (!editor) return;
    const old = anchorDecorationIdsRef.value[id];
    if (old) editor.deltaDecorations(old, []);
  },
  clearAnchors() {
    const editor = editorRef.value;
    if (!editor) return;
    for (const ids of Object.values(anchorDecorationIdsRef.value)) {
      editor.deltaDecorations(ids, []);
    }
    anchorDecorationIdsRef.value = {};
  },
  revealAnchor(id: string) {
    const editor = editorRef.value;
    const monaco = monacoRef;
    if (!editor || !monaco) return;
    const ids = anchorDecorationIdsRef.value[id];
    if (!ids?.length) return;
    const range = editor.getModel()?.getDecorationRange(ids[0]);
    if (!range) return;
    editor.revealRangeInCenter(range);
  },
});
</script>

<template>
  <div ref="containerRef" class="w-full" :style="containerStyle" />
</template>
