<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ThemeSelector from '@/components/theme/ThemeSelector.vue'
import { detectMacPlatform, formatShortcut } from '@/core/platform'

defineProps<{
  workspaceName?: string
}>()

const emit = defineEmits<{
  openFile: []
  openFolder: []
  save: []
  exportTxt: []
  exportMd: []
  exportEpub: []
  exportDocx: []
  exportFanqie: []
  exportQidian: []
  exportJinjiang: []
  backupWorkspace: []
  writingStats: []
  plotAudit: []
  openExtensionHub: []
  closeWorkspace: []
  newWorkspace: []
  newVolume: []
  newChapter: []
  toggleSidebar: []
  toggleAiPanel: []
  zoomIn: []
  zoomOut: []
  zoomReset: []
  resetLayout: []
  openPreferences: []
  toggleTypewriter: []
  openDashboard: []
  openInspiration: []
  detachPanel: [panel: 'ai' | 'outline']
  minimizeWindow: []
  toggleMaximize: []
  closeWindow: []
}>()

// ── Menu State ──────────────────────────────────────────────

type MenuId = 'file' | 'edit' | 'view' | 'window' | null
const activeMenu = ref<MenuId>(null)
import { isDesktop as checkDesktop } from '@/services/runtime'
import { desktopApi } from '@/services/desktopApi'
const isMaximized = ref(false)
const macOS = ref(false)

function withShortcuts(items: MenuItem[]): MenuItem[] {
  return items.map((item) =>
    item.shortcut ? { ...item, shortcut: formatShortcut(item.shortcut, macOS.value) } : item,
  )
}

interface MenuItem {
  label?: string
  shortcut?: string
  separator?: boolean
  disabled?: boolean
  action?: () => void
}

interface MenuDef {
  id: Exclude<MenuId, null>
  label: string
  items: MenuItem[]
}

const fileMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    { label: '打开文件...', shortcut: 'Ctrl+O', action: () => emit('openFile') },
    { label: '打开文件夹...', shortcut: 'Ctrl+K Ctrl+O', action: () => emit('openFolder') },
    { separator: true },
    { label: '保存', shortcut: 'Ctrl+S', action: () => emit('save') },
    { separator: true },
    { label: '导出为 TXT', action: () => emit('exportTxt') },
    { label: '导出为 Markdown', action: () => emit('exportMd') },
    { label: '导出 EPUB', action: () => emit('exportEpub') },
    { label: '导出 Word (.docx)', action: () => emit('exportDocx') },
    { separator: true },
    { label: '导出番茄小说格式', action: () => emit('exportFanqie') },
    { label: '导出起点中文网格式', action: () => emit('exportQidian') },
    { label: '导出晋江文学城格式', action: () => emit('exportJinjiang') },
    { separator: true },
    { label: '写作统计…', action: () => emit('writingStats') },
    { label: '剧情审校报告…', action: () => emit('plotAudit') },
    { label: '增量备份工作区', action: () => emit('backupWorkspace') },
    { label: '扩展与模型…', action: () => emit('openExtensionHub') },
    { separator: true },
    { label: '关闭工作区', action: () => emit('closeWorkspace') },
  ]

  if (checkDesktop()) {
    items.push(
      { separator: true },
      { label: '偏好设置...', action: () => emit('openPreferences') },
      { separator: true },
      { label: '最小化', action: () => emit('minimizeWindow') },
      {
        label: isMaximized.value ? '还原窗口' : '最大化',
        action: () => emit('toggleMaximize'),
      },
      { label: '关闭窗口', shortcut: 'Alt+F4', action: () => emit('closeWindow') },
    )
  }

  return withShortcuts(items)
})

