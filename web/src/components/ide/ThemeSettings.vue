<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import Alert from '@/components/ui/Alert.vue'
import { useThemeStore, type AccentColor } from '@/stores/themeStore'
import { useEditorSchemeStore } from '@/stores/editorSchemeStore'
import { EDITABLE_THEME_KEYS } from '@/config/themePresets'
import { EDITABLE_SCHEME_KEYS, SCHEME_LABELS } from '@/config/editorSchemes'
import type { ThemePreset } from '@/config/themePresets'
import type { EditableSchemeKey } from '@/config/editorSchemes'
import {
  importThemePlugin,
  exportThemePlugin,
  readFileAsBytes,
  bytesToDownloadBlob,
} from '@/utils/themePluginPack'

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  close: []
}>()

const settingsTab = ref<'ui' | 'editor'>('ui')
const theme = useThemeStore()
const scheme = useEditorSchemeStore()
const { presetId, isCustomActive, activeCustomId } = storeToRefs(theme)
const {
  presetId: schemePresetId,
  isCustomActive: schemeCustomActive,
  activeCustomId: schemeCustomId,
} = storeToRefs(scheme)

const presetTab = ref<'all' | 'light' | 'dark' | 'custom'>('all')
const schemeTab = ref<'all' | 'light' | 'dark' | 'custom'>('all')
const contrastMsg = ref('')
const contrastOk = ref(true)
const importError = ref('')
const importInfo = ref('')
const pluginAuthor = ref('')
const saveName = ref('')
const showSaveInput = ref(false)
const schemeSaveName = ref('')
const showSchemeSaveInput = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const schemeFileInputRef = ref<HTMLInputElement | null>(null)
const themeJsonInputRef = ref<HTMLInputElement | null>(null)
const pluginInputRef = ref<HTMLInputElement | null>(null)
const bgImageInputRef = ref<HTMLInputElement | null>(null)

const COLOR_LABELS: Record<string, string> = {
  '--bg-primary': '页面背景',
  '--bg-secondary': '面板背景',
  '--bg-card': '卡片背景',
  '--bg-input': '输入框背景',
  '--text-main': '正文文字',
  '--text-secondary': '次要文字',
  '--text-sub': '辅助文字',
  '--text-muted': '提示文字',
  '--border': '边框',
  '--accent': '强调色',
}

const filteredPresets = computed(() => {
  if (presetTab.value === 'light') return theme.lightPresets
  if (presetTab.value === 'dark') return theme.darkPresets
  if (presetTab.value === 'custom') return []
  return theme.builtinPresets
})

const filteredSchemes = computed(() => {
  if (schemeTab.value === 'light') return scheme.lightSchemes
  if (schemeTab.value === 'dark') return scheme.darkSchemes
  if (schemeTab.value === 'custom') return []
  return scheme.builtinSchemes
})

const previewColors = computed(() => theme.activeColors)
const previewScheme = computed(() => scheme.activeColors)

function selectPreset(p: ThemePreset) {
  theme.setPreset(p.id)
  runContrastCheck()
}

function selectAccent(c: AccentColor) {
  theme.setAccentColor(c)
  runContrastCheck()
}

function runContrastCheck() {
  const result = theme.checkContrast()
  contrastOk.value = result.ok
  contrastMsg.value = result.message
}

watch(() => props.visible, (v) => {
  if (v) {
    importError.value = ''
    importInfo.value = ''
    runContrastCheck()
  }
})

function onColorInput(key: string, e: Event) {
  theme.updateEditorColor(key, (e.target as HTMLInputElement).value)
  runContrastCheck()
}

function onSchemeColorInput(key: EditableSchemeKey, e: Event) {
  scheme.updateOverride(key, (e.target as HTMLInputElement).value)
}

async function pickFile(filters: { name: string; extensions: string[] }[]): Promise<{ content: string; encoding?: 'utf8' | 'base64'; name: string } | null> {
  const api = window.electronAPI
  if (api?.openFiles) {
    const files = await api.openFiles({ filters })
    if (!files?.length) return null
    return { content: files[0].content, encoding: files[0].encoding, name: files[0].name }
  }
  return null
}

