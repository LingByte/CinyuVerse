import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  BUILTIN_PRESETS,
  DEFAULT_PRESET_ID,
  ALL_THEME_VAR_KEYS,
  EDITABLE_THEME_KEYS,
  buildCustomColors,
  getPresetById,
  toCinThemeFile,
  validateCinTheme,
  type CinThemeFile,
  type ThemeCategory,
} from '@/features/theme/config/themePresets'
import { isReadableText } from '@/features/theme/utils/themeContrast'
import { parseIdeaThemeJson, ideaThemeToCinTheme } from '@/features/theme/utils/ideaThemeJsonParser'
import type { ThemePluginImportResult } from '@/features/theme/utils/themePluginPack'
import { useEditorSchemeStore } from '@/features/editor/stores/editorSchemeStore'

export type AccentColor = 'green' | 'blue' | 'violet' | 'orange' | 'graphite'

const PRESET_KEY = 'cinyuverse-preset'
const LEGACY_THEME_KEY = 'cinyuverse-theme'
const ACCENT_KEY = 'cinyuverse-accent'
const CUSTOM_THEMES_KEY = 'cinyuverse-custom-themes'
const ACTIVE_CUSTOM_KEY = 'cinyuverse-active-custom'
const BG_IMAGE_KEY = 'cinyuverse-bg-image'
const BG_SIZE_KEY = 'cinyuverse-bg-size'
const BG_OVERLAY_KEY = 'cinyuverse-bg-overlay'
const PANEL_GLASS_ALPHA_KEY = 'cinyuverse-panel-glass-alpha'
const PANEL_GLASS_BLUR_KEY = 'cinyuverse-panel-glass-blur'

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    const raw = localStorage.getItem(key)
    if (raw && (raw.startsWith('"') || raw.startsWith('[') || raw.startsWith('{'))) {
      return fallback
    }
    return raw as unknown as T
  }
}

function migrateStorage() {
  const rawPreset = localStorage.getItem(PRESET_KEY)
  if (rawPreset) {
    try {
      const parsed = JSON.parse(rawPreset) as string
      if (parsed === 'dark') {
        localStorage.setItem(PRESET_KEY, JSON.stringify('charcoal'))
      }
    } catch {
      if (rawPreset === 'dark') {
        localStorage.setItem(PRESET_KEY, JSON.stringify('charcoal'))
      }
    }
  }
  if (localStorage.getItem(PRESET_KEY)) return
  const legacy = loadSaved<string | null>(LEGACY_THEME_KEY, null)
  const legacyId = legacy === 'dark' ? 'charcoal' : legacy
  if (legacyId && getPresetById(legacyId)) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(legacyId))
  }
}

const accentLabels: Record<AccentColor, string> = {
  green: '森林绿',
  blue: '天空蓝',
  violet: '紫罗兰',
  orange: '暖橙色',
  graphite: '石墨青',
}

const accentColors: Record<AccentColor, string> = {
  green: '#28A745',
  blue: '#3B82F6',
  violet: '#8B5CF6',
  orange: '#F97316',
  graphite: '#64748B',
}

const accentHoverColors: Record<AccentColor, string> = {
  green: '#2EA043',
  blue: '#2563EB',
  violet: '#7C3AED',
  orange: '#EA580C',
  graphite: '#475569',
}

export interface SavedCustomTheme {
  id: string
  name: string
  mode: ThemeCategory
  colors: Record<string, string>
  backgroundImage?: string
  backgroundSize?: 'cover' | 'contain' | 'auto'
  backgroundOverlay?: string
  panelGlassAlpha?: number
  panelGlassBlur?: number
}

function generateId(): string {
  return `custom-${Date.now().toString(36)}`
}

