<script lang="ts">
export type EditorWorkspaceHandle = {
  openFile: (path: string) => Promise<void>;
  openFileAt: (path: string, line: number, column?: number) => Promise<void>;
  restoreSession: (openPaths: string[], activePath?: string) => Promise<void>;
};
</script>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue';
import { invoke } from '@tauri-apps/api/tauri';
import TabsBar, { type EditorTab } from '@/components/editor/TabsBar.vue';
import {
  isAudioPath,
  isImagePath,
  isMarkdownPath,
  isPdfPath,
  isVideoPath,
  imageMime,
  audioMime,
  pdfMime,
  videoMime,
} from '@/components/viewers/viewerPaths';
import FileViewer from '@/components/viewers/FileViewer.vue';
import MonacoEditorHost from '@/components/editor/MonacoEditorHost.vue';
import { ensureModel, disposeModel, disposeAllModels, getModelText } from '@/components/editor/monacoModelService';
import { setMonacoProjectConfig } from './monacoProject';
import { applyPdfAnnotations } from '@/components/viewers/pdfAnnotations';
import ContextMenu, { type ContextMenuItem } from '@/components/layouts/ContextMenu.vue';
import Modal from '@/components/ui/Modal.vue';

const WORKSPACE_TABS_KEY = 'gopilot.workspace.openFiles';
const WORKSPACE_ACTIVE_KEY = 'gopilot.workspace.activeFile';
const AI_EDIT_LAST_INSTRUCTION_KEY = 'gopilot.aiEdit.lastInstruction';

type TabState = {
  id: string;
  path: string;
  title: string;
  language: string;
  value: string;
  savedValue: string;
  viewerId: 'text' | 'markdown' | 'image' | 'audio' | 'pdf' | 'video' | 'binary';
  assetUrl?: string;
  readOnly: boolean;
  loading?: boolean;
  isDirty?: boolean;
  reveal?: {
    line: number;
    column?: number;
  };
};

const props = defineProps<{
  onSessionChange?: (session: { openPaths: string[]; activePath: string | null }) => void;
  recentProjects?: string[];
  onOpenRecentProject?: (path: string) => void;
  projectRoot?: string;
}>();

const tabs = shallowRef<TabState[]>([]);
const activeId = ref<string | null>(null);
const pendingTabValues = new Map<string, string>();
let tabValueSyncTimer: ReturnType<typeof setTimeout> | null = null;
const aiEditOpen = ref(false);
const aiEditInstruction = ref('');
const aiEditBusy = ref(false);
const aiEditError = ref('');
const aiPreviewOpen = ref(false);
const aiPreviewText = ref('');
const aiEditUseSelection = ref(false);
const aiEditRequestId = ref(0);
const ctx = ref<{ open: boolean; x: number; y: number; tabId: string | null }>({
  open: false,
  x: 0,
  y: 0,
  tabId: null,
});
const restoreActivePathRef = ref('');
const aliasRulesRef = ref<Array<{ prefix: string; targetPrefixAbs: string }>>([]);
const projectRootRef = ref('');
const diffContainerRef = ref<HTMLDivElement | null>(null);
let diffEditor: import('monaco-editor').editor.IStandaloneDiffEditor | null = null;
let diffOriginalModel: import('monaco-editor').editor.ITextModel | null = null;
let diffModifiedModel: import('monaco-editor').editor.ITextModel | null = null;

let monacoModule: typeof import('monaco-editor') | null = null;
async function getMonaco() {
  if (!monacoModule) {
    monacoModule = await import('monaco-editor');
  }
  return monacoModule;
}

const EMPTY_PDF_EDIT_STATE = JSON.stringify({ version: 1, annotations: [] });

watch(
  () => props.projectRoot,
  (projectRoot) => {
    projectRootRef.value = projectRoot ?? '';
  },
  { immediate: true },
);

