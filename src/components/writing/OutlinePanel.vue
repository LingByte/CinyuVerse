<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import type { ProjectOutline, OutlineNode } from '@/core/types/workspace'
import { EMPTY_OUTLINE, loadWorkspaceData, saveWorkspaceData } from '@/features/workspace/utils/localDataStore'
import { desktopApi } from '@/services/desktopApi'
import { isDesktop } from '@/services/runtime'
import { useShellSyncStore } from '@/features/shell/stores/shellSyncStore'
import OutlineBatchDialog from '@/components/writing/OutlineBatchDialog.vue'
import {
  Download,
  Upload,
  Plus,
  Sparkles,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
} from 'lucide-vue-next'

const props = defineProps<{
  workspaceId: string | null
  workspaceRoot?: string | null
}>()

const emit = defineEmits<{
  jumpChapter: [volId: string, chId: string, title: string]
  generateFromOutline: [node: OutlineNode]
  rewriteFromOutline: [node: OutlineNode]
  refreshTree: []
}>()

const shellSync = useShellSyncStore()
const subTab = ref<'tree' | 'timeline'>('tree')
const outline = ref<ProjectOutline>({ ...EMPTY_OUTLINE, volume_nodes: [], timeline: [] })
const saving = ref(false)
const statusFilter = ref<'all' | 'draft' | 'published' | 'revision'>('all')
const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const showBatchDialog = ref(false)
const contextMenu = ref<{ x: number; y: number; node: OutlineNode } | null>(null)

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '定稿' },
  { value: 'revision', label: '修订' },
] as const

async function load() {
  if (!props.workspaceId) return
  outline.value = await loadWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'outline', {
    book_outline: '',
    volume_nodes: [],
    timeline: [],
  })
  for (const vol of outline.value.volume_nodes) {
    for (const sec of vol.children ?? []) {
      if (!sec.status) sec.status = 'draft'
    }
  }
  registerVolDirs()
}

function registerVolDirs() {
  for (const vol of outline.value.volume_nodes) {
    shellSync.registerVolDir(vol.id, volDirPath(vol))
  }
}

async function persist() {
  if (!props.workspaceId) return
  saving.value = true
  try {
    await saveWorkspaceData(props.workspaceId, props.workspaceRoot ?? null, 'outline', outline.value)
  } finally {
    saving.value = false
  }
}

function volDirPath(vol: OutlineNode): string | null {
  const child = vol.children?.find((c) => c.file_path)
  if (!child?.file_path) return null
  return child.file_path.replace(/[/\\][^/\\]+$/, '')
}

function toggleVol(vol: OutlineNode) {
  const dir = volDirPath(vol)
  shellSync.toggleVol(vol.id, dir)
}

function matchesStatus(node: OutlineNode) {
  if (statusFilter.value === 'all') return true
  const st = node.status ?? 'draft'
  return st === statusFilter.value
}

