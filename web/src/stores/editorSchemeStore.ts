import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Extension } from '@codemirror/state'
import {
  BUILTIN_EDITOR_SCHEMES,
  DEFAULT_SCHEME_ID,
  EDITABLE_SCHEME_KEYS,
  getSchemeById,
  mergeSchemeColors,
  toCinSchemeFile,
  validateCinScheme,
  type CinSchemeFile,
  type EditorSchemeColors,
  type SchemeCategory,
} from '@/config/editorSchemes'
import { buildEditorSchemeExtensions } from '@/utils/editorSchemeCm'
import { iclsToFullColors, parseIcls } from '@/utils/iclsParser'
import type { ThemePluginImportResult } from '@/utils/themePluginPack'

const SCHEME_PRESET_KEY = 'cinyuverse-editor-scheme'
const CUSTOM_SCHEMES_KEY = 'cinyuverse-editor-custom-schemes'
const ACTIVE_CUSTOM_SCHEME_KEY = 'cinyuverse-editor-active-custom'

export interface SavedCustomScheme {
  id: string
  name: string
  baseMode: SchemeCategory
  colors: Partial<EditorSchemeColors>
}

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function generateId(): string {
  return `scheme-${Date.now().toString(36)}`
}

export const useEditorSchemeStore = defineStore('editorScheme', () => {
  const presetId = ref(loadSaved<string>(SCHEME_PRESET_KEY, DEFAULT_SCHEME_ID))
  const customSchemes = ref<SavedCustomScheme[]>(loadSaved<SavedCustomScheme[]>(CUSTOM_SCHEMES_KEY, []))
  const activeCustomId = ref<string | null>(loadSaved<string | null>(ACTIVE_CUSTOM_SCHEME_KEY, null))
  const editorOverrides = ref<Partial<EditorSchemeColors>>({})
  const revision = ref(0)

  function validateState() {
    if (presetId.value === 'custom') {
      const ok = activeCustomId.value && customSchemes.value.some((s) => s.id === activeCustomId.value)
      if (!ok) {
        presetId.value = DEFAULT_SCHEME_ID
        activeCustomId.value = null
      }
    } else if (!getSchemeById(presetId.value)) {
      presetId.value = DEFAULT_SCHEME_ID
    }
  }
  validateState()

  const isCustomActive = computed(() => presetId.value === 'custom')

  const activeCategory = computed<SchemeCategory>(() => {
    if (isCustomActive.value && activeCustomId.value) {
      return customSchemes.value.find((s) => s.id === activeCustomId.value)?.baseMode ?? 'dark'
    }
    return getSchemeById(presetId.value)?.category ?? 'dark'
  })

  const activeColors = computed<EditorSchemeColors>(() => {
    let partial: Partial<EditorSchemeColors> = {}
    if (isCustomActive.value && activeCustomId.value) {
      const custom = customSchemes.value.find((s) => s.id === activeCustomId.value)
      if (custom) partial = { ...custom.colors }
    } else {
      const preset = getSchemeById(presetId.value) ?? getSchemeById(DEFAULT_SCHEME_ID)!
      partial = { ...preset.colors }
    }
    return mergeSchemeColors(activeCategory.value, { ...partial, ...editorOverrides.value })
  })

  const activeSchemeLabel = computed(() => {
    if (isCustomActive.value && activeCustomId.value) {
      return customSchemes.value.find((s) => s.id === activeCustomId.value)?.name ?? '自定义配色'
    }
    return getSchemeById(presetId.value)?.name ?? '默认配色'
  })

  const activeSchemeValue = computed(() => {
    if (isCustomActive.value && activeCustomId.value) return `custom:${activeCustomId.value}`
    return presetId.value
  })

  const lightSchemes = computed(() => BUILTIN_EDITOR_SCHEMES.filter((s) => s.category === 'light'))
  const darkSchemes = computed(() => BUILTIN_EDITOR_SCHEMES.filter((s) => s.category === 'dark'))

  function bump() {
    revision.value += 1
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinyuverse:editor-scheme-changed'))
    }
  }

  watch(
    () => [presetId.value, activeCustomId.value, editorOverrides.value, customSchemes.value] as const,
    () => bump(),
    { deep: true, immediate: true },
  )

  function persistPreset(id: string) {
    localStorage.setItem(SCHEME_PRESET_KEY, JSON.stringify(id))
  }

  function setPreset(id: string) {
    if (!getSchemeById(id)) return
    presetId.value = id
    activeCustomId.value = null
    editorOverrides.value = {}
    localStorage.removeItem(ACTIVE_CUSTOM_SCHEME_KEY)
    persistPreset(id)
    bump()
  }

  function selectCustomScheme(id: string) {
    const found = customSchemes.value.find((s) => s.id === id)
    if (!found) return
    presetId.value = 'custom'
    activeCustomId.value = id
    editorOverrides.value = {}
    persistPreset('custom')
    localStorage.setItem(ACTIVE_CUSTOM_SCHEME_KEY, JSON.stringify(id))
    bump()
  }

  function selectScheme(value: string) {
    if (value.startsWith('custom:')) selectCustomScheme(value.slice(7))
    else setPreset(value)
  }

  function updateOverride(key: keyof EditorSchemeColors, value: string) {
    editorOverrides.value = { ...editorOverrides.value, [key]: value }
    bump()
  }

  function saveCurrentAsCustom(name: string) {
    const baseMode = activeCategory.value
    const base = mergeSchemeColors(baseMode, {})
    const colors: Partial<EditorSchemeColors> = {}
    const current = activeColors.value
    for (const key of EDITABLE_SCHEME_KEYS) {
      if (current[key] !== base[key]) colors[key] = current[key]
    }
    const entry: SavedCustomScheme = {
      id: generateId(),
      name,
      baseMode,
      colors,
    }
    customSchemes.value = [...customSchemes.value, entry]
    localStorage.setItem(CUSTOM_SCHEMES_KEY, JSON.stringify(customSchemes.value))
    selectCustomScheme(entry.id)
    return entry
  }

  function importScheme(file: CinSchemeFile) {
    const entry: SavedCustomScheme = {
      id: generateId(),
      name: file.schemeName,
      baseMode: file.baseMode,
      colors: { ...file.colors },
    }
    customSchemes.value = [...customSchemes.value, entry]
    localStorage.setItem(CUSTOM_SCHEMES_KEY, JSON.stringify(customSchemes.value))
    selectCustomScheme(entry.id)
    return entry
  }

  function importIcls(xml: string) {
    const parsed = parseIcls(xml)
    if (!parsed) return null
    const full = iclsToFullColors(parsed)
    const file: CinSchemeFile = toCinSchemeFile(parsed.schemeName, parsed.baseMode, full)
    return importScheme(file)
  }

  function exportCurrentScheme(): CinSchemeFile {
    const name = isCustomActive.value
      ? customSchemes.value.find((s) => s.id === activeCustomId.value)?.name ?? '我的配色'
      : getSchemeById(presetId.value)?.name ?? '配色'
    return toCinSchemeFile(name, activeCategory.value, activeColors.value)
  }

  function resetScheme() {
    presetId.value = DEFAULT_SCHEME_ID
    activeCustomId.value = null
    editorOverrides.value = {}
    persistPreset(DEFAULT_SCHEME_ID)
    localStorage.removeItem(ACTIVE_CUSTOM_SCHEME_KEY)
    bump()
  }

  function getCodeMirrorExtensions(): Extension[] {
    return buildEditorSchemeExtensions(activeColors.value)
  }

  function applyPluginSchemeImport(result: ThemePluginImportResult) {
    if (result.editorScheme) importScheme(result.editorScheme)
    return result.warnings
  }

  return {
    presetId,
    customSchemes,
    activeCustomId,
    editorOverrides,
    revision,
    isCustomActive,
    activeCategory,
    activeColors,
    activeSchemeLabel,
    activeSchemeValue,
    lightSchemes,
    darkSchemes,
    builtinSchemes: BUILTIN_EDITOR_SCHEMES,
    setPreset,
    selectCustomScheme,
    selectScheme,
    updateOverride,
    saveCurrentAsCustom,
    importScheme,
    importIcls,
    exportCurrentScheme,
    validateCinScheme,
    resetScheme,
    getCodeMirrorExtensions,
    applyPluginSchemeImport,
  }
})