watch(
  () => props.projectRoot,
  (projectRoot) => {
    if (!projectRoot) {
      aliasRulesRef.value = [];
      aliasRulesRef.value = [];
      return;
    }

    void (async () => {
      try {
        const monaco = await getMonaco();
        const tryPaths = [joinPath2(projectRoot, 'tsconfig.json'), joinPath2(projectRoot, 'jsconfig.json')];
        let raw: string | null = null;
        for (const p of tryPaths) {
          try {
            raw = await readText(p);
            if (raw) break;
          } catch {
            continue;
          }
        }
        if (!raw) {
          aliasRulesRef.value = [{ prefix: '@', targetPrefixAbs: normalizePath(projectRoot) }];
          try {
            setMonacoProjectConfig({
              baseUrl: monaco.Uri.file(normalizePath(projectRoot)).toString(true),
              paths: { '@/*': ['*'] },
              projectRootAbs: normalizePath(projectRoot),
              sourceRootAbs: normalizePath(joinPath2(projectRoot, 'src')),
            });
          } catch {
            // ignore
          }
          return;
        }

        const json = JSON.parse(raw) as any;
        const baseUrl = typeof json?.compilerOptions?.baseUrl === 'string' ? String(json.compilerOptions.baseUrl) : '.';
        const pathsObj =
          json?.compilerOptions?.paths && typeof json.compilerOptions.paths === 'object'
            ? json.compilerOptions.paths
            : null;
        const rules: Array<{ prefix: string; targetPrefixAbs: string }> = [];
        if (pathsObj) {
          for (const key of Object.keys(pathsObj)) {
            const arr = pathsObj[key];
            if (!Array.isArray(arr) || typeof arr[0] !== 'string') continue;
            const target = normalizeTsconfigPathValue(arr[0] as string);
            if (!key.endsWith('/*') || !target.endsWith('/*')) continue;
            const prefix = key.slice(0, -2);
            const targetPrefix = target.slice(0, -2);
            const abs = normalizePath(joinPath2(joinPath2(projectRoot, baseUrl), targetPrefix));
            rules.push({ prefix, targetPrefixAbs: abs });
          }
        }
        if (!rules.some((r) => r.prefix === '@')) {
          rules.push({ prefix: '@', targetPrefixAbs: normalizePath(projectRoot) });
        }
        aliasRulesRef.value = rules;

        try {
          const baseAbs = normalizePath(joinPath2(projectRoot, baseUrl));
          const paths: Record<string, string[]> = {};
          if (pathsObj) {
            for (const key of Object.keys(pathsObj)) {
              const arr = pathsObj[key];
              if (!Array.isArray(arr)) continue;
              paths[key] = (arr.filter((x) => typeof x === 'string') as string[]).map(normalizeTsconfigPathValue);
            }
          }
          if (!paths['@/*']) {
            paths['@/*'] = ['*'];
          }
          setMonacoProjectConfig({
            baseUrl: monaco.Uri.file(baseAbs).toString(true),
            paths,
            projectRootAbs: normalizePath(projectRoot),
            sourceRootAbs: normalizePath(joinPath2(projectRoot, 'src')),
          });
        } catch {
          // ignore
        }

        try {
          const openTabs = tabs.value
            .filter((t) => isScriptLike(t.language))
            .map((t) => ({ path: t.path, value: t.value, language: t.language }));
          // Preload disabled — it blocks the UI on large projects.
          void openTabs;
        } catch {
          // ignore
        }
      } catch {
        aliasRulesRef.value = [];
      }
    })();
  },
  { immediate: true },
);

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const active = tabs.value.find((t) => t.id === activeId.value) ?? null;
    if (props.onSessionChange) {
      props.onSessionChange({
        openPaths: tabs.value.map((t) => t.path).filter(Boolean),
        activePath: active?.path ?? null,
      });
    }
    if (active) {
      localStorage.setItem(WORKSPACE_ACTIVE_KEY, active.path);
    } else {
      localStorage.removeItem(WORKSPACE_ACTIVE_KEY);
    }
    const paths = tabs.value.map((t) => t.path);
    localStorage.setItem(WORKSPACE_TABS_KEY, JSON.stringify(paths));
  }, 400);
}

watch(
  () => [activeId.value, tabs.value.map((t) => `${t.id}:${t.path}:${t.isDirty ? 1 : 0}`).join('|')],
  schedulePersist,
);

watch(activeId, (_next, prev) => {
  if (prev) flushTabValue(prev);
});

watch(aiEditInstruction, (val) => {
  try {
    localStorage.setItem(AI_EDIT_LAST_INSTRUCTION_KEY, val);
  } catch {
    // ignore
  }
});

const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? null);

const canAiEdit = computed(() => {
  const tab = activeTab.value;
  if (!tab) return false;
  if (tab.readOnly) return false;
  return tab.viewerId === 'text' || tab.viewerId === 'markdown';
});

const editorTabs = computed<EditorTab[]>(() =>
  tabs.value.map((t) => ({
    id: t.id,
    path: t.path,
    title: t.title,
    isDirty: Boolean(t.isDirty),
  })),
);

const activeFileViewerTab = computed(() => {
  const tab = activeTab.value;
  if (!tab || tab.loading) return null;
  return {
    id: tab.id,
    path: tab.path,
    title: tab.title,
    language: tab.language,
    viewerId: tab.viewerId,
    readOnly: tab.readOnly,
    value: tab.value,
    reveal: tab.reveal,
  };
});

