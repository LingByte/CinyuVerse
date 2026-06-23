<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import ThemeSelector from '@/components/ide/ThemeSelector.vue'

defineProps<{ folderName?: string }>()

const emit = defineEmits<{
  openFile: []
  openFolder: []
  save: []
  closeFolder: []
  toggleSidebar: []
  zoomIn: []
  zoomOut: []
  zoomReset: []
  openPreferences: []
  toggleTypewriter: []
  openInspiration: []
  minimizeWindow: []
  toggleMaximize: []
  closeWindow: []
}>()

const isDesktop = computed(() => typeof window !== 'undefined' && !!window.electronAPI)
const isMaximized = ref(false)
const openMenuId = ref<string | null>(null)

interface MenuItem {
  label?: string
  shortcut?: string
  separator?: boolean
  disabled?: boolean
  action?: () => void
}

interface MenuDef {
  id: string
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
    { label: '关闭文件夹', action: () => emit('closeFolder') },
  ]

  if (isDesktop.value) {
    items.push(
      { separator: true },
      { label: '偏好设置...', action: () => emit('openPreferences') },
      { separator: true },
      { label: '最小化', action: () => emit('minimizeWindow') },
      { label: isMaximized.value ? '还原窗口' : '最大化', action: () => emit('toggleMaximize') },
      { label: '关闭窗口', shortcut: 'Alt+F4', action: () => emit('closeWindow') },
    )
  }
  return items
})

const menus = computed<MenuDef[]>(() => [
  { id: 'file', label: '文件', items: fileMenuItems.value },
  {
    id: 'edit',
    label: '编辑',
    items: [
      { label: '撤销', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
      { label: '重做', shortcut: 'Ctrl+Y', action: () => document.execCommand('redo') },
      { separator: true },
      { label: '剪切', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
      { label: '复制', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
      { label: '粘贴', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
    ],
  },
  {
    id: 'view',
    label: '视图',
    items: [
      { label: '切换侧边栏', shortcut: 'Ctrl+B', action: () => emit('toggleSidebar') },
      { separator: true },
      { label: '打字机专注模式', action: () => emit('toggleTypewriter') },
      { label: '灵感草稿箱', shortcut: 'Ctrl+Shift+I', action: () => emit('openInspiration') },
      { separator: true },
      { label: '放大字体', shortcut: 'Ctrl+=', action: () => emit('zoomIn') },
      { label: '缩小字体', shortcut: 'Ctrl+-', action: () => emit('zoomOut') },
      { label: '重置缩放', shortcut: 'Ctrl+0', action: () => emit('zoomReset') },
      { separator: true },
      { label: '外观与主题...', shortcut: 'Ctrl+,', action: () => emit('openPreferences') },
    ],
  },
  { id: 'window', label: '窗口', items: [] },
])

function onOpenChange(id: string, value: boolean) {
  openMenuId.value = value ? id : (openMenuId.value === id ? null : openMenuId.value)
}

function onItemClick(action?: () => void) {
  action?.()
}

async function syncMaximizedState() {
  const api = window.electronAPI
  if (!api) return
  isMaximized.value = await api.isWindowMaximized()
}

onMounted(() => {
  syncMaximizedState()
})

defineExpose({ syncMaximizedState })
</script>

<template>
  <div
    class="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-secondary)] px-1 text-xs select-none [-webkit-app-region:drag]"
    @click.stop
  >
    <DropdownMenu
      v-for="menu in menus"
      :key="menu.id"
      v-show="menu.items.length > 0"
      @update:open="(v: boolean) => onOpenChange(menu.id, v)"
    >
      <template #trigger>
        <button
          type="button"
          class="ide-menu-trigger"
          :class="{ 'is-active': openMenuId === menu.id }"
          :disabled="menu.items.length === 0"
        >
          {{ menu.label }}
        </button>
      </template>

      <template v-for="(item, idx) in menu.items" :key="idx">
        <DropdownMenuSeparator v-if="item.separator" />
        <DropdownMenuItem
          v-else
          :disabled="item.disabled"
          @click="onItemClick(item.action)"
        >
          <span class="flex-1">{{ item.label }}</span>
          <span v-if="item.shortcut" class="ml-8 text-xs text-[var(--text-muted)]">{{ item.shortcut }}</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenu>

    <div class="flex-1" />

    <ThemeSelector class="mr-2 shrink-0" @open-settings="emit('openPreferences')" />
    <span
      v-if="folderName"
      class="mr-2 max-w-[200px] truncate text-[11px] text-[var(--text-muted)] [-webkit-app-region:no-drag]"
    >
      {{ folderName }}
    </span>
  </div>
</template>

<style scoped>
.ide-menu-trigger {
  height: 100%;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
  -webkit-app-region: no-drag;
}
.ide-menu-trigger:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-main);
}
.ide-menu-trigger.is-active {
  background: var(--bg-hover);
  color: var(--text-main);
}
.ide-menu-trigger:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