function visibleSections(vol: OutlineNode) {
  return (vol.children ?? []).filter(matchesStatus)
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectedNodes(): OutlineNode[] {
  const out: OutlineNode[] = []
  for (const vol of outline.value.volume_nodes) {
    for (const sec of vol.children ?? []) {
      if (selectedIds.value.has(sec.id)) out.push(sec)
    }
  }
  return out
}

function jump(node: OutlineNode) {
  const path = node.file_path ?? node.chapter_id
  if (node.vol_id && path) {
    emit('jumpChapter', node.vol_id, path, node.title)
  }
}

function bindFilePath(node: OutlineNode, path: string) {
  node.file_path = path
  node.chapter_id = path
  persist()
}

async function generateSummary() {
  if (!props.workspaceRoot || !isDesktop()) return
  await desktopApi.generateSummaryMd(props.workspaceRoot)
  await persist()
}

function addTimeline() {
  outline.value.timeline.push({
    id: 'tl_' + Date.now(),
    title: '新事件',
    date_label: '',
    description: '',
    characters: [],
  })
}

function exportMd() {
  const lines = [outline.value.book_outline, '']
  for (const node of outline.value.volume_nodes) {
    lines.push(`## ${node.title}`, node.content)
  }
  downloadText(lines.join('\n'), 'outline.md')
}

function importMd() {
  const text = prompt('粘贴 Markdown 大纲内容：')
  if (!text?.trim() || !props.workspaceId) return
  outline.value = { ...outline.value, book_outline: text.trim() }
  persist()
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function batchRenameWithTemplate(template: string) {
  const nodes = selectedNodes().filter((n) => n.file_path)
  if (!nodes.length || !isDesktop()) return
  const renames = nodes.map((n, i) => {
    const base = n.file_path!.replace(/[/\\][^/\\]+$/, '')
    const ext = n.file_path!.match(/(\.[^./\\]+)$/)?.[1] ?? '.md'
    const newTitle = template.replace(/\{title\}/g, n.title).replace(/\{n\}/g, String(i + 1))
    const sep = n.file_path!.includes('\\') ? '\\' : '/'
    const newPath = `${base}${sep}${newTitle}${ext}`
    return { from: n.file_path!, to: newPath, node: n, newTitle }
  })
  const results = await desktopApi.batchRenameFiles(renames.map((r) => ({ from: r.from, to: r.to })))
  for (let i = 0; i < renames.length; i++) {
    if (results[i]?.ok) {
      renames[i].node.file_path = renames[i].to
      renames[i].node.title = renames[i].newTitle
    }
  }
  await finishBatch()
}

async function batchMoveToDir(destDir: string) {
  const nodes = selectedNodes().filter((n) => n.file_path)
  if (!nodes.length || !isDesktop()) return
  const paths = nodes.map((n) => n.file_path!)
  const results = await desktopApi.batchMoveFiles(paths, destDir.trim())
  for (let i = 0; i < nodes.length; i++) {
    if (results[i]?.ok) {
      nodes[i].file_path = results[i].path
      nodes[i].chapter_id = results[i].path
    }
  }
  await finishBatch()
}

async function batchMoveToVolume(volumeId: string) {
  const vol = outline.value.volume_nodes.find((v) => v.id === volumeId)
  const dir = vol ? volDirPath(vol) : null
  if (!dir) return
  await batchMoveToDir(dir)
}

async function relocateNodes(nodes: OutlineNode[], storage: 'draft' | 'final') {
  if (!props.workspaceRoot || !isDesktop()) return
  for (const node of nodes.filter((n) => n.file_path)) {
    try {
      const res = await desktopApi.relocateChapter(props.workspaceRoot!, node.file_path!, storage)
      node.file_path = res.newPath
      node.chapter_id = res.newPath
      node.status = storage === 'final' ? 'published' : 'draft'
    } catch {
      /* skip */
    }
  }
  await persist()
  emit('refreshTree')
}

async function finishBatch() {
  await persist()
  emit('refreshTree')
  selectedIds.value = new Set()
  showBatchDialog.value = false
}

function openSecContextMenu(e: MouseEvent, node: OutlineNode) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, node }
}

function closeContextMenu() {
  contextMenu.value = null
}

async function contextRelocate(storage: 'draft' | 'final') {
  if (!contextMenu.value) return
  await relocateNodes([contextMenu.value.node], storage)
  closeContextMenu()
}

const volumeOptions = computed(() =>
  outline.value.volume_nodes.map((v) => ({
    id: v.id,
    title: v.title,
    dirPath: volDirPath(v),
  })),
)

const batchCount = computed(() => selectedIds.value.size)

watch(() => props.workspaceId, load, { immediate: true })
onMounted(load)
</script>