const ctxItems = computed<ContextMenuItem[]>(() => {
  const tab = tabs.value.find((t) => t.id === ctx.value.tabId) ?? null;
  const dirty = tab ? Boolean(tab.isDirty) : false;
  const tabCanAiEdit = tab ? !tab.readOnly && (tab.viewerId === 'text' || tab.viewerId === 'markdown') : false;
  const tabHasActiveSelection =
    ctx.value.open && tab && tab.id === activeId.value && Boolean(getActiveEditorSelectionText().trim());

  const globalItems: ContextMenuItem[] = [
    {
      id: 'save_all',
      label: 'Save All',
      disabled: tabs.value.length === 0,
      onClick: () => {
        void saveAll();
      },
    },
    {
      id: 'close_all',
      label: 'Close All',
      disabled: tabs.value.length === 0,
      onClick: () => {
        closeAll();
      },
    },
  ];

  if (!ctx.value.tabId) return globalItems;

  return [
    {
      id: 'save',
      label: 'Save',
      disabled: !tab || !dirty,
      onClick: () => {
        if (!tab) return;
        void saveTab(tab);
      },
    },
    {
      id: 'ai_edit',
      label: 'AI Edit',
      disabled: !tab || !tabCanAiEdit,
      onClick: () => {
        if (!tab) return;
        activeId.value = tab.id;
        window.setTimeout(() => openAiEdit({ useSelection: false }), 0);
      },
    },
    {
      id: 'ai_edit_selection',
      label: 'AI Edit (Selection)',
      disabled: !tab || !tabCanAiEdit || !tabHasActiveSelection,
      onClick: () => {
        if (!tab) return;
        activeId.value = tab.id;
        window.setTimeout(() => openAiEdit({ useSelection: true }), 0);
      },
    },
    ...globalItems,
    {
      id: 'close',
      label: 'Close',
      disabled: !tab,
      onClick: () => {
        if (!tab) return;
        closeTab(tab.id);
      },
    },
    {
      id: 'close_others',
      label: 'Close Others',
      disabled: !tab || tabs.value.length <= 1,
      onClick: () => {
        if (!tab) return;
        closeOthers(tab.id);
      },
    },
  ];
});

function getFileName(path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function dirnamePath(p: string) {
  const parts = p.split(/[/\\]/);
  parts.pop();
  return parts.join(p.includes('\\') ? '\\' : '/');
}

function joinPath2(dir: string, child: string) {
  const sep = dir.includes('\\') ? '\\' : '/';
  const d = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  const c = child.startsWith('/') || child.startsWith('\\') ? child.slice(1) : child;
  return normalizePath(`${d}${sep}${c}`);
}

function normalizePath(p: string) {
  const usesBackslash = p.includes('\\');
  const sep = usesBackslash ? '\\' : '/';
  const parts = p.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
      continue;
    }
    stack.push(part);
  }
  const joined = stack.join(sep);
  return usesBackslash ? joined : joined;
}

function normalizeTsconfigPathValue(v: string) {
  if (!v) return v;
  if (v.startsWith('./')) return v.slice(2);
  if (v.startsWith('.\\')) return v.slice(2);
  return v;
}

function isScriptLike(lang: string) {
  return ['javascript', 'typescript'].includes(lang);
}

function inferLanguage(path: string) {
  const lower = path.toLowerCase();
  const base = lower.split(/[/\\]/).pop() ?? lower;
  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs'))
    return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.less')) return 'less';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.ini') || lower.endsWith('.cfg') || lower.endsWith('.conf')) return 'ini';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.c')) return 'c';
  if (lower.endsWith('.h')) return 'c';
  if (
    lower.endsWith('.cpp') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.hh') ||
    lower.endsWith('.hxx')
  )
    return 'cpp';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh') || lower.endsWith('.fish'))
    return 'shell';
  if (lower.endsWith('.ps1') || lower.endsWith('.psm1') || lower.endsWith('.psd1')) return 'powershell';
  if (lower.endsWith('.bat') || lower.endsWith('.cmd')) return 'bat';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'graphql';
  if (lower.endsWith('.dockerignore')) return 'plaintext';
  return 'plaintext';
}

function binaryMime(path: string) {
  if (isImagePath(path)) return imageMime(path);
  if (isAudioPath(path)) return audioMime(path);
  if (isPdfPath(path)) return pdfMime(path);
  if (isVideoPath(path)) return videoMime(path);
  return 'application/octet-stream';
}

async function readBytes(path: string) {
  try {
    const base64 = (await invoke('read_binary_file', { path })) as string;
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i) & 0xff;
    }
    return bytes;
  } catch {
    const fs = await import('@tauri-apps/api/fs');
    return await fs.readBinaryFile(path);
  }
}

function bytesToAssetUrl(bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  return URL.createObjectURL(blob);
}

function decodeText(bytes: Uint8Array) {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  let nulCount = 0;
  const sampleLen = Math.min(bytes.length, 2048);
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) nulCount++;
  }
  if (sampleLen > 0 && nulCount / sampleLen > 0.2) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function readText(path: string) {
  const bytes = await readBytes(path);
  return decodeText(bytes);
}

async function writeText(path: string, content: string) {
  const fs = await import('@tauri-apps/api/fs');
  await fs.writeFile({ path, contents: content });
}

async function writeBytes(path: string, bytes: Uint8Array) {
  const fs = await import('@tauri-apps/api/fs');
  await fs.writeBinaryFile({ path, contents: bytes });
}

