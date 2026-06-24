<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Files, Search, GitBranch, Bot } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/tauri';
import GlobalHeader from '@/components/layouts/GlobalHeader.vue';
import ActivityBar from '@/components/layouts/ActivityBar.vue';
import ExplorerTree from '@/components/explorer/ExplorerTree.vue';
import type { EditorWorkspaceHandle } from '@/components/editor/EditorWorkspace.vue';
import { provideViewerRegistry } from '@/components/viewers/ViewerRegistry';
import { defaultRenderers } from '@/components/viewers/defaultRenderers';
import type { FileViewerRenderer } from '@/components/viewers/types';
import GitPanel from '@/components/git/GitPanel.vue';
import SearchPanel from '@/components/search/SearchPanel.vue';
import GlobalFooter from '@/components/layouts/GlobalFooter.vue';
import BottomPanel from '@/components/terminal/BottomPanel.vue';
import ResizableRightPanel from '@/components/layouts/ResizableRightPanel.vue';
import AIPanel from '@/components/ai/AIPanel.vue';
import ExtensionDetailView from '@/components/extensions/ExtensionDetailView.vue';
import Settings from '@/pages/Settings.vue';
import { ExtensionRegistry } from '@/extensions/registry';
import { loadBuiltinExtensions } from '@/extensions/builtin';
import { loadInstalledExtensionContributions } from '@/extensions/installed';
import { activateInstalledExtensionsNode } from '@/extensions/node-runtime';
import { listenForOutputEvents } from '@/extensions/output-listener';
import type { ExtensionContributions, SidebarPanelContribution } from '@/extensions/types';
import type { ActivityBarItem } from '@/types/activity-bar';
import {
  createPilotIndexFile,
  EXPLORER_ROOT_KEY,
  pilotOutputLogPath,
  pilotSessionPath,
  RECENT_PROJECTS_KEY,
} from '@/utils/pilot';

const EditorWorkspace = defineAsyncComponent({
  loader: () => import('@/components/editor/EditorWorkspace.vue'),
  delay: 0,
});

const viewerRenderers = shallowRef<FileViewerRenderer[]>(defaultRenderers);
provideViewerRegistry(viewerRenderers);

const route = useRoute();
const router = useRouter();
const showSettings = computed(() => route.path === '/settings');

type WorkspaceSession = {
  openPaths: string[];
  activePath: string | null;
};

const baseItems: ActivityBarItem[] = [
  { id: 'explorer', label: 'Explorer', icon: Files },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'git', label: 'Git', icon: GitBranch },
];

const activeId = ref(baseItems[0]?.id ?? 'explorer');
const workspaceRef = ref<EditorWorkspaceHandle | null>(null);

type PendingOpen =
  | { kind: 'file'; path: string }
  | { kind: 'at'; path: string; line: number; column?: number };

const pendingOpens = ref<PendingOpen[]>([]);
const sessionRestoredFor = ref('');

function flushPendingOpens() {
  const ws = workspaceRef.value;
  if (!ws || pendingOpens.value.length === 0) return;

  const queue = [...pendingOpens.value];
  pendingOpens.value = [];
  void (async () => {
    for (const item of queue) {
      if (item.kind === 'file') await ws.openFile(item.path);
      else await ws.openFileAt(item.path, item.line, item.column);
    }
  })();
}

watch(
  () => workspaceRef.value,
  (ws) => {
    if (ws) {
      flushPendingOpens();
      void restoreSession();
    }
  },
  { flush: 'post' },
);
const rootPath = ref('');
const recentProjects = ref<string[]>([]);
const bottomOpen = ref(false);
const bottomTab = ref<'problems' | 'output' | 'terminal'>('terminal');
const bottomHeight = ref(260);
const outputText = ref('');
const rightActiveId = ref<string | null>(null);
const ext = ref<ExtensionContributions>({ activityBarItems: [], sidebarPanels: [] });

const LEFT_PANEL_WIDTH_KEY = 'gopilot.leftPanel.width';
const leftPanelWidth = ref(256);
const isLeftDragging = ref(false);
const leftDragStartX = ref(0);
const leftDragStartWidth = ref(0);

const registry = new ExtensionRegistry();
loadBuiltinExtensions(registry);
void loadInstalledExtensionContributions(registry);
activateInstalledExtensionsNode();
listenForOutputEvents();

