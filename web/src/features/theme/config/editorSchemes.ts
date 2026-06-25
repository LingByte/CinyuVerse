export type SchemeCategory = 'light' | 'dark'

export interface EditorSchemeColors {
  background: string
  text: string
  heading: string
  bold: string
  italic: string
  link: string
  quote: string
  code: string
  comment: string
  cursor: string
  selection: string
  activeLine: string
  lineNumber: string
}

export interface EditorSchemePreset {
  id: string
  name: string
  category: SchemeCategory
  colors: EditorSchemeColors
}

export interface CinSchemeFile {
  schemeName: string
  baseMode: SchemeCategory
  /** 相对基底的增量覆盖，对标 IDEA .icls 只存改动项 */
  colors: Partial<EditorSchemeColors>
}

export const EDITABLE_SCHEME_KEYS = [
  'background',
  'text',
  'heading',
  'bold',
  'italic',
  'link',
  'quote',
  'code',
  'comment',
  'cursor',
  'selection',
  'activeLine',
  'lineNumber',
] as const

export type EditableSchemeKey = typeof EDITABLE_SCHEME_KEYS[number]

export const SCHEME_LABELS: Record<EditableSchemeKey, string> = {
  background: '编辑器背景',
  text: '正文',
  heading: '标题',
  bold: '加粗 / 关键字',
  italic: '斜体 / 元信息',
  link: '链接',
  quote: '引用 / 字符串',
  code: '行内代码',
  comment: '注释',
  cursor: '光标',
  selection: '选区',
  activeLine: '当前行',
  lineNumber: '行号',
}

const BASE_LIGHT: EditorSchemeColors = {
  background: '#FFFFFF',
  text: '#1A1A1A',
  heading: '#0033B3',
  bold: '#0033B3',
  italic: '#871094',
  link: '#00627A',
  quote: '#067D17',
  code: '#1750EB',
  comment: '#8C8C8C',
  cursor: '#000000',
  selection: '#A6D2FF',
  activeLine: '#F5F5F5',
  lineNumber: '#999999',
}

const BASE_DARK: EditorSchemeColors = {
  background: '#2B2D30',
  text: '#A9B7C6',
  heading: '#FFC66D',
  bold: '#CC7832',
  italic: '#808080',
  link: '#6897BB',
  quote: '#6A8759',
  code: '#6897BB',
  comment: '#808080',
  cursor: '#BBBBBB',
  selection: '#214283',
  activeLine: '#323232',
  lineNumber: '#606366',
}

export function getSchemeBase(category: SchemeCategory): EditorSchemeColors {
  return category === 'light' ? { ...BASE_LIGHT } : { ...BASE_DARK }
}

export function mergeSchemeColors(
  category: SchemeCategory,
  partial: Partial<EditorSchemeColors>,
): EditorSchemeColors {
  return { ...getSchemeBase(category), ...partial }
}

const presetDefs: { id: string; name: string; category: SchemeCategory; overrides: Partial<EditorSchemeColors> }[] = [
  { id: 'darcula', name: 'Darcula（IDEA 默认深色）', category: 'dark', overrides: {} },
  {
    id: 'idea-dark',
    name: 'IDEA 深空',
    category: 'dark',
    overrides: {
      background: '#2B2D30',
      text: '#BBBBBB',
      heading: '#FFC66D',
      selection: '#214283',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub 深色',
    category: 'dark',
    overrides: {
      background: '#0D1117',
      text: '#C9D1D9',
      heading: '#79C0FF',
      bold: '#FF7B72',
      quote: '#A5D6FF',
      comment: '#8B949E',
      selection: '#264F78',
      activeLine: '#161B22',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    category: 'dark',
    overrides: {
      background: '#272822',
      text: '#F8F8F2',
      heading: '#F92672',
      bold: '#F92672',
      quote: '#E6DB74',
      code: '#AE81FF',
      comment: '#75715E',
      selection: '#49483E',
      activeLine: '#3E3D32',
    },
  },
  {
    id: 'intellij-light',
    name: 'IntelliJ Light',
    category: 'light',
    overrides: {},
  },
  {
    id: 'github-light',
    name: 'GitHub 浅色',
    category: 'light',
    overrides: {
      background: '#FFFFFF',
      text: '#24292F',
      heading: '#0550AE',
      bold: '#CF222E',
      quote: '#0A3069',
      comment: '#6E7781',
      selection: '#B6E3FF',
      activeLine: '#F6F8FA',
    },
  },
  {
    id: 'hc-light',
    name: '高对比浅色',
    category: 'light',
    overrides: {
      background: '#FFFFFF',
      text: '#000000',
      heading: '#0000EE',
      bold: '#000000',
      comment: '#666666',
      selection: '#FFFF00',
      activeLine: '#EEEEEE',
    },
  },
  {
    id: 'hc-dark',
    name: '高对比深色',
    category: 'dark',
    overrides: {
      background: '#000000',
      text: '#FFFFFF',
      heading: '#FFFF00',
      bold: '#FFFFFF',
      comment: '#AAAAAA',
      selection: '#004400',
      activeLine: '#1A1A1A',
    },
  },
]

export const BUILTIN_EDITOR_SCHEMES: EditorSchemePreset[] = presetDefs.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  colors: mergeSchemeColors(p.category, p.overrides),
}))

export const SCHEME_MAP = Object.fromEntries(
  BUILTIN_EDITOR_SCHEMES.map((s) => [s.id, s]),
) as Record<string, EditorSchemePreset>

export const DEFAULT_SCHEME_ID = 'darcula'

export function getSchemeById(id: string): EditorSchemePreset | undefined {
  return SCHEME_MAP[id]
}

export function validateCinScheme(data: unknown): CinSchemeFile | null {
  if (!data || typeof data !== 'object') return null
  const d = data as CinSchemeFile
  const baseMode = d.baseMode ?? (d as { mode?: SchemeCategory }).mode
  if (!d.schemeName || typeof d.schemeName !== 'string') return null
  if (baseMode !== 'light' && baseMode !== 'dark') return null
  if (!d.colors || typeof d.colors !== 'object') return null

  const colors: Partial<EditorSchemeColors> = {}
  for (const [k, v] of Object.entries(d.colors)) {
    if (
      (EDITABLE_SCHEME_KEYS as readonly string[]).includes(k)
      && typeof v === 'string'
      && /^#[0-9A-Fa-f]{3,8}$/.test(v.trim())
    ) {
      colors[k as EditableSchemeKey] = v.trim()
    }
  }
  if (Object.keys(colors).length === 0) return null
  return { schemeName: d.schemeName, baseMode, colors }
}

export function toCinSchemeFile(
  name: string,
  baseMode: SchemeCategory,
  full: EditorSchemeColors,
): CinSchemeFile {
  const base = getSchemeBase(baseMode)
  const colors: Partial<EditorSchemeColors> = {}
  for (const key of EDITABLE_SCHEME_KEYS) {
    if (full[key] !== base[key]) colors[key] = full[key]
  }
  return { schemeName: name, baseMode, colors }
}