<template>
  <div class="outline-panel">
    <div v-if="!workspaceId" class="empty">请先打开工作区</div>
    <template v-else>
      <div class="toolbar">
        <button :class="{ active: subTab === 'tree' }" @click="subTab = 'tree'">树形大纲</button>
        <button :class="{ active: subTab === 'timeline' }" @click="subTab = 'timeline'">时间线</button>
        <button class="tool-btn" title="生成 SUMMARY.md" @click="generateSummary"><FileText :size="12" /> 目录</button>
        <button class="tool-btn" title="导出 Markdown" @click="exportMd"><Download :size="12" /></button>
        <button class="tool-btn" @click="importMd"><Upload :size="12" /></button>
        <select v-model="statusFilter" class="status-filter" title="状态筛选">
          <option value="all">全部状态</option>
          <option value="draft">草稿</option>
          <option value="published">定稿</option>
          <option value="revision">修订</option>
        </select>
        <button class="tool-btn" :class="{ active: batchMode }" @click="batchMode = !batchMode">
          {{ batchMode ? '退出批量' : '批量' }}
        </button>
      </div>

      <div v-if="batchMode && subTab === 'tree'" class="batch-bar">
        <span>已选 {{ batchCount }} 项</span>
        <button
          type="button"
          class="mini-btn primary"
          :disabled="batchCount === 0"
          @click="showBatchDialog = true"
        >
          批量操作…
        </button>
      </div>

      <OutlineBatchDialog
        :visible="showBatchDialog"
        :selected-count="batchCount"
        :volume-options="volumeOptions"
        @close="showBatchDialog = false"
        @rename="batchRenameWithTemplate"
        @move="batchMoveToDir"
        @move-to-volume="batchMoveToVolume"
        @to-draft="relocateNodes(selectedNodes(), 'draft').then(finishBatch)"
        @to-final="relocateNodes(selectedNodes(), 'final').then(finishBatch)"
      />

      <div v-if="subTab === 'tree'" class="scroll">
        <label class="field-label">全书总大纲</label>
        <textarea v-model="outline.book_outline" class="area" @blur="persist" />

        <div v-for="vol in outline.volume_nodes" :key="vol.id" class="vol-block">
          <div class="vol-head" @click="toggleVol(vol)">
            <component :is="shellSync.isVolCollapsed(vol.id) ? ChevronRight : ChevronDown" :size="14" />
            <input v-model="vol.title" class="field title vol-title" @click.stop @blur="persist" />
          </div>
          <template v-if="!shellSync.isVolCollapsed(vol.id)">
            <textarea v-model="vol.content" class="area small" placeholder="分卷大纲" @blur="persist" />
            <div v-for="sec in visibleSections(vol)" :key="sec.id" class="sec-row" @contextmenu="openSecContextMenu($event, sec)">
              <div class="sec-head">
                <button
                  v-if="batchMode"
                  type="button"
                  class="check-btn"
                  @click="toggleSelect(sec.id)"
                >
                  <CheckSquare v-if="selectedIds.has(sec.id)" :size="14" />
                  <Square v-else :size="14" />
                </button>
                <span class="link" @click="jump(sec)">{{ sec.title }}</span>
                <select v-model="sec.status" class="status-select" @change="persist">
                  <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <input v-model="sec.content" class="field" placeholder="章节细纲" @blur="persist" />
              <input
                class="field path-field"
                :value="sec.file_path ?? ''"
                placeholder="绑定章节路径"
                @change="(e) => bindFilePath(sec, (e.target as HTMLInputElement).value)"
              />
              <div class="sec-actions">
                <button type="button" class="mini-btn" title="基于大纲生成" @click="emit('generateFromOutline', sec)">
                  <Sparkles :size="11" /> 生成
                </button>
                <button type="button" class="mini-btn" title="基于新大纲改写" @click="emit('rewriteFromOutline', sec)">
                  <RefreshCw :size="11" /> 改写
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div v-else class="scroll">
        <div v-for="ev in outline.timeline" :key="ev.id" class="tl-card">
          <input v-model="ev.date_label" class="field" placeholder="时间" @blur="persist" />
          <input v-model="ev.title" class="field title" placeholder="事件" @blur="persist" />
          <textarea v-model="ev.description" class="area small" placeholder="描述" @blur="persist" />
          <input
            :value="(ev.characters || []).join(', ')"
            class="field"
            placeholder="人物（逗号分隔）"
            @change="(e) => { ev.characters = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()); persist() }"
          />
        </div>
        <button class="add-btn" @click="addTimeline"><Plus :size="14" /> 添加事件</button>
      </div>

      <div v-if="saving" class="hint">同步到 .cinyuverse…</div>

      <Teleport to="body">
        <div
          v-if="contextMenu"
          class="ctx-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <button type="button" @click="contextRelocate('draft')">移入草稿库</button>
          <button type="button" @click="contextRelocate('final')">归档定稿</button>
          <button type="button" @click="closeContextMenu">取消</button>
        </div>
      </Teleport>
      <div v-if="contextMenu" class="ctx-backdrop" @click="closeContextMenu" />
    </template>
  </div>
</template>

<style scoped>
.outline-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.empty { padding: 24px 12px; text-align: center; color: var(--text-sub); }

.toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.toolbar button {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 11px;
}
.toolbar button.active { border-color: var(--accent); color: var(--accent); }
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.scroll { flex: 1; overflow-y: auto; padding: 8px; }

.field-label { display: block; font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
.field, .area {
  width: 100%;
  margin-bottom: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
  box-sizing: border-box;
}
.area { min-height: 64px; resize: vertical; font-family: inherit; }
.area.small { min-height: 40px; }
.title { font-weight: 600; }

.vol-head {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 6px;
}
.vol-title { flex: 1; margin-bottom: 0; }

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-sub);
}

.status-filter,
.status-select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-sub);
  font-size: 10px;
}

.sec-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.check-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  display: flex;
}

.vol-block {
  margin-top: 10px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
}
.sec-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-left: 8px;
  border-left: 2px solid color-mix(in oklab, var(--accent) 30%, transparent);
}
.link {
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}
.link:hover { text-decoration: underline; }
.path-field { font-size: 10px; color: var(--text-muted); }
.sec-actions { display: flex; gap: 4px; }
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  font-size: 10px;
}
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.mini-btn.primary { border-color: var(--accent); color: var(--accent); }
.mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
}

.ctx-menu {
  position: fixed;
  z-index: 181;
  min-width: 140px;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px color-mix(in srgb, #000 25%, transparent);
}

.ctx-menu button {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
  border-radius: 4px;
}

.ctx-menu button:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.tl-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--bg-card);
}

.add-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  border-radius: 4px;
}
.hint { text-align: center; font-size: 10px; color: var(--text-muted); padding: 4px; }
</style>