function bytesFromContent(content: string, encoding?: 'utf8' | 'base64'): Uint8Array {
  if (encoding === 'base64') {
    const binary = atob(content)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(content)
}

async function applyPluginBytes(bytes: Uint8Array) {
  importError.value = ''
  importInfo.value = ''
  const result = importThemePlugin(bytes)
  if (!result) {
    importError.value = '无法解析主题插件包（.jar / .zip）'
    return
  }
  const warnings: string[] = [...result.warnings]
  if (result.uiTheme || result.backgroundImage) {
    warnings.push(...theme.applyPluginUiImport(result))
  }
  if (result.editorScheme) {
    warnings.push(...scheme.applyPluginSchemeImport(result))
  }
  importInfo.value = warnings.join(' · ') || `已导入 ${result.source} 主题包`
  runContrastCheck()
}

async function importPluginJar() {
  const picked = await pickFile([
    { name: '主题插件', extensions: ['jar', 'zip'] },
  ])
  if (picked) {
    await applyPluginBytes(bytesFromContent(picked.content, picked.encoding))
    return
  }
  pluginInputRef.value?.click()
}

function onPluginFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  readFileAsBytes(file).then(applyPluginBytes)
  ;(e.target as HTMLInputElement).value = ''
}

async function exportPluginJar() {
  const ui = theme.exportCurrentTheme()
  const editor = scheme.exportCurrentScheme()
  const bytes = exportThemePlugin({
    name: ui.themeName,
    author: pluginAuthor.value.trim() || 'CinyuVerse',
    description: 'CinyuVerse 主题插件（含界面主题与编辑器配色）',
    uiTheme: ui,
    editorScheme: editor,
    backgroundImage: theme.backgroundImage
      ? { dataUrl: theme.backgroundImage, mimeType: 'image/png' }
      : undefined,
  })
  const filename = `${ui.themeName}.jar`
  const api = window.electronAPI
  if (api?.saveFile) {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
    await api.saveFile({ defaultPath: filename, content: btoa(binary), encoding: 'base64' })
    return
  }
  const url = URL.createObjectURL(bytesToDownloadBlob(bytes))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function importIdeaThemeJson() {
  importError.value = ''
  const picked = await pickFile([{ name: 'IDEA UI 主题', extensions: ['json', 'theme.json'] }])
  if (picked) {
    try {
      const ok = theme.importIdeaThemeJson(JSON.parse(picked.content))
      if (!ok) { importError.value = 'IDEA theme.json 格式无效或无可用颜色映射'; return }
      importInfo.value = '已从 IDEA theme.json 导入界面主题'
      runContrastCheck()
    } catch {
      importError.value = '无法解析 theme.json'
    }
    return
  }
  themeJsonInputRef.value?.click()
}

function onThemeJsonSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const ok = theme.importIdeaThemeJson(JSON.parse(reader.result as string))
      if (!ok) { importError.value = 'IDEA theme.json 格式无效'; return }
      importInfo.value = '已从 IDEA theme.json 导入界面主题'
      runContrastCheck()
    } catch {
      importError.value = '无法解析 theme.json'
    }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

function onBackgroundImageSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    importError.value = '请选择图片文件（PNG / JPG / WebP / GIF）'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    importError.value = '图片过大，请选择 8MB 以内的文件'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    applyBackgroundDataUrl(dataUrl, file.name)
  }
  reader.onerror = () => {
    importError.value = '读取图片失败'
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

function applyBackgroundDataUrl(dataUrl: string, filename: string) {
  theme.setBackgroundImage(dataUrl, { size: theme.backgroundSize })
  importInfo.value = `背景图已应用（${filename}）`
  importError.value = ''
}

async function openBgImagePicker() {
  importError.value = ''
  const picked = await pickFile([
    { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  ])
  if (picked) {
    if (picked.encoding === 'base64') {
      applyBackgroundDataUrl(`data:${mimeFromFilename(picked.name)};base64,${picked.content}`, picked.name)
    } else {
      importError.value = '无法读取图片文件'
    }
    return
  }
  bgImageInputRef.value?.click()
}

function onOverlayChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value) / 100
  theme.updateBackgroundOverlay(`rgba(0,0,0,${v.toFixed(2)})`)
}