const menus = computed<MenuDef[]>(() => [
  {
    id: 'file',
    label: '文件',
    items: fileMenuItems.value,
  },
  {
    id: 'edit',
    label: '编辑',
    items: withShortcuts([
      { label: '撤销', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
      { label: '重做', shortcut: 'Ctrl+Y', action: () => document.execCommand('redo') },
      { separator: true },
      { label: '剪切', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
      { label: '复制', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
      { label: '粘贴', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
      { separator: true },
      { label: '查找替换...', shortcut: 'Ctrl+H', action: () => {} },
    ]),
  },
  {
    id: 'view',
    label: '视图',
    items: withShortcuts([
      { label: '切换侧边栏', shortcut: 'Ctrl+B', action: () => emit('toggleSidebar') },
      { label: '切换 AI 助手', shortcut: 'Ctrl+L', action: () => emit('toggleAiPanel') },
      { separator: true },
      { label: '打字机专注模式', action: () => emit('toggleTypewriter') },
      { label: '写作数据看板', action: () => emit('openDashboard') },
      { separator: true },
      { label: '灵感草稿箱', shortcut: 'Ctrl+Shift+I', action: () => emit('openInspiration') },
      { label: '拆出 AI 面板', action: () => emit('detachPanel', 'ai') },
      { label: '拆出大纲面板', action: () => emit('detachPanel', 'outline') },
      { separator: true },
      { label: '放大字体', shortcut: 'Ctrl+=', action: () => emit('zoomIn') },
      { label: '缩小字体', shortcut: 'Ctrl+-', action: () => emit('zoomOut') },
      { label: '重置缩放', shortcut: 'Ctrl+0', action: () => emit('zoomReset') },
      { separator: true },
      { label: '外观与主题...', shortcut: 'Ctrl+,', action: () => emit('openPreferences') },
    ]),
  },
  {
    id: 'window',
    label: '窗口',
    items: [
      { label: '重置面板布局', action: () => emit('resetLayout') },
    ],
  },
])

function toggleMenu(id: MenuId) {
  activeMenu.value = activeMenu.value === id ? null : id
}

function clickItem(item: MenuItem) {
  if (item.disabled || !item.action) return
  activeMenu.value = null
  item.action()
}

function onDocClick() {
  activeMenu.value = null
}

async function syncMaximizedState() {
  if (!checkDesktop()) return
  isMaximized.value = await desktopApi.isWindowMaximized()
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  macOS.value = await detectMacPlatform()
  syncMaximizedState()
})
onUnmounted(() => document.removeEventListener('click', onDocClick))

defineExpose({ syncMaximizedState })
</script>

<template>
  <div class="menu-bar" @click.stop>
    <button
      v-for="menu in menus"
      :key="menu.id"
      class="menu-trigger"
      :class="{ active: activeMenu === menu.id }"
      @click="toggleMenu(menu.id)"
      @mouseenter="activeMenu = activeMenu ? menu.id : null"
    >
      {{ menu.label }}
    </button>

    <div class="menu-spacer"></div>
    <ThemeSelector class="menu-theme-select" @open-settings="emit('openPreferences')" />
    <span v-if="workspaceName" class="menu-ws-name">{{ workspaceName }}</span>

    <!-- Dropdowns -->
    <Teleport to="body">
      <div
        v-for="menu in menus"
        :key="menu.id"
        v-show="activeMenu === menu.id"
        class="menu-dropdown"
        :style="{ left: menus.findIndex(m => m.id === menu.id) * 52 + 4 + 'px', top: '28px' }"
        @click.stop
      >
        <template v-for="(item, idx) in menu.items" :key="idx">
          <div v-if="item.separator" class="menu-separator"></div>
          <div
            v-else
            class="menu-item"
            :class="{ disabled: item.disabled }"
            @click="clickItem(item)"
          >
            <span class="menu-item-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="menu-item-shortcut">{{ item.shortcut }}</span>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  height: 28px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 0 4px;
  font-size: 12px;
  user-select: none;
  -webkit-app-region: drag;
}

.menu-trigger {
  background: none;
  border: none;
  color: var(--text-secondary);
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
  -webkit-app-region: no-drag;
  transition: background 0.15s;
}
.menu-trigger:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.menu-trigger.active {
  background: var(--bg-hover);
  color: var(--text-main);
}

.menu-spacer {
  flex: 1;
}

.menu-theme-select {
  margin-right: 8px;
  flex-shrink: 0;
}

.menu-ws-name {
  color: var(--text-muted);
  font-size: 11px;
  margin-right: 8px;
  -webkit-app-region: no-drag;
}

/* ── Dropdown ───────────────────────────────────────────── */
.menu-dropdown {
  position: fixed;
  z-index: 10000;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 220px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  animation: menuIn 0.1s ease;
}

@keyframes menuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-main);
  transition: background 0.1s;
}
.menu-item:hover {
  background: var(--accent);
  color: #fff;
}
.menu-item:hover .menu-item-shortcut {
  color: rgba(255,255,255,0.6);
}
.menu-item.disabled {
  opacity: 0.4;
  cursor: default;
}
.menu-item.disabled:hover {
  background: none;
  color: var(--text-main);
}

.menu-item-label {
  white-space: nowrap;
}

.menu-item-shortcut {
  margin-left: 24px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.menu-separator {
  height: 1px;
  background: var(--border);
  margin: 4px 8px;
}
</style>