export const useThemeStore = defineStore('theme', () => {
  migrateStorage()

  const presetId = ref(loadSaved<string>(PRESET_KEY, DEFAULT_PRESET_ID))
  const accentColor = ref<AccentColor>(loadSaved<AccentColor>(ACCENT_KEY, 'green'))
  const followSystem = ref(false)
  const customThemes = ref<SavedCustomTheme[]>(loadSaved<SavedCustomTheme[]>(CUSTOM_THEMES_KEY, []))
  const activeCustomId = ref<string | null>(loadSaved<string | null>(ACTIVE_CUSTOM_KEY, null))
  const editorColors = ref<Record<string, string>>({})
  const backgroundImage = ref<string | null>(loadSaved<string | null>(BG_IMAGE_KEY, null))
  const backgroundSize = ref<'cover' | 'contain' | 'auto'>(loadSaved(BG_SIZE_KEY, 'cover'))
  const backgroundOverlay = ref<string>(loadSaved(BG_OVERLAY_KEY, 'rgba(0,0,0,0.18)'))
  const panelGlassAlpha = ref<number>(loadSaved(PANEL_GLASS_ALPHA_KEY, 0.72))
  const panelGlassBlur = ref<number>(loadSaved(PANEL_GLASS_BLUR_KEY, 12))

  function validateState() {
    if (presetId.value === 'dark') {
      presetId.value = 'charcoal'
      localStorage.setItem(PRESET_KEY, JSON.stringify('charcoal'))
    }
    if (presetId.value === 'custom') {
      const ok = activeCustomId.value
        && customThemes.value.some((t) => t.id === activeCustomId.value)
      if (!ok) {
        presetId.value = DEFAULT_PRESET_ID
        activeCustomId.value = null
      }
    } else if (!getPresetById(presetId.value)) {
      presetId.value = DEFAULT_PRESET_ID
    }
  }
  validateState()

  const isCustomActive = computed(() => presetId.value === 'custom')

  const activeCategory = computed<ThemeCategory>(() => {
    if (isCustomActive.value) {
      const custom = customThemes.value.find((t) => t.id === activeCustomId.value)
      return custom?.mode ?? 'dark'
    }
    return getPresetById(presetId.value)?.category ?? 'dark'
  })

  const activeColors = computed(() => {
    if (isCustomActive.value && activeCustomId.value) {
      const custom = customThemes.value.find((t) => t.id === activeCustomId.value)
      if (custom) {
        return buildCustomColors(custom.mode, { ...custom.colors, ...editorColors.value })
      }
    }
    const preset = getPresetById(presetId.value) ?? getPresetById(DEFAULT_PRESET_ID)!
    return { ...preset.colors, ...editorColors.value }
  })

  const builtinPresets = BUILTIN_PRESETS
  const lightPresets = computed(() => BUILTIN_PRESETS.filter((p) => p.category === 'light'))
  const darkPresets = computed(() => BUILTIN_PRESETS.filter((p) => p.category === 'dark'))

  function syncBackgroundFromCustom() {
    if (isCustomActive.value && activeCustomId.value) {
      const custom = customThemes.value.find((t) => t.id === activeCustomId.value)
      if (custom?.backgroundImage) {
        backgroundImage.value = custom.backgroundImage
        backgroundSize.value = custom.backgroundSize ?? 'cover'
        backgroundOverlay.value = custom.backgroundOverlay ?? 'rgba(0,0,0,0.18)'
      }
    }
  }

  function persistBackground(): boolean {
    try {
      if (backgroundImage.value) {
        localStorage.setItem(BG_IMAGE_KEY, JSON.stringify(backgroundImage.value))
        localStorage.setItem(BG_SIZE_KEY, JSON.stringify(backgroundSize.value))
        localStorage.setItem(BG_OVERLAY_KEY, JSON.stringify(backgroundOverlay.value))
        localStorage.setItem(PANEL_GLASS_ALPHA_KEY, JSON.stringify(panelGlassAlpha.value))
        localStorage.setItem(PANEL_GLASS_BLUR_KEY, JSON.stringify(panelGlassBlur.value))
      } else {
        localStorage.removeItem(BG_IMAGE_KEY)
        localStorage.removeItem(BG_SIZE_KEY)
        localStorage.removeItem(BG_OVERLAY_KEY)
      }
      return true
    } catch {
      return false
    }
  }

  function applyWallpaperPanelVars() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (!backgroundImage.value) {
      root.style.removeProperty('--wp-panel-alpha')
      root.style.removeProperty('--wp-panel-blur')
      return
    }
    root.style.setProperty('--wp-panel-alpha', String(panelGlassAlpha.value))
    root.style.setProperty('--wp-panel-blur', `${panelGlassBlur.value}px`)
  }

  function applyBackgroundToDOM() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.toggleAttribute('data-has-bg-image', !!backgroundImage.value)
    applyWallpaperPanelVars()
  }

  /** 切换界面主题时，编辑器配色跟随明暗（非自定义配色时） */
  function syncEditorSchemeToUi() {
    const scheme = useEditorSchemeStore()
    if (scheme.isCustomActive) return
    const cat = activeCategory.value
    if (scheme.activeCategory === cat) return
    scheme.setPreset(cat === 'light' ? 'intellij-light' : 'darcula')
  }

  function applyAccentOverrides(colors: Record<string, string>): Record<string, string> {
    const accent = accentColors[accentColor.value]
    const accentHover = accentHoverColors[accentColor.value]
    const isDark = activeCategory.value === 'dark'
    const merged = { ...colors }
    const hexToRgba = (hex: string, a: number) => {
      const h = hex.replace('#', '')
      if (h.length !== 6) return hex
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
    merged['--accent'] = accent
    merged['--accent-hover'] = accentHover
    merged['--accent-light'] = hexToRgba(accent, isDark ? 0.15 : 0.12)
    merged['--btn-primary-bg'] = isDark ? accentHover : accent
    merged['--btn-primary-hover'] = isDark ? accent : accentHover
    merged['--btn-icon-hover-bg'] = hexToRgba(accent, 0.15)
    merged['--btn-icon-hover-color'] = isDark ? accent : accentHover
    merged['--chat-insert-bg'] = merged['--btn-primary-bg']
    merged['--chat-insert-hover'] = merged['--btn-primary-hover']
    return merged
  }

  function applyColorsToDOM(colors: Record<string, string>) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    for (const key of ALL_THEME_VAR_KEYS) {
      const value = colors[key]
      if (value != null && value !== '') {
        root.style.setProperty(key, value)
      }
    }
    // 同步 chat 别名变量
    root.style.setProperty('--chat-text-primary', colors['--text-main'] ?? '')
    root.style.setProperty('--chat-text-secondary', colors['--text-sub'] ?? '')
    root.style.setProperty('--chat-text-hint', colors['--text-muted'] ?? '')
    root.style.setProperty('--chat-card-bg', colors['--bg-card'] ?? '')
    root.style.setProperty('--chat-hover-bg', colors['--bg-hover'] ?? '')
    root.style.setProperty('--chat-bubble-fill', colors['--bg-card'] ?? '')
    root.style.setProperty('--chat-tip-fill', colors['--bg-hover'] ?? '')
    // 编辑器正文区跟随界面主题
    root.style.setProperty('--editor-bg', colors['--bg-primary'] ?? '')
    root.style.setProperty('--editor-fg', colors['--text-main'] ?? '')
    root.style.setProperty('--editor-placeholder', colors['--text-muted'] ?? '')
    root.style.setProperty('--editor-active-line', colors['--bg-hover'] ?? '')
    root.style.setProperty('--editor-selection', colors['--accent-light'] ?? '')
  }

  function syncDomAttributes() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const mode = activeCategory.value === 'light' ? 'light' : 'dark'
    root.setAttribute('data-preset', presetId.value)
    root.setAttribute('data-mode', activeCategory.value)
    root.setAttribute('data-accent', accentColor.value)
    // 兼容旧 CSS，保留 data-theme 为明暗标识
    root.setAttribute('data-theme', mode)
    root.classList.toggle('theme-light', activeCategory.value === 'light')
    root.classList.toggle('theme-dark', activeCategory.value === 'dark')
  }

  function applyTheme() {
    syncDomAttributes()
    applyColorsToDOM(applyAccentOverrides(activeColors.value))
    applyBackgroundToDOM()
  }

  watch(
    () => [
      presetId.value,
      accentColor.value,
      activeCustomId.value,
      editorColors.value,
      customThemes.value,
      backgroundImage.value,
      backgroundSize.value,
      backgroundOverlay.value,
      panelGlassAlpha.value,
      panelGlassBlur.value,
    ] as const,
    () => {
      applyTheme()
    },
    { deep: true, immediate: true },
  )

  function persistPreset(id: string) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(id))
  }

  function setPreset(id: string) {
    if (!getPresetById(id)) return
    presetId.value = id
    activeCustomId.value = null
    editorColors.value = {}
    localStorage.removeItem(ACTIVE_CUSTOM_KEY)
    persistPreset(id)
    syncEditorSchemeToUi()
    applyTheme()
  }

  function setAccentColor(c: AccentColor) {
    accentColor.value = c
    localStorage.setItem(ACCENT_KEY, JSON.stringify(c))
    applyTheme()
  }

  function selectCustomTheme(id: string) {
    const found = customThemes.value.find((t) => t.id === id)
    if (!found) return
    presetId.value = 'custom'
    activeCustomId.value = id
    editorColors.value = {}
    syncBackgroundFromCustom()
    if (backgroundImage.value) persistBackground()
    persistPreset('custom')
    localStorage.setItem(ACTIVE_CUSTOM_KEY, JSON.stringify(id))
    syncEditorSchemeToUi()
    applyTheme()
  }

  function setBackgroundImage(
    dataUrl: string | null,
    opts?: { size?: 'cover' | 'contain' | 'auto'; overlay?: string },
  ): boolean {
    backgroundImage.value = dataUrl
    if (opts?.size) backgroundSize.value = opts.size
    if (opts?.overlay) backgroundOverlay.value = opts.overlay
    const persisted = persistBackground()
    applyTheme()
    return persisted
  }

  function updateBackgroundOverlay(overlay: string) {
    backgroundOverlay.value = overlay
    persistBackground()
    applyTheme()
  }

  function updatePanelGlassAlpha(alpha: number) {
    panelGlassAlpha.value = Math.min(0.95, Math.max(0.35, alpha))
    persistBackground()
    applyTheme()
  }

  function updatePanelGlassBlur(blur: number) {
    panelGlassBlur.value = Math.min(24, Math.max(4, blur))
    persistBackground()
    applyTheme()
  }

  function clearBackgroundImage() {
    backgroundImage.value = null
    persistBackground()
    applyTheme()
  }

  function updateEditorColor(key: string, value: string) {
    editorColors.value = { ...editorColors.value, [key]: value }
    applyTheme()
  }

  function saveCurrentAsCustom(name: string) {
    const mode = activeCategory.value
    const colors: Record<string, string> = {}
    const current = activeColors.value
    for (const key of EDITABLE_THEME_KEYS) {
      if (current[key]) colors[key] = current[key]
    }
    const entry: SavedCustomTheme = {
      id: generateId(),
      name,
      mode,
      colors,
      ...(backgroundImage.value ? {
        backgroundImage: backgroundImage.value,
        backgroundSize: backgroundSize.value,
        backgroundOverlay: backgroundOverlay.value,
      } : {}),
    }
    customThemes.value = [...customThemes.value, entry]
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes.value))
    selectCustomTheme(entry.id)
    return entry
  }

  function importTheme(file: CinThemeFile) {
    const entry: SavedCustomTheme = {
      id: generateId(),
      name: file.themeName,
      mode: file.baseMode,
      colors: { ...file.colors },
      backgroundImage: file.backgroundImage,
      backgroundSize: file.backgroundSize,
      backgroundOverlay: file.backgroundOverlay,
    }
    customThemes.value = [...customThemes.value, entry]
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes.value))
    selectCustomTheme(entry.id)
    return entry
  }

  function importIdeaThemeJson(data: unknown) {
    const parsed = parseIdeaThemeJson(data)
    if (!parsed) return null
    return importTheme(ideaThemeToCinTheme(parsed))
  }

  function applyPluginUiImport(result: ThemePluginImportResult) {
    if (result.uiTheme) {
      importTheme(result.uiTheme)
    }
    if (result.backgroundImage) {
      setBackgroundImage(result.backgroundImage.dataUrl, {
        size: result.uiTheme?.backgroundSize ?? 'cover',
        overlay: result.uiTheme?.backgroundOverlay,
      })
    }
    return result.warnings
  }

  function exportCurrentTheme(): CinThemeFile {
    const name = isCustomActive.value
      ? customThemes.value.find((t) => t.id === activeCustomId.value)?.name ?? '我的主题'
      : getPresetById(presetId.value)?.name ?? '主题'
    return toCinThemeFile(name, activeCategory.value, activeColors.value, {
      backgroundImage: backgroundImage.value ?? undefined,
      backgroundSize: backgroundSize.value,
      backgroundOverlay: backgroundOverlay.value,
    })
  }

  function checkContrast(): { ok: boolean; message: string } {
    const bg = activeColors.value['--bg-card'] ?? '#ffffff'
    const text = activeColors.value['--text-main'] ?? '#000000'
    if (isReadableText(text, bg)) {
      return { ok: true, message: '文字与卡片背景对比度良好' }
    }
    return {
      ok: false,
      message: '文字与卡片背景对比度不足，请调深正文色或调浅卡片背景',
    }
  }

  function resetTheme() {
    presetId.value = DEFAULT_PRESET_ID
    activeCustomId.value = null
    editorColors.value = {}
    backgroundImage.value = null
    persistBackground()
    accentColor.value = 'green'
    followSystem.value = false
    persistPreset(DEFAULT_PRESET_ID)
    localStorage.removeItem(ACTIVE_CUSTOM_KEY)
    localStorage.setItem(ACCENT_KEY, JSON.stringify('green'))
    syncEditorSchemeToUi()
    applyTheme()
  }

  function cyclePreset() {
    const all = [...lightPresets.value, ...darkPresets.value]
    const idx = all.findIndex((p) => p.id === presetId.value)
    const next = all[(idx + 1) % all.length]
    setPreset(next.id)
  }

  const activeThemeValue = computed(() => {
    if (isCustomActive.value && activeCustomId.value) {
      return `custom:${activeCustomId.value}`
    }
    return presetId.value
  })

  const activeThemeLabel = computed(() => {
    if (isCustomActive.value && activeCustomId.value) {
      return customThemes.value.find((t) => t.id === activeCustomId.value)?.name ?? '自定义主题'
    }
    return getPresetById(presetId.value)?.name ?? '默认主题'
  })

  function selectTheme(value: string) {
    if (value.startsWith('custom:')) {
      selectCustomTheme(value.slice(7))
    } else {
      setPreset(value)
    }
  }

  let mq: MediaQueryList | null = null
  function enableSystemFollow() {
    followSystem.value = true
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      if (followSystem.value) {
        setPreset(mq!.matches ? 'charcoal' : 'light')
      }
    }
    mq.addEventListener('change', update)
    update()
  }

  function disableSystemFollow() {
    followSystem.value = false
  }

  const mode = computed(() => (activeCategory.value === 'light' ? 'light' : 'dark') as 'dark' | 'light' | 'soft')
  function setMode(m: 'dark' | 'light' | 'soft') {
    if (m === 'soft') setPreset('soft')
    else if (m === 'light') setPreset('light')
    else setPreset('charcoal')
  }

  if (presetId.value === 'custom') syncBackgroundFromCustom()
  else if (backgroundImage.value) persistBackground()
  syncEditorSchemeToUi()

  return {
    presetId,
    accentColor,
    followSystem,
    customThemes,
    activeCustomId,
    editorColors,
    backgroundImage,
    backgroundSize,
    backgroundOverlay,
    panelGlassAlpha,
    panelGlassBlur,
    isCustomActive,
    activeCategory,
    activeColors,
    builtinPresets,
    lightPresets,
    darkPresets,
    accentLabels,
    accentColors,
    mode,
    setPreset,
    setAccentColor,
    selectCustomTheme,
    updateEditorColor,
    saveCurrentAsCustom,
    importTheme,
    importIdeaThemeJson,
    applyPluginUiImport,
    exportCurrentTheme,
    setBackgroundImage,
    clearBackgroundImage,
    updateBackgroundOverlay,
    updatePanelGlassAlpha,
    updatePanelGlassBlur,
    validateCinTheme,
    checkContrast,
    resetTheme,
    cyclePreset,
    activeThemeValue,
    activeThemeLabel,
    selectTheme,
    enableSystemFollow,
    disableSystemFollow,
    setMode,
    applyTheme,
  }
})