function extractImports(source: string) {
  const out = new Set<string>();
  const re = /(?:import|export)\s+(?:[^'"\n]+\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const spec = (m[1] ?? m[2] ?? '').trim();
    if (!spec) continue;
    out.add(spec);
  }
  return Array.from(out);
}

async function resolveAliasCandidates(spec: string, rules: Array<{ prefix: string; targetPrefixAbs: string }>) {
  for (const r of rules) {
    if (spec === r.prefix || spec.startsWith(r.prefix + '/')) {
      const rest = spec === r.prefix ? '' : spec.slice(r.prefix.length + 1);
      const raw = rest ? joinPath2(r.targetPrefixAbs, rest) : r.targetPrefixAbs;
      return [
        raw,
        `${raw}.ts`,
        `${raw}.tsx`,
        `${raw}.js`,
        `${raw}.jsx`,
        `${raw}.json`,
        joinPath2(raw, 'index.ts'),
        joinPath2(raw, 'index.tsx'),
        joinPath2(raw, 'index.js'),
        joinPath2(raw, 'index.jsx'),
      ];
    }
  }
  return [] as string[];
}

async function resolveImportFile(baseDir: string, spec: string) {
  const raw = joinPath2(baseDir, spec);
  return [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${raw}.js`,
    `${raw}.jsx`,
    `${raw}.json`,
    joinPath2(raw, 'index.ts'),
    joinPath2(raw, 'index.tsx'),
    joinPath2(raw, 'index.js'),
    joinPath2(raw, 'index.jsx'),
  ];
}

async function ensureMonacoModel(filePath: string, content: string) {
  const monaco = await getMonaco();
  const uri = monaco.Uri.file(filePath);
  const existing = monaco.editor.getModel(uri);
  if (existing) return;
  const language = inferLanguage(filePath);
  monaco.editor.createModel(content, language, uri);
}

async function ensureMonacoModelFromDisk(filePath: string) {
  const text = await readText(filePath);
  await ensureMonacoModel(filePath, text);
  return text;
}

async function preloadImportGraph(opts: {
  entryPath: string;
  entrySource: string;
  language: string;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
  visited: Set<string>;
  maxFiles: number;
}) {
  if (!isScriptLike(opts.language)) return;
  if (opts.visited.size >= opts.maxFiles) return;

  const key = normalizePath(opts.entryPath);
  if (opts.visited.has(key)) return;
  opts.visited.add(key);

  if (opts.visited.size % 8 === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const baseDir = dirnamePath(opts.entryPath);
  const specs = extractImports(opts.entrySource);

  for (const spec of specs) {
    let candidates: string[] = [];
    if (spec.startsWith('.')) {
      candidates = await resolveImportFile(baseDir, spec);
    } else if (opts.projectRoot && (spec.startsWith('@/') || spec.startsWith('@'))) {
      candidates = await resolveAliasCandidates(spec, opts.aliasRules);
    } else {
      continue;
    }

    if (candidates.length === 0) continue;

    for (const c of candidates) {
      const candidatePath = normalizePath(c);
      if (opts.visited.has(candidatePath)) break;

      try {
        const importedText = await ensureMonacoModelFromDisk(candidatePath);
        const importedLang = inferLanguage(candidatePath);
        await preloadImportGraph({
          entryPath: candidatePath,
          entrySource: importedText,
          language: importedLang,
          projectRoot: opts.projectRoot,
          aliasRules: opts.aliasRules,
          visited: opts.visited,
          maxFiles: opts.maxFiles,
        });
        break;
      } catch {
        continue;
      }
    }

    if (opts.visited.size >= opts.maxFiles) return;
  }
}

async function preloadImportsForFile(_opts: {
  filePath: string;
  source: string;
  language: string;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
}) {
  // Disabled — preloading hundreds of Monaco models freezes the UI.
  return;
}

async function preloadImportsForOpenTabs(opts: {
  tabs: Array<{ path: string; value: string; language: string }>;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
}) {
  for (const t of opts.tabs) {
    try {
      await preloadImportsForFile({
        filePath: t.path,
        source: t.value,
        language: t.language,
        projectRoot: opts.projectRoot,
        aliasRules: opts.aliasRules,
      });
    } catch {
      continue;
    }
  }
}

function flushTabValue(tabId: string) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;

  if (tab.viewerId === 'text') {
    const text = getModelText(tab.path);
    if (text !== null) {
      updateTab(tabId, { value: text, isDirty: text !== tab.savedValue });
    }
    return;
  }

  const pending = pendingTabValues.get(tabId);
  if (pending === undefined) return;
  pendingTabValues.delete(tabId);
  updateTab(tabId, { value: pending, isDirty: pending !== tab.savedValue });
}

function scheduleTabValueSync(tabId: string) {
  if (tabValueSyncTimer) clearTimeout(tabValueSyncTimer);
  tabValueSyncTimer = setTimeout(() => {
    tabValueSyncTimer = null;
    flushTabValue(tabId);
  }, 300);
}

function updateTab(id: string, patch: Partial<TabState>) {
  tabs.value = tabs.value.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

function revealInExplorer(path: string) {
  try {
    window.dispatchEvent(new CustomEvent('gopilot:revealInExplorer', { detail: { path } }));
  } catch {
    // ignore
  }
}

function normalizeFilePath(path: string) {
  if (!path) return path
  // Search results on Unix may contain Windows-style separators from older backend builds.
  if (path.includes('\\') && !/^[a-zA-Z]:[\\/]/.test(path)) {
    return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  }
  return path
}

async function openFile(path: string) {
  path = normalizeFilePath(path)
  const existing = tabs.value.find((t) => t.path === path);
  if (existing) {
    activeId.value = existing.id;
    revealInExplorer(path);
    return;
  }

  const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const title = getFileName(path);
  const language = inferLanguage(path);

  if (isImagePath(path) || isAudioPath(path) || isPdfPath(path) || isVideoPath(path)) {
    try {
      const bytes = await readBytes(path);
      const url = bytesToAssetUrl(bytes, binaryMime(path));
      const viewerId: TabState['viewerId'] = isImagePath(path)
        ? 'image'
        : isAudioPath(path)
          ? 'audio'
          : isPdfPath(path)
            ? 'pdf'
            : 'video';
      const isPdf = viewerId === 'pdf';
      tabs.value = [
        ...tabs.value,
        {
          id,
          path,
          title,
          language: 'plaintext',
          value: isPdf ? EMPTY_PDF_EDIT_STATE : '',
          savedValue: isPdf ? EMPTY_PDF_EDIT_STATE : '',
          viewerId,
          assetUrl: url,
          readOnly: !isPdf,
        },
      ];
      activeId.value = id;
      return;
    } catch {
      const msg = `Failed to load asset preview.\n${path}\n\nPossible causes:\n- Tauri FS scope/permissions do not allow this path (restart tauri:dev after changing scope)\n- File is too large or unsupported format`;
      tabs.value = [
        ...tabs.value,
        {
          id,
          path,
          title,
          language: 'plaintext',
          value: msg,
          savedValue: msg,
          viewerId: 'binary',
          readOnly: true,
        },
      ];
      activeId.value = id;
      return;
    }
  }

  const initialViewerId: TabState['viewerId'] = isMarkdownPath(path) ? 'markdown' : 'text';
  tabs.value = [
    ...tabs.value,
    {
      id,
      path,
      title,
      language,
      value: '',
      savedValue: '',
      viewerId: initialViewerId,
      readOnly: false,
      loading: true,
      isDirty: false,
    },
  ];
  activeId.value = id;
  revealInExplorer(path);

  try {
    const content = await readText(path);
    if (initialViewerId === 'text') {
      await ensureModel(path, language, content);
    }
    tabs.value = tabs.value.map((t) =>
      t.id === id
        ? {
            ...t,
            value: content,
            savedValue: content,
            viewerId: isMarkdownPath(path) ? 'markdown' : 'text',
            readOnly: false,
            loading: false,
            isDirty: false,
          }
        : t,
    );
  } catch {
    const msg = `Failed to read file.\n${path}\n\nPossible causes:\n- Tauri FS scope/permissions do not allow this path\n- The file is binary or encoded in an unsupported format`;
    tabs.value = tabs.value.map((t) =>
      t.id === id ? { ...t, value: msg, savedValue: msg, viewerId: 'binary', readOnly: true, loading: false, isDirty: false } : t,
    );
  }
}

async function openFileAt(path: string, line: number, column?: number) {
  await openFile(path);
  revealInExplorer(path);

  const wantedLine = Math.max(1, Number(line) || 1);
  const wantedCol = Math.max(1, Number(column ?? 1) || 1);

  for (let i = 0; i < 20; i++) {
    const tab = tabs.value.find((t) => t.path === path);
    if (tab) {
      tabs.value = tabs.value.map((t) =>
        t.id === tab.id ? { ...t, reveal: { line: wantedLine, column: wantedCol } } : t,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function restoreSession(openPaths: string[], activePath?: string) {
  const uniq = Array.from(new Set((openPaths ?? []).filter(Boolean)));
  if (uniq.length === 0) return;

  const primary = activePath && uniq.includes(activePath) ? activePath : uniq[0]!;
  const rest = uniq.filter((p) => p !== primary);

  await openFile(primary);
  const primaryTab = tabs.value.find((t) => t.path === primary);
  if (primaryTab) activeId.value = primaryTab.id;

  for (const p of rest) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await openFile(p);
  }

  if (activePath && uniq.includes(activePath)) {
    const tab = tabs.value.find((t) => t.path === activePath);
    if (tab) activeId.value = tab.id;
  }
}

function getActiveEditorSelectionText() {
  try {
    const ed = (window as any).__gopilotMonacoActiveEditor;
    if (!ed || typeof ed.getSelection !== 'function') return '';
    const model = typeof ed.getModel === 'function' ? ed.getModel() : null;
    if (!model || !activeTab.value?.path) return '';

    const uriPath =
      typeof model?.uri?.fsPath === 'string'
        ? model.uri.fsPath
        : typeof model?.uri?.path === 'string'
          ? model.uri.path
          : '';
    const normalizedUri = String(uriPath ?? '').replace(/^file:\/\//, '');
    const normalizedTab = String(activeTab.value.path ?? '');
    if (normalizedUri && normalizedTab && !normalizedUri.endsWith(normalizedTab) && normalizedUri !== normalizedTab) {
      return '';
    }

    const sel = ed.getSelection();
    if (!sel || typeof model.getValueInRange !== 'function') return '';
    const text = model.getValueInRange(sel);
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

function openAiEdit(opts?: { useSelection?: boolean }) {
  if (!activeTab.value) return;
  if (!canAiEdit.value) return;
  aiEditError.value = '';
  aiEditUseSelection.value = Boolean(opts?.useSelection);
  aiPreviewText.value = '';
  aiPreviewOpen.value = false;
  aiEditOpen.value = true;
}

function normalizeAiJson(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('```')) {
    const idx = s.indexOf('\n');
    const body = idx >= 0 ? s.slice(idx + 1) : s;
    return body.replace(/```\s*$/g, '').trim();
  }
  return s;
}

function stopAiEdit() {
  aiEditRequestId.value += 1;
  aiEditBusy.value = false;
  aiEditError.value = 'Cancelled';
}

async function generateAiPreview() {
  if (!activeTab.value) return;
  if (!canAiEdit.value) return;
  const instruction = aiEditInstruction.value.trim();
  if (!instruction) return;
  if (aiEditBusy.value) return;

  const requestId = aiEditRequestId.value + 1;
  aiEditRequestId.value = requestId;

  aiEditBusy.value = true;
  aiEditError.value = '';
  try {
    const cfg = await invoke<any>('ai_get_config');
    const model = typeof cfg?.model === 'string' && cfg.model.trim() ? cfg.model : 'gpt-3.5-turbo';

    const MAX_SOURCE_CHARS = 20000;
    const source = activeTab.value.value ?? '';
    const truncatedSource = source.length > MAX_SOURCE_CHARS ? source.slice(0, MAX_SOURCE_CHARS) : source;
    const truncated = source.length > MAX_SOURCE_CHARS;

    const selectionText = aiEditUseSelection.value ? getActiveEditorSelectionText() : '';
    const MAX_SELECTION_CHARS = 4000;
    const truncatedSelection =
      selectionText.length > MAX_SELECTION_CHARS ? selectionText.slice(0, MAX_SELECTION_CHARS) : selectionText;
    const selectionTruncated = selectionText.length > MAX_SELECTION_CHARS;

    const selectionBlock = selectionText
      ? `Selected text${selectionTruncated ? ' (TRUNCATED)' : ''}:\n${truncatedSelection}\n\n`
      : '';

    const system =
      'You are an AI coding assistant. You must output ONLY valid JSON with no extra text. Schema: {"newText": string}. newText must be the full updated file content after applying the user instruction. Do not wrap in markdown. Do not include explanations.';
    const user =
      `File path: ${activeTab.value.path}\n` +
      `Language: ${activeTab.value.language}\n` +
      `Instruction: ${instruction}\n\n` +
      selectionBlock +
      `Current file content${truncated ? ' (TRUNCATED)' : ''}:\n` +
      truncatedSource;

    const resp = await invoke<any>('ai_chat', {
      request: {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        stream: false,
      },
    });

    if (aiEditRequestId.value !== requestId) return;

    const content = resp?.choices?.[0]?.message?.content != null ? String(resp.choices[0].message.content) : '';
    const normalized = normalizeAiJson(content);
    const parsed = JSON.parse(normalized) as any;
    const newText = typeof parsed?.newText === 'string' ? parsed.newText : '';
    if (!newText) {
      aiEditError.value = 'AI 返回格式不正确：缺少 newText';
      return;
    }

    aiPreviewText.value = newText;
    aiEditOpen.value = false;
    aiPreviewOpen.value = true;
  } catch (e: any) {
    if (aiEditRequestId.value !== requestId) return;
    const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'AI Edit failed.';
    aiEditError.value = msg;
  } finally {
    if (aiEditRequestId.value === requestId) {
      aiEditBusy.value = false;
    }
  }
}

function applyAiEdit() {
  if (!activeTab.value) return;
  if (!canAiEdit.value) return;
  if (!aiPreviewText.value) return;
  updateTab(activeTab.value.id, { value: aiPreviewText.value, isDirty: true });
  aiPreviewOpen.value = false;
  aiPreviewText.value = '';
}

async function saveActive() {
  const tab = activeTab.value;
  if (!tab) return;
  flushTabValue(tab.id);
  const current = tabs.value.find((t) => t.id === tab.id);
  if (!current || !current.isDirty) return;

  const content =
    current.viewerId === 'text' ? (getModelText(current.path) ?? current.value) : current.value;

  if (current.viewerId === 'pdf') {
    try {
      const bytes = await readBytes(current.path);
      const state = JSON.parse(current.value) as { version: 1; annotations: unknown[] };
      const nextBytes = await applyPdfAnnotations(bytes, state as any);
      await writeBytes(current.path, nextBytes);
      const url = bytesToAssetUrl(nextBytes, pdfMime(current.path));
      if (current.assetUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(current.assetUrl);
        } catch {
          // ignore
        }
      }
      updateTab(current.id, { savedValue: current.value, assetUrl: url, isDirty: false });
    } catch {
      return;
    }
    return;
  }

  try {
    await writeText(current.path, content);
    updateTab(current.id, { value: content, savedValue: content, isDirty: false });
  } catch {
    return;
  }
}

async function saveTab(tab: TabState) {
  flushTabValue(tab.id);
  const current = tabs.value.find((t) => t.id === tab.id) ?? tab;
  if (!current.isDirty) return;
  const content =
    current.viewerId === 'text' ? (getModelText(current.path) ?? current.value) : current.value;
  if (current.viewerId === 'pdf') {
    const bytes = await readBytes(current.path);
    const state = JSON.parse(current.value) as { version: 1; annotations: unknown[] };
    const nextBytes = await applyPdfAnnotations(bytes, state as any);
    await writeBytes(current.path, nextBytes);
    const url = bytesToAssetUrl(nextBytes, pdfMime(current.path));
    if (current.assetUrl?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(current.assetUrl);
      } catch {
        // ignore
      }
    }
    updateTab(current.id, { value: content, savedValue: content, assetUrl: url, isDirty: false });
    return;
  }
  await writeText(current.path, content);
  updateTab(current.id, { value: content, savedValue: content, isDirty: false });
}

async function saveAll() {
  for (const t of tabs.value) {
    try {
      await saveTab(t);
    } catch {
      // ignore
    }
  }
}

function closeAll() {
  for (const t of tabs.value) {
    if (t.assetUrl?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(t.assetUrl);
      } catch {
        // ignore
      }
    }
  }
  disposeAllModels();
  tabs.value = [];
  activeId.value = null;
}

function closeOthers(keepId: string) {
  const keep = tabs.value.find((t) => t.id === keepId);
  for (const t of tabs.value) {
    if (t.id !== keepId) {
      if (t.viewerId === 'text') disposeModel(t.path);
      if (t.assetUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(t.assetUrl);
        } catch {
          // ignore
        }
      }
    }
  }
  tabs.value = keep ? [keep] : [];
  activeId.value = keep ? keep.id : null;
}

function openContextMenu(args: { id: string | null; x: number; y: number }) {
  ctx.value = { open: true, x: args.x, y: args.y, tabId: args.id };
}

function closeTab(id: string) {
  flushTabValue(id);
  pendingTabValues.delete(id);

  const idx = tabs.value.findIndex((t) => t.id === id);
  if (idx < 0) return;

  const closing = tabs.value[idx];
  if (closing?.viewerId === 'text') {
    disposeModel(closing.path);
  }
  if (closing?.assetUrl?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(closing.assetUrl);
    } catch {
      // ignore
    }
  }

  const next = tabs.value.filter((t) => t.id !== id);
  if (activeId.value === id) {
    const candidate = next[idx - 1] ?? next[idx] ?? null;
    activeId.value = candidate?.id ?? null;
  }
  tabs.value = next;
}

function onChangeValue(_value: string) {
  const tab = activeTab.value;
  if (!tab || tab.isDirty) return;
  updateTab(tab.id, { isDirty: true });
}

function onChangeValueForViewer(value: string) {
  const tab = activeTab.value;
  if (!tab) return;
  pendingTabValues.set(tab.id, value);
  scheduleTabValueSync(tab.id);
}

async function setupDiffEditor(original: string, modified: string, language: string) {
  const container = diffContainerRef.value;
  if (!container) return;

  disposeDiffEditor();

  const monaco = await getMonaco();
  diffOriginalModel = monaco.editor.createModel(original, language);
  diffModifiedModel = monaco.editor.createModel(modified, language);

  diffEditor = monaco.editor.createDiffEditor(container, {
    readOnly: true,
    renderSideBySide: true,
    minimap: { enabled: false },
    automaticLayout: true,
  });
  diffEditor.setModel({
    original: diffOriginalModel,
    modified: diffModifiedModel,
  });
}

function disposeDiffEditor() {
  diffEditor?.dispose();
  diffEditor = null;
  diffOriginalModel?.dispose();
  diffModifiedModel?.dispose();
  diffOriginalModel = null;
  diffModifiedModel = null;
}

watch([aiPreviewOpen, aiPreviewText, activeTab], async () => {
  if (!aiPreviewOpen.value || !activeTab.value) {
    disposeDiffEditor();
    return;
  }
  await nextTick();
  await setupDiffEditor(activeTab.value.value ?? '', aiPreviewText.value, activeTab.value.language);
});

function onKeyDown(e: KeyboardEvent) {
  const key = String(e.key || '').toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || key !== 'i') return;
  e.preventDefault();
  if (!activeTab.value || !canAiEdit.value) return;
  openAiEdit({ useSelection: Boolean(e.shiftKey) });
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(AI_EDIT_LAST_INSTRUCTION_KEY);
    if (raw && typeof raw === 'string') {
      aiEditInstruction.value = raw;
    }
  } catch {
    // ignore
  }

  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  disposeDiffEditor();
});

defineExpose<EditorWorkspaceHandle>({
  openFile,
  openFileAt,
  restoreSession,
});
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50 w-full overflow-hidden">
    <TabsBar
      :tabs="editorTabs"
      :active-id="activeId"
      @activate="activeId = $event"
      @close="closeTab"
      @context-menu="openContextMenu"
    />

    <Modal
      :open="aiEditOpen"
      title="AI Edit (Single File)"
      @close="!aiEditBusy && (aiEditOpen = false)"
    >
      <div v-if="!activeTab" class="text-xs text-gray-500">No active file.</div>
      <div v-else-if="!canAiEdit" class="text-xs text-gray-500">
        This file is read-only or not supported for AI Edit.
      </div>
      <div v-if="activeTab" class="text-[11px] text-gray-500 mb-2 truncate">{{ activeTab.path }}</div>
      <textarea
        v-model="aiEditInstruction"
        placeholder="Describe the change you want..."
        class="w-full text-sm px-3 py-2 border border-gray-200 rounded min-h-[96px]"
        :disabled="aiEditBusy || !canAiEdit"
      />
      <div v-if="aiEditError" class="mt-2 text-xs text-red-600 whitespace-pre-wrap">{{ aiEditError }}</div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
            :disabled="aiEditBusy"
            @click="aiEditOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
            :disabled="!aiEditBusy"
            @click="stopAiEdit"
          >
            Stop
          </button>
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            :disabled="aiEditBusy || !aiEditInstruction.trim() || !canAiEdit"
            @click="generateAiPreview"
          >
            {{ aiEditBusy ? 'Generating...' : 'Generate' }}
          </button>
        </div>
      </template>
    </Modal>

    <Modal :open="aiPreviewOpen" title="AI Edit Preview" width-class-name="w-[960px]" @close="aiPreviewOpen = false">
      <div v-if="activeTab" ref="diffContainerRef" class="h-[60vh]" />
      <div v-else class="text-xs text-gray-500">No active file.</div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
            @click="aiPreviewOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            :disabled="!aiPreviewText || !canAiEdit"
            @click="applyAiEdit"
          >
            Apply
          </button>
        </div>
      </template>
    </Modal>

    <ContextMenu
      :open="ctx.open"
      :x="ctx.x"
      :y="ctx.y"
      :items="ctxItems"
      @close="ctx = { ...ctx, open: false, tabId: null }"
    />

    <div class="flex-1 min-h-0">
      <div v-if="activeTab" class="h-full flex flex-col">
        <div class="h-10 px-3 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
          <div class="text-xs text-gray-500 truncate">{{ activeTab.title }}</div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
              :disabled="!canAiEdit"
              title="AI Edit"
              @click="openAiEdit({ useSelection: false })"
            >
              AI Edit
            </button>
            <button
              type="button"
              class="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
              :disabled="!canAiEdit || !getActiveEditorSelectionText().trim()"
              title="AI Edit (Selection)"
              @click="openAiEdit({ useSelection: true })"
            >
              AI Edit (Selection)
            </button>
          </div>
        </div>
        <div v-if="activeTab.loading" class="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading {{ activeTab.title }}…
        </div>
        <MonacoEditorHost
          v-else-if="activeTab.viewerId === 'text'"
          :path="activeTab.path"
          :language="activeTab.language"
          :read-only="activeTab.readOnly"
          :reveal="activeTab.reveal"
          :initial-content="activeTab.value"
          @change="onChangeValue"
        />
        <FileViewer
          v-else-if="activeFileViewerTab"
          :tab="activeFileViewerTab"
          :asset-url="activeTab.assetUrl"
          :on-change="onChangeValueForViewer"
        />
      </div>

      <div v-else class="h-full flex items-center justify-center">
        <div class="w-[520px] max-w-[92%]">
          <div class="text-sm font-medium text-gray-700 mb-2">Recent Projects</div>
          <div
            v-if="Array.isArray(recentProjects) && recentProjects.length > 0"
            class="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            <button
              v-for="p in recentProjects.slice(0, 12)"
              :key="p"
              type="button"
              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0"
              :title="p"
              @click="onOpenRecentProject?.(p)"
            >
              <div class="truncate text-gray-800">{{ p }}</div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-500">No recent projects.</div>
          <div class="mt-4 text-xs text-gray-400">Open a file from Explorer to start editing.</div>
        </div>
      </div>
    </div>
  </div>
</template>