const items = computed(() => [...baseItems, ...ext.value.activityBarItems]);

const rightItems = computed(() => [{ id: 'ai', label: 'AI Assistant', icon: Bot }]);

const rightPanels = computed(() => [
  { id: 'ai', title: 'AI Assistant', minWidth: 350, defaultWidth: 420 },
]);

function sidebarPanelProps(panel: SidebarPanelContribution) {
  const ctx = {
    rootPath: rootPath.value,
    onOpenFile: (path: string) => void workspaceRef.value?.openFile(path),
  };
  return panel.props ? panel.props(ctx) : ctx;
}

function openFile(path: string) {
  window.setTimeout(() => {
    if (workspaceRef.value) {
      void workspaceRef.value.openFile(path);
      return;
    }
    pendingOpens.value.push({ kind: 'file', path });
  }, 0);
}

function openFileAt(path: string, line: number, column?: number) {
  window.setTimeout(() => {
    if (workspaceRef.value) {
      void workspaceRef.value.openFileAt(path, line, column);
      return;
    }
    pendingOpens.value.push({ kind: 'at', path, line, column });
  }, 0);
}

function appendOutput(title: string, text: string) {
  if (!rootPath.value) return;
  const entry = {
    ts: new Date().toISOString(),
    title,
    text: (text ?? '').toString(),
  };
  const line = `${JSON.stringify(entry)}\n`;
  const humanBlock = `▸ ${title}\n${entry.text}\n\n`;
  outputText.value = outputText.value ? `${outputText.value}${humanBlock}` : humanBlock;

  void (async () => {
    try {
      const p = pilotOutputLogPath(rootPath.value);
      await invoke('create_directory', { path: `${rootPath.value}/.pilot` });
      await invoke('append_file', { path: p, content: line });
    } catch (e) {
      console.error('Failed to append output log:', e);
    }
  })();

  bottomTab.value = 'output';
  bottomOpen.value = true;
}

async function loadOutputLog() {
  if (!rootPath.value) {
    outputText.value = '';
    return;
  }
  try {
    const p = pilotOutputLogPath(rootPath.value);
    const content = await invoke('read_file', { path: p });
    outputText.value = typeof content === 'string' ? content : String(content ?? '');
  } catch {
    outputText.value = '';
  }
}

function clearOutput() {
  outputText.value = '';
  if (!rootPath.value) return;
  void (async () => {
    try {
      const p = pilotOutputLogPath(rootPath.value);
      await invoke('write_file', { path: p, content: '' });
    } catch (e) {
      console.error('Failed to clear output log:', e);
    }
  })();
}

async function handleRootPathChange(path: string) {
  rootPath.value = path;
  await createPilotIndexFile(path);
  await loadOutputLog();
}