async function importThemeFile() {
  importError.value = ''
  const picked = await pickFile([
    { name: '界面主题', extensions: ['cin-theme', 'json'] },
  ])
  if (picked) {
    try {
      const parsed = theme.validateCinTheme(JSON.parse(picked.content))
      if (!parsed) { importError.value = '界面主题文件格式无效'; return }
      theme.importTheme(parsed)
      runContrastCheck()
    } catch {
      importError.value = '无法解析界面主题文件'
    }
    return
  }
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  importError.value = ''
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = theme.validateCinTheme(JSON.parse(reader.result as string))
      if (!parsed) { importError.value = '界面主题文件格式无效'; return }
      theme.importTheme(parsed)
      runContrastCheck()
    } catch {
      importError.value = '无法解析界面主题文件'
    }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function importSchemeFile() {
  importError.value = ''
  const picked = await pickFile([
    { name: '编辑器配色', extensions: ['cin-scheme', 'json'] },
    { name: 'IDEA 配色', extensions: ['icls', 'xml'] },
  ])
  if (picked) {
    handleSchemeImportContent(picked.content)
    return
  }
  schemeFileInputRef.value?.click()
}

function handleSchemeImportContent(content: string) {
  importError.value = ''
  const trimmed = content.trim()
  if (trimmed.startsWith('<')) {
    const ok = scheme.importIcls(trimmed)
    if (!ok) importError.value = '无法解析 .icls 文件'
    return
  }
  try {
    const parsed = scheme.validateCinScheme(JSON.parse(trimmed))
    if (!parsed) { importError.value = '编辑器配色文件格式无效'; return }
    scheme.importScheme(parsed)
  } catch {
    importError.value = '无法解析编辑器配色文件'
  }
}

function onSchemeFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => handleSchemeImportContent(reader.result as string)
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function saveExport(content: string, filename: string) {
  const api = window.electronAPI
  if (api?.saveFile) {
    await api.saveFile({ defaultPath: filename, content })
    return
  }
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportThemeFile() {
  const data = theme.exportCurrentTheme()
  await saveExport(JSON.stringify(data, null, 2), `${data.themeName}.cin-theme`)
}

async function exportSchemeFile() {
  const data = scheme.exportCurrentScheme()
  await saveExport(JSON.stringify(data, null, 2), `${data.schemeName}.cin-scheme`)
}

function saveCustomTheme() {
  theme.saveCurrentAsCustom(saveName.value.trim() || '我的界面主题')
  saveName.value = ''
  showSaveInput.value = false
  presetTab.value = 'custom'
  runContrastCheck()
}

function saveCustomScheme() {
  scheme.saveCurrentAsCustom(schemeSaveName.value.trim() || '我的编辑器配色')
  schemeSaveName.value = ''
  showSchemeSaveInput.value = false
  schemeTab.value = 'custom'
}
</script>

<template>
  <Dialog
    :open="visible"
    title="外观与主题"
    class="!max-w-[540px]"
    @update:open="(v) => !v && emit('close')"
  >
    <!-- Tab Buttons -->
    <div class="flex gap-1.5 px-4 pb-2 border-b border-[var(--border)]">
      <button
        class="settings-tab-btn"
        :class="{ active: settingsTab === 'ui' }"
        @click="settingsTab = 'ui'"
      >
        <span>界面主题</span>
        <span class="tab-hint">侧边栏 · 按钮 · 窗口</span>
      </button>
      <button
        class="settings-tab-btn"
        :class="{ active: settingsTab === 'editor' }"
        @click="settingsTab = 'editor'"
      >
        <span>编辑器配色</span>
        <span class="tab-hint">语法高亮 · 背景</span>
      </button>
    </div>

    <div class="theme-modal-body">
      <!-- ═══ 界面主题 ═══ -->
      <template v-if="settingsTab === 'ui'">
        <div class="theme-section">
          <label class="theme-section-label">预设界面主题</label>
          <p class="section-desc">基于 Light / Dark 基底增量覆盖，未修改项自动继承默认色</p>
          <div class="preset-tabs">
            <button :class="{ active: presetTab === 'all' }" @click="presetTab = 'all'">全部</button>
            <button :class="{ active: presetTab === 'light' }" @click="presetTab = 'light'">浅色</button>
            <button :class="{ active: presetTab === 'dark' }" @click="presetTab = 'dark'">深色</button>
            <button :class="{ active: presetTab === 'custom' }" @click="presetTab = 'custom'">自定义</button>
          </div>
          <div v-if="presetTab !== 'custom'" class="preset-grid">
            <button
              v-for="p in filteredPresets"
              :key="p.id"
              class="preset-chip"
              :class="{ active: presetId === p.id && !isCustomActive }"
              @click="selectPreset(p)"
            >
              <span class="preset-swatch" :style="{ background: p.colors['--bg-card'], borderColor: p.colors['--border'] }"/>
              <span class="preset-name">{{ p.name }}</span>
            </button>
          </div>
          <div v-else class="custom-list">
            <button
              v-for="c in theme.customThemes"
              :key="c.id"
              class="preset-chip"
              :class="{ active: isCustomActive && activeCustomId === c.id }"
              @click="theme.selectCustomTheme(c.id); runContrastCheck()"
            >
              <span class="preset-swatch" :style="{ background: c.colors['--bg-card'] || '#333' }"/>
              <span class="preset-name">{{ c.name }}</span>
            </button>
            <p v-if="theme.customThemes.length === 0" class="empty-hint">暂无自定义界面主题</p>
          </div>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">UI 预览</label>
          <div
            class="preview-card"
            :style="{ background: previewColors['--bg-card'], color: previewColors['--text-main'], borderColor: previewColors['--border'] }"
          >
            <div class="preview-tag" :style="{ color: previewColors['--text-muted'] }">对话卡片</div>
            <p class="preview-title">欢迎来到 CinyuVerse</p>
            <p class="preview-body" :style="{ color: previewColors['--text-sub'] }">界面主题控制侧边栏、按钮、弹窗等全局 UI 配色。</p>
          </div>
          <p class="contrast-hint" :class="{ warn: !contrastOk }">{{ contrastMsg }}</p>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">界面调色</label>
          <div class="color-grid">
            <label v-for="key in EDITABLE_THEME_KEYS" :key="key" class="color-row">
              <span class="color-label">{{ COLOR_LABELS[key] ?? key }}</span>
              <input type="color" :value="previewColors[key] ?? '#000000'" @input="onColorInput(key, $event)" />
              <span class="color-hex">{{ previewColors[key] }}</span>
            </label>
          </div>
          <div v-if="showSaveInput" class="save-row">
            <input v-model="saveName" class="save-input" placeholder="主题名称" @keyup.enter="saveCustomTheme" />
            <button class="mini-btn" @click="saveCustomTheme">保存</button>
          </div>
          <button v-else class="link-btn" @click="showSaveInput = true">保存为自定义界面主题</button>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">强调色</label>
          <div class="accent-options">
            <button
              v-for="(label, key) in theme.accentLabels"
              :key="key"
              class="accent-btn"
              :class="{ active: theme.accentColor === key }"
              @click="selectAccent(key as AccentColor)"
            >
              <span class="accent-swatch" :style="{ background: theme.accentColors[key as AccentColor] }"/>
              <span>{{ label }}</span>
            </button>
          </div>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">界面主题文件 (.cin-theme)</label>
          <div class="file-actions">
            <button class="action-btn" @click="importThemeFile">导入 .cin-theme</button>
            <button class="action-btn" @click="importIdeaThemeJson">导入 IDEA theme.json</button>
            <button class="action-btn" @click="exportThemeFile">导出</button>
          </div>
          <input ref="fileInputRef" type="file" accept=".cin-theme,.json" class="hidden-input" @change="onFileSelected" />
          <input ref="themeJsonInputRef" type="file" accept=".json,.theme.json" class="hidden-input" @change="onThemeJsonSelected" />
        </div>

        <div class="theme-section">
          <label class="theme-section-label">页面背景图</label>
          <p class="section-desc">导入图片作为全局背景（可配合遮罩保证文字可读）</p>
          <div class="file-actions">
            <button type="button" class="action-btn" @click="openBgImagePicker">选择图片</button>
            <button v-if="theme.backgroundImage" type="button" class="action-btn" @click="theme.clearBackgroundImage(); importInfo = '已清除背景图'">清除背景</button>
          </div>
          <p v-if="theme.backgroundImage" class="empty-hint">背景图已加载，关闭设置后即可预览</p>
          <div
            v-if="theme.backgroundImage"
            class="bg-preview"
            :style="{ backgroundImage: `url('${theme.backgroundImage}')` }"
          />
          <label class="color-row" style="margin-top:8px">
            <span class="color-label">遮罩透明度</span>
            <input
              type="range"
              min="0"
              max="80"
              :value="Math.round(parseFloat(String(theme.backgroundOverlay).match(/[\d.]+$/)?.[0] ?? '0.18') * 100)"
              @input="onOverlayChange"
            />
          </label>
          <input ref="bgImageInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden-input" @change="onBackgroundImageSelected" />
        </div>

        <div class="theme-section">
          <label class="toggle-row">
            <span>跟随系统明暗</span>
            <Switch
              :checked="theme.followSystem"
              @update:checked="(v: boolean) => v ? theme.enableSystemFollow() : theme.disableSystemFollow()"
            />
          </label>
        </div>
      </template>

      <!-- ═══ 编辑器配色 ═══ -->
      <template v-else>
        <div class="theme-section">
          <label class="theme-section-label">预设编辑器配色</label>
          <p class="section-desc">独立于界面主题，控制正文区语法高亮与编辑器背景（对标 IDEA Color Scheme）</p>
          <div class="preset-tabs">
            <button :class="{ active: schemeTab === 'all' }" @click="schemeTab = 'all'">全部</button>
            <button :class="{ active: schemeTab === 'light' }" @click="schemeTab = 'light'">浅色</button>
            <button :class="{ active: schemeTab === 'dark' }" @click="schemeTab = 'dark'">深色</button>
            <button :class="{ active: schemeTab === 'custom' }" @click="schemeTab = 'custom'">自定义</button>
          </div>
          <div v-if="schemeTab !== 'custom'" class="preset-grid">
            <button
              v-for="s in filteredSchemes"
              :key="s.id"
              class="preset-chip"
              :class="{ active: schemePresetId === s.id && !schemeCustomActive }"
              @click="scheme.setPreset(s.id)"
            >
              <span class="preset-swatch" :style="{ background: s.colors.background, borderColor: s.colors.lineNumber }"/>
              <span class="preset-name">{{ s.name }}</span>
            </button>
          </div>
          <div v-else class="custom-list">
            <button
              v-for="c in scheme.customSchemes"
              :key="c.id"
              class="preset-chip"
              :class="{ active: schemeCustomActive && schemeCustomId === c.id }"
              @click="scheme.selectCustomScheme(c.id)"
            >
              <span class="preset-swatch" :style="{ background: c.colors.background || '#333' }"/>
              <span class="preset-name">{{ c.name }}</span>
            </button>
            <p v-if="scheme.customSchemes.length === 0" class="empty-hint">暂无自定义编辑器配色</p>
          </div>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">编辑器预览</label>
          <div class="editor-preview" :style="{ background: previewScheme.background, color: previewScheme.text }">
            <p><span :style="{ color: previewScheme.heading, fontWeight: 'bold' }"># 第一章</span></p>
            <p>这是正文文字，<span :style="{ color: previewScheme.bold, fontWeight: 'bold' }">加粗</span>与<span :style="{ color: previewScheme.italic, fontStyle: 'italic' }">斜体</span>。</p>
            <p :style="{ color: previewScheme.quote, fontStyle: 'italic' }">&gt; 引用段落示例</p>
            <p><span :style="{ color: previewScheme.code }">`行内代码`</span> · <span :style="{ color: previewScheme.link, textDecoration: 'underline' }">链接</span></p>
            <p :style="{ color: previewScheme.comment }">&lt;!-- 注释 --&gt;</p>
          </div>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">编辑器调色</label>
          <div class="color-grid">
            <label v-for="key in EDITABLE_SCHEME_KEYS" :key="key" class="color-row">
              <span class="color-label">{{ SCHEME_LABELS[key] }}</span>
              <input type="color" :value="previewScheme[key]" @input="onSchemeColorInput(key, $event)" />
              <span class="color-hex">{{ previewScheme[key] }}</span>
            </label>
          </div>
          <div v-if="showSchemeSaveInput" class="save-row">
            <input v-model="schemeSaveName" class="save-input" placeholder="配色名称" @keyup.enter="saveCustomScheme" />
            <button class="mini-btn" @click="saveCustomScheme">保存</button>
          </div>
          <button v-else class="link-btn" @click="showSchemeSaveInput = true">保存为自定义编辑器配色</button>
        </div>

        <div class="theme-section">
          <label class="theme-section-label">编辑器配色文件</label>
          <div class="file-actions">
            <button class="action-btn" @click="importSchemeFile">导入 .cin-scheme / .icls</button>
            <button class="action-btn" @click="exportSchemeFile">导出 .cin-scheme</button>
          </div>
          <input ref="schemeFileInputRef" type="file" accept=".cin-scheme,.icls,.json,.xml" class="hidden-input" @change="onSchemeFileSelected" />
        </div>
      </template>

      <Alert v-if="importError" variant="destructive" class="mx-4 mb-2">{{ importError }}</Alert>
      <Alert v-if="importInfo && !importError" variant="success" class="mx-4 mb-2">{{ importInfo }}</Alert>

      <!-- 主题插件包 -->
      <div class="theme-section plugin-section">
        <label class="theme-section-label">主题插件包 (.jar)</label>
        <p class="section-desc">打包/导入完整主题：界面 .cin-theme + IDEA theme.json + 编辑器 .icls/.cin-scheme + 背景图</p>
        <input v-model="pluginAuthor" class="save-input" placeholder="作者名（导出时使用）" style="margin-bottom:8px" />
        <div class="file-actions">
          <button class="action-btn" @click="importPluginJar">导入 .jar / .zip</button>
          <button class="action-btn" @click="exportPluginJar">导出主题插件</button>
        </div>
        <input ref="pluginInputRef" type="file" accept=".jar,.zip" class="hidden-input" @change="onPluginFileSelected" />
      </div>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          class="text-[var(--text-sub)] hover:text-[var(--text-main)]"
          @click="settingsTab === 'ui' ? (theme.resetTheme(), runContrastCheck()) : scheme.resetScheme()"
        >
          恢复默认
        </Button>
        <Button variant="default" size="sm" class="bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]" @click="emit('close')">
          完成
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.settings-tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-sub);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.settings-tab-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--text-main);
}

