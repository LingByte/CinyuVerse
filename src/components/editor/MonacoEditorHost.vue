<script setup lang="ts">
/**
 * VS Code pattern: one CodeEditorWidget, swap ITextModel via setModel().
 * Models are cached in monacoModelService — tab switch does not recreate the editor.
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type * as Monaco from 'monaco-editor';
import { applyMonacoProjectConfigIfNeeded, ensureMonacoDefaults, getMonaco } from './monacoSetup';
import { ensureModel, getModelByPath } from './monacoModelService';
import { MONACO_PROJECT_CONFIG_CHANGED_EVENT } from './monacoProject';

const props = withDefaults(
  defineProps<{
    path: string;
    language: string;
    readOnly?: boolean;
    reveal?: { line: number; column?: number };
    initialContent?: string;
  }>(),
  {
    readOnly: false,
  },
);

const emit = defineEmits<{
  change: [value: string];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let changeDisposable: Monaco.IDisposable | null = null;
let suppressChange = false;
let editorReady = false;

function getTheme() {
  if (typeof document === 'undefined') return 'vs-dark';
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

async function ensureEditor(monaco: typeof Monaco) {
  if (editor || !containerRef.value) return;

  await ensureMonacoDefaults(monaco);
  await applyMonacoProjectConfigIfNeeded(monaco);

  editor = monaco.editor.create(containerRef.value, {
    theme: getTheme(),
    minimap: { enabled: false },
    glyphMargin: false,
    fontSize: 14,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    readOnly: props.readOnly,
    automaticLayout: true,
    smoothScrolling: false,
    cursorSmoothCaretAnimation: 'off',
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    quickSuggestions: false,
    parameterHints: { enabled: false },
    wordBasedSuggestions: 'off',
    suggestOnTriggerCharacters: false,
    tabCompletion: 'off',
    scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false },
  });

  (globalThis as any).__gopilotMonaco = monaco;
  (globalThis as any).__gopilotMonacoActiveEditor = editor;

  changeDisposable = editor.onDidChangeModelContent(() => {
    if (suppressChange) return;
    emit('change', editor!.getValue());
  });

  editor.onDidFocusEditorText(() => {
    (globalThis as any).__gopilotMonacoActiveEditor = editor;
  });

  editorReady = true;
}

async function setModelForPath(path: string, language: string, initialContent?: string) {
  if (!path) return;
  const monaco = await getMonaco();
  await ensureEditor(monaco);

  let model = getModelByPath(path);
  if (!model && initialContent !== undefined) {
    model = await ensureModel(path, language, initialContent);
  } else if (!model && initialContent === undefined) {
    return;
  }

  if (!model || !editor) return;

  if (editor.getModel() !== model) {
    editor.setModel(model);
  }
  monaco.editor.setModelLanguage(model, language);
  editor.updateOptions({ readOnly: props.readOnly });
}

function revealIfNeeded() {
  if (!props.reveal || !editor) return;
  const lineNumber = Math.max(1, Number(props.reveal.line) || 1);
  const column = Math.max(1, Number(props.reveal.column ?? 1) || 1);
  try {
    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column });
  } catch {
    // ignore
  }
}

async function bootstrap() {
  await setModelForPath(props.path, props.language, props.initialContent);
  revealIfNeeded();
}

function onProjectConfigChanged() {
  void (async () => {
    const monaco = await getMonaco();
    await applyMonacoProjectConfigIfNeeded(monaco);
  })();
}

function onThemeChange() {
  void getMonaco().then((monaco) => monaco.editor.setTheme(getTheme()));
}

let themeObserver: MutationObserver | null = null;

onMounted(() => {
  const run = () => void bootstrap();
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 200 });
  } else {
    window.setTimeout(run, 0);
  }

  window.addEventListener(MONACO_PROJECT_CONFIG_CHANGED_EVENT, onProjectConfigChanged);
  themeObserver = new MutationObserver(onThemeChange);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  window.removeEventListener(MONACO_PROJECT_CONFIG_CHANGED_EVENT, onProjectConfigChanged);
  themeObserver?.disconnect();
  changeDisposable?.dispose();
  changeDisposable = null;
  editor?.dispose();
  editor = null;
  editorReady = false;
});

watch(
  () => props.path,
  (path) => {
    void setModelForPath(path, props.language);
  },
);

watch(
  () => props.language,
  (language) => {
    void (async () => {
      const monaco = await getMonaco();
      const model = getModelByPath(props.path);
      if (model) monaco.editor.setModelLanguage(model, language);
    })();
  },
);

watch(
  () => props.readOnly,
  (readOnly) => {
    editor?.updateOptions({ readOnly });
  },
);

watch(
  () => props.reveal,
  () => revealIfNeeded(),
  { deep: true },
);

defineExpose({
  getValue: () => editor?.getValue() ?? getModelByPath(props.path)?.getValue() ?? '',
  focus: () => editor?.focus(),
});
</script>

<template>
  <div ref="containerRef" class="h-full w-full" />
</template>