function addRecentProject(p: string) {
  const next = [p, ...recentProjects.value.filter((x) => x !== p)].slice(0, 12);
  recentProjects.value = next;
  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function openRecentProject(p: string) {
  if (!p) return;
  await handleRootPathChange(p);
  addRecentProject(p);
  activeId.value = 'explorer';
}

function persistSession(session: WorkspaceSession) {
  if (!rootPath.value) return;
  void (async () => {
    try {
      await invoke('create_directory', { path: `${rootPath.value}/.pilot` });
      await invoke('write_file', {
        path: pilotSessionPath(rootPath.value),
        content: JSON.stringify(session, null, 2),
      });
    } catch (e) {
      console.error('Failed to persist session:', e);
    }
  })();
}

async function restoreSession() {
  if (!rootPath.value || !workspaceRef.value) return;
  if (sessionRestoredFor.value === rootPath.value) return;
  try {
    const raw = await invoke('read_file', { path: pilotSessionPath(rootPath.value) });
    if (typeof raw !== 'string' || !raw) return;
    const parsed = JSON.parse(raw) as WorkspaceSession;
    const openPaths = Array.isArray(parsed?.openPaths) ? parsed.openPaths.filter(Boolean).slice(0, 8) : [];
    const activePath = typeof parsed?.activePath === 'string' ? parsed.activePath : null;
    if (openPaths.length === 0) return;
    sessionRestoredFor.value = rootPath.value;
    // Defer so sidebar clicks stay responsive during startup.
    window.setTimeout(() => {
      void workspaceRef.value?.restoreSession(openPaths, activePath ?? undefined);
    }, 300);
  } catch {
    // ignore
  }
}

function onLeftResizeMouseDown(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  leftDragStartX.value = e.clientX;
  leftDragStartWidth.value = leftPanelWidth.value;

  const onMove = (ev: MouseEvent) => {
    isLeftDragging.value = true;
    const deltaX = ev.clientX - leftDragStartX.value;
    const minWidth = 180;
    const maxWidth = window.innerWidth * 0.6;
    leftPanelWidth.value = Math.max(minWidth, Math.min(leftDragStartWidth.value + deltaX, maxWidth));
  };

  const stopDrag = () => {
    isLeftDragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('blur', stopDrag);
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') stopDrag();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);
  document.addEventListener('keydown', onKeyDown);
}

function openTerminal() {
  bottomTab.value = 'terminal';
  bottomOpen.value = true;
}

function setActiveId(id: string) {
  activeId.value = id;
}

function setRightActiveId(id: string | null) {
  rightActiveId.value = id;
}

function setBottomOpen(open: boolean) {
  bottomOpen.value = open;
}

function setBottomTab(tab: 'problems' | 'output' | 'terminal') {
  bottomTab.value = tab;
}

function setBottomHeight(height: number) {
  bottomHeight.value = height;
}

let unsubExtensions: (() => void) | null = null;
let unlistenOpenFiles: (() => void) | null = null;
let unlistenFileDrop: (() => void) | null = null;

const onChanged = () => {
  void loadInstalledExtensionContributions(registry);
};
const onRuntimeReload = () => {
  console.log('[Extensions] Runtime reload requested - restarting Node Extension Host');
};
const onExtOutput = (e: Event) => {
  const detail = (e as CustomEvent<{ title?: string; text?: string }>).detail;
  const title = detail?.title ? String(detail.title) : 'Extension';
  const text = detail?.text ? String(detail.text) : '';
  if (!text) return;
  appendOutput(title, text);
};
const onRevealInExplorer = () => {
  activeId.value = 'explorer';
};

onMounted(() => {
  try {
    const raw = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 180) leftPanelWidth.value = n;
  } catch {
    // ignore
  }

  try {
    const saved = localStorage.getItem(EXPLORER_ROOT_KEY);
    if (saved) rootPath.value = saved;
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) recentProjects.value = list.filter(Boolean);
  } catch {
    // ignore
  }

  unsubExtensions = registry.subscribe((next) => {
    ext.value = next;
  });

  window.addEventListener('extensions-installed-changed', onChanged);
  window.addEventListener('extensions-runtime-reload', onRuntimeReload);
  window.addEventListener('extensions-output', onExtOutput);
  window.addEventListener('gopilot:revealInExplorer', onRevealInExplorer);

  void (async () => {
    try {
      const event = await import('@tauri-apps/api/event');
      const fs = await import('@tauri-apps/api/fs');

      const openFilesListener = await event.listen<string[]>('open-files', async (e) => {
        const paths = (e.payload ?? []).filter(Boolean);
        if (paths.length === 0) return;
        const candidate = paths[0]!;
        try {
          await fs.readDir(candidate, { recursive: false });
          rootPath.value = candidate;
          addRecentProject(candidate);
          await createPilotIndexFile(candidate);
          await loadOutputLog();
          activeId.value = 'explorer';
        } catch (error) {
          console.error('Failed to open directory:', error);
        }
      });
      unlistenOpenFiles = () => openFilesListener();

      const fileDropListener = await event.listen<string[]>('tauri://file-drop', async (e) => {
        const paths = (e.payload ?? []).filter(Boolean);
        if (paths.length === 0) return;
        const candidate = paths[0]!;
        try {
          await fs.readDir(candidate, { recursive: false });
          rootPath.value = candidate;
          addRecentProject(candidate);
          await createPilotIndexFile(candidate);
          await loadOutputLog();
          activeId.value = 'explorer';
        } catch (error) {
          console.error('Failed to open directory:', error);
        }
      });
      unlistenFileDrop = () => fileDropListener();
    } catch (error) {
      console.error('Failed to set up file listeners:', error);
    }
  })();
});