.tab-hint {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-muted);
}

.theme-modal-body {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.theme-section {
  padding: 10px 18px;
}

.theme-section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-sub);
  margin-bottom: 4px;
}

.section-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0 0 8px;
  line-height: 1.5;
}

.preset-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.preset-tabs button {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}
.preset-tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-light);
}

.preset-grid,
.custom-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  max-width: 100%;
}
.preset-chip.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--text-main);
}

.preset-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid;
  flex-shrink: 0;
}

.preset-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.bg-preview {
  margin-top: 8px;
  height: 72px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background-size: cover;
  background-position: center;
}

.preview-card,
.editor-preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.editor-preview {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.7;
}

.editor-preview p { margin: 0 0 6px; }

.preview-tag {
  font-size: 11px;
  margin-bottom: 6px;
}

.preview-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 6px;
}

.preview-body {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

.contrast-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 8px 0 0;
}
.contrast-hint.warn { color: var(--danger); }

.color-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.color-label { flex: 1; min-width: 0; }

.color-row input[type="color"] {
  width: 32px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.color-hex {
  font-size: 10px;
  color: var(--text-muted);
  font-family: monospace;
}

.save-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.save-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-main);
  font-size: 12px;
}

.mini-btn, .link-btn, .action-btn {
  font-size: 12px;
  cursor: pointer;
}

.link-btn {
  margin-top: 8px;
  border: none;
  background: none;
  color: var(--accent);
  padding: 0;
}

.mini-btn, .action-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
}
.mini-btn:hover, .action-btn:hover {
  border-color: var(--accent);
  color: var(--text-main);
}

.file-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hidden-input { display: none; }

.plugin-section {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 14px;
}

.accent-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.accent-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.accent-btn:hover { background: var(--bg-hover); }
.accent-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--text-main);
}

.accent-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
</style>
