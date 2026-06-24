<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  FileCog,
  FileJson,
  FileTerminal,
  FileText,
  Package,
  BookText,
} from 'lucide-vue-next';
import type { TreeNode } from './explorerTypes';

defineOptions({ name: 'ExplorerTreeNode' });

const props = defineProps<{
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  loadingDirs: Record<string, boolean>;
}>();

const emit = defineEmits<{
  toggle: [path: string];
  'ensure-load': [path: string];
  'open-file': [path: string];
}>();

function getExt(p: string) {
  const base = p.split(/[/\\]/).pop() ?? p;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function getBaseName(p: string) {
  return (p.split(/[/\\]/).pop() ?? p).toLowerCase();
}

function onDirClick() {
  emit('toggle', props.node.path);
  emit('ensure-load', props.node.path);
}

function onFileClick() {
  emit('open-file', props.node.path);
}

const paddingLeft = `${8 + props.depth * 12}px`;
const filePaddingLeft = `${8 + props.depth * 12 + 16}px`;
const isExpanded = () => !!props.expanded[props.node.path];
const isDirLoading = () => !!props.loadingDirs[props.node.path];
</script>

<template>
  <div v-if="node.kind === 'dir'">
    <button
      type="button"
      class="flex w-full items-center gap-1.5 py-1 text-left hover:bg-accent/60"
      :style="{ paddingLeft }"
      :title="node.path"
      @click="onDirClick"
    >
      <ChevronDown v-if="isExpanded()" class="h-4 w-4 shrink-0 text-muted-foreground" />
      <ChevronRight v-else class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="truncate text-sm text-foreground">{{ node.name }}</span>
      <span
        v-if="isDirLoading()"
        class="ml-2 w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0"
        aria-label="Loading"
      />
    </button>

    <template v-if="isExpanded() && node.children">
      <div
        v-if="node.loaded && node.children.length === 0"
        class="py-1 text-xs text-muted-foreground"
        :style="{ paddingLeft: `${8 + depth * 12 + 24}px` }"
      >
        Empty
      </div>
      <ExplorerTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :loading-dirs="loadingDirs"
        @toggle="emit('toggle', $event)"
        @ensure-load="emit('ensure-load', $event)"
        @open-file="emit('open-file', $event)"
      />
    </template>
  </div>

  <button
    v-else
    type="button"
    class="flex w-full items-center gap-2 py-1 text-left hover:bg-accent/60"
    :style="{ paddingLeft: filePaddingLeft }"
    :title="node.path"
    @click="onFileClick"
  >
    <Package
      v-if="['package.json', 'package-lock.json'].includes(getBaseName(node.path))"
      class="w-4 h-4 text-emerald-700 shrink-0"
    />
    <Package
      v-else-if="['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].includes(getBaseName(node.path))"
      class="w-4 h-4 text-emerald-700 shrink-0"
    />
    <BookText
      v-else-if="['readme.md', 'readme.markdown'].includes(getBaseName(node.path))"
      class="w-4 h-4 text-indigo-700 shrink-0"
    />
    <FileCog
      v-else-if="['.gitignore', '.gitattributes', '.gitmodules'].includes(getBaseName(node.path))"
      class="w-4 h-4 text-gray-600 shrink-0"
    />
    <FileText
      v-else-if="['license', 'license.md', 'license.txt'].includes(getBaseName(node.path)) || ['md', 'markdown'].includes(getExt(node.path))"
      class="w-4 h-4 shrink-0"
      :class="['md', 'markdown'].includes(getExt(node.path)) ? 'text-sky-600' : 'text-gray-700'"
    />
    <FileJson v-else-if="getExt(node.path) === 'json'" class="w-4 h-4 text-amber-600 shrink-0" />
    <FileText
      v-else-if="['yml', 'yaml'].includes(getExt(node.path))"
      class="w-4 h-4 text-purple-600 shrink-0"
    />
    <FileCog
      v-else-if="['toml', 'ini', 'cfg', 'conf'].includes(getExt(node.path))"
      class="w-4 h-4 text-gray-500 shrink-0"
    />
    <FileTerminal
      v-else-if="['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'].includes(getExt(node.path))"
      class="w-4 h-4 text-emerald-600 shrink-0"
    />
    <FileCode2
      v-else-if="['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(getExt(node.path))"
      class="w-4 h-4 text-indigo-600 shrink-0"
    />
    <FileCode2
      v-else-if="['go', 'rs', 'java', 'kt', 'py'].includes(getExt(node.path))"
      class="w-4 h-4 text-teal-600 shrink-0"
    />
    <FileIcon v-else class="w-4 h-4 text-gray-400 shrink-0" />
    <span class="truncate text-sm text-foreground">{{ node.name }}</span>
  </button>
</template>