onUnmounted(() => {
  window.removeEventListener('extensions-installed-changed', onChanged);
  window.removeEventListener('extensions-runtime-reload', onRuntimeReload);
  window.removeEventListener('extensions-output', onExtOutput);
  window.removeEventListener('gopilot:revealInExplorer', onRevealInExplorer);
  unsubExtensions?.();
  unlistenOpenFiles?.();
  unlistenFileDrop?.();
});

watch(leftPanelWidth, (width) => {
  try {
    localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(width));
  } catch {
    // ignore
  }
});

watch(rootPath, (path) => {
  if (path) localStorage.setItem(EXPLORER_ROOT_KEY, path);
  else localStorage.removeItem(EXPLORER_ROOT_KEY);
  if (path !== sessionRestoredFor.value) {
    sessionRestoredFor.value = '';
  }
  void loadOutputLog();
  void restoreSession();
});
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col">
    <GlobalHeader :on-settings-click="() => router.push('/settings')" />

    <div class="flex-1 min-h-0 flex">
      <ActivityBar :items="items" :active-id="activeId" :on-active-change="setActiveId" />

      <div
        class="border-r border-gray-200 bg-white flex shrink-0"
        :style="{ width: `${leftPanelWidth}px`, minWidth: '180px' }"
      >
        <div class="flex-1 min-w-0 flex flex-col relative">
          <div v-if="isLeftDragging" class="fixed inset-0 z-50 cursor-ew-resize" @mouseup="isLeftDragging = false" />

          <div v-show="activeId === 'explorer'" class="h-full">
            <ExplorerTree
              :root-path="rootPath"
              :on-root-path-change="handleRootPathChange"
              :on-open-file="openFile"
            />
          </div>

          <div v-show="activeId === 'search'" class="h-full">
            <SearchPanel :root-path="rootPath" :on-open-match="openFileAt" />
          </div>

          <div v-show="activeId === 'git'" class="h-full">
            <GitPanel :root-path="rootPath" :on-output="appendOutput" />
          </div>

          <div
            v-for="panel in ext.sidebarPanels"
            :key="panel.id"
            v-show="activeId === panel.id"
            class="h-full"
          >
            <component :is="panel.component" v-bind="sidebarPanelProps(panel)" />
          </div>
        </div>

        <div
          class="w-1 shrink-0 self-stretch cursor-ew-resize hover:bg-blue-500/30"
          :class="isLeftDragging ? 'bg-blue-500' : 'bg-gray-200'"
          @mousedown="onLeftResizeMouseDown"
        />
      </div>

      <div class="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
        <div class="flex-1 min-h-0 w-full overflow-hidden relative">
          <div v-show="activeId === 'extensions'" class="absolute inset-0">
            <ExtensionDetailView />
          </div>
          <div v-show="activeId !== 'extensions'" class="absolute inset-0">
            <Suspense>
              <EditorWorkspace
                ref="workspaceRef"
                :recent-projects="recentProjects"
                :project-root="rootPath"
                :on-session-change="persistSession"
                :on-open-recent-project="openRecentProject"
              />
              <template #fallback>
                <div class="h-full flex items-center justify-center text-sm text-gray-500">
                  Loading editor…
                </div>
              </template>
            </Suspense>
          </div>
        </div>

        <BottomPanel
          :open="bottomOpen"
          :active-tab="bottomTab"
          :height="bottomHeight"
          :root-path="rootPath"
          :output-text="outputText"
          @open-change="setBottomOpen"
          @active-tab-change="setBottomTab"
          @height-change="setBottomHeight"
          @clear-output="clearOutput"
        />
      </div>

      <ResizableRightPanel
        :items="rightItems"
        :panels="rightPanels"
        :active-id="rightActiveId"
        :on-active-change="setRightActiveId"
      >
        <template #ai>
          <AIPanel :root-path="rootPath" />
        </template>
      </ResizableRightPanel>
    </div>

    <GlobalFooter :root-path="rootPath" :on-open-terminal="openTerminal" />
  </div>

  <div v-if="showSettings" class="fixed inset-0 z-50 bg-black/30">
    <div class="absolute inset-4 bg-white rounded-lg shadow-xl overflow-hidden">
      <Settings :on-close="() => router.push('/')" />
    </div>
  </div>
</template>
