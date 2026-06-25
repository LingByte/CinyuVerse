export type ThemeCategory = 'light' | 'dark'

/** 可在编辑器中调整的核心变量 */
export const EDITABLE_THEME_KEYS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-card',
  '--bg-input',
  '--text-main',
  '--text-secondary',
  '--text-sub',
  '--text-muted',
  '--border',
  '--accent',
] as const

export type EditableThemeKey = typeof EDITABLE_THEME_KEYS[number]

/** 导入文件别名 → 标准 CSS 变量（对标 IDEA theme.json key 映射） */
export const UI_THEME_ALIASES: Record<string, string> = {
  '--page-bg': '--bg-primary',
  '--window-bg': '--bg-primary',
  '--panel-bg': '--bg-secondary',
  '--card-bg': '--bg-card',
  '--input-bg': '--bg-input',
  '--text-primary': '--text-main',
  '--text-secondary': '--text-secondary',
  '--text-sub': '--text-sub',
  '--text-muted': '--text-muted',
  '--border-color': '--border',
}

export function normalizeThemeColorKeys(colors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(colors)) {
    const key = UI_THEME_ALIASES[k] ?? k
    if (key.startsWith('--') && typeof v === 'string') out[key] = v.trim()
  }
  return out
}

export function resolveBaseMode(file: { baseMode?: ThemeCategory; mode?: ThemeCategory }): ThemeCategory | null {
  const m = file.baseMode ?? file.mode
  return m === 'light' || m === 'dark' ? m : null
}

export interface CinThemeFile {
  themeName: string
  /** 明暗基底（对标 IDEA dark:true/false） */
  baseMode: ThemeCategory
  /** @deprecated 兼容旧版，等同 baseMode */
  mode?: ThemeCategory
  /** 相对基底的增量覆盖，未定义项继承基底默认色 */
  colors: Record<string, string>
  /** 页面背景图（data URL 或相对路径） */
  backgroundImage?: string
  /** cover | contain | auto */
  backgroundSize?: 'cover' | 'contain' | 'auto'
  /** 背景图上的半透明遮罩，提升文字可读性 */
  backgroundOverlay?: string
}

export interface ThemePreset {
  id: string
  name: string
  category: ThemeCategory
  colors: Record<string, string>
}

interface ThemeBase {
  bgPrimary: string
  bgSecondary: string
  bgCard: string
  bgInput: string
  textMain: string
  textSecondary: string
  textSub: string
  textMuted: string
  border: string
  borderLight: string
  accent: string
  accentHover: string
  danger?: string
  dangerHover?: string
  info?: string
  scrollbarThumb?: string
  scrollbarThumbHover?: string
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildColors(category: ThemeCategory, base: ThemeBase): Record<string, string> {
  const isDark = category === 'dark'
  const accent = base.accent
  const accentHover = base.accentHover
  const danger = base.danger ?? (isDark ? '#DA3633' : '#DC2626')
  const dangerHover = base.dangerHover ?? (isDark ? '#F85149' : '#B91C1C')
  const info = base.info ?? (isDark ? '#58A6FF' : '#2563EB')
  const scrollbarThumb = base.scrollbarThumb ?? (isDark ? '#3A3E47' : '#D1D5DB')
  const scrollbarHover = base.scrollbarThumbHover ?? (isDark ? '#4A4F59' : '#9CA3AF')

  const btnPrimaryBg = isDark ? accentHover : accent
  const btnPrimaryHover = isDark ? accent : accentHover

  return {
    '--bg-primary': base.bgPrimary,
    '--bg-secondary': base.bgSecondary,
    '--bg-card': base.bgCard,
    '--bg-input': base.bgInput,
    '--bg-hover': isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    '--bg-active': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    '--text-main': base.textMain,
    '--text-secondary': base.textSecondary,
    '--text-sub': base.textSub,
    '--text-muted': base.textMuted,
    '--border': base.border,
    '--border-light': base.borderLight,
    '--accent': accent,
    '--accent-hover': accentHover,
    '--accent-light': hexToRgba(accent, isDark ? 0.15 : 0.12),
    '--danger': danger,
    '--danger-hover': dangerHover,
    '--warning': isDark ? '#D29922' : '#D97706',
    '--success': isDark ? '#3FB950' : '#16A34A',
    '--info': info,
    '--scrollbar-thumb': scrollbarThumb,
    '--scrollbar-thumb-hover': scrollbarHover,
    '--shadow': '0 0 0 transparent',
    '--btn-primary-bg': btnPrimaryBg,
    '--btn-primary-hover': btnPrimaryHover,
    '--btn-primary-text': '#FFFFFF',
    '--btn-primary-disabled-bg': isDark ? '#2D3532' : '#A3D9A5',
    '--btn-primary-disabled-text': isDark ? '#6B7280' : '#888888',
    '--btn-secondary-bg': isDark ? '#3B404A' : base.bgInput,
    '--btn-secondary-hover-bg': isDark ? '#464C58' : base.bgSecondary,
    '--btn-secondary-border': isDark ? '#4A505A' : base.border,
    '--btn-icon-hover-bg': hexToRgba(accent, 0.15),
    '--btn-icon-hover-color': isDark ? accent : accentHover,
    '--chat-mode-chat': info,
    '--chat-mode-create': isDark ? '#5cb8a8' : '#3d9e8f',
  }
}

const presetsConfig: { id: string; name: string; category: ThemeCategory; base: ThemeBase }[] = [
  // ── 浅色 ──
  {
    id: 'light',
    name: '极简纯白',
    category: 'light',
    base: {
      bgPrimary: '#FFFFFF', bgSecondary: '#F3F4F6', bgCard: '#FFFFFF', bgInput: '#FFFFFF',
      textMain: '#111827', textSecondary: '#374151', textSub: '#4B5563', textMuted: '#6B7280',
      border: '#E5E7EB', borderLight: '#F3F4F6',
      accent: '#28A745', accentHover: '#218838',
    },
  },
  {
    id: 'cream',
    name: '柔和米白护眼',
    category: 'light',
    base: {
      bgPrimary: '#F9F6EF', bgSecondary: '#F3EDE4', bgCard: '#FFFDF8', bgInput: '#FFFFFF',
      textMain: '#2C261F', textSecondary: '#4A433C', textSub: '#6B6358', textMuted: '#8A8278',
      border: '#E8DFD0', borderLight: '#F0E9DC',
      accent: '#B87340', accentHover: '#9A5F32',
    },
  },
  {
    id: 'idea-light',
    name: '淡青冷调（IDEA Light）',
    category: 'light',
    base: {
      bgPrimary: '#F3F5F7', bgSecondary: '#E8ECF0', bgCard: '#FFFFFF', bgInput: '#FFFFFF',
      textMain: '#1A1A1A', textSecondary: '#333333', textSub: '#525252', textMuted: '#737373',
      border: '#D4DDE5', borderLight: '#E8ECF0',
      accent: '#4796FF', accentHover: '#3578D4', info: '#4796FF',
    },
  },
  {
    id: 'warm-cream',
    name: '暖杏奶油',
    category: 'light',
    base: {
      bgPrimary: '#FAF6F0', bgSecondary: '#F5EFE6', bgCard: '#FFFCF7', bgInput: '#FFFFFF',
      textMain: '#3D2E28', textSecondary: '#5C4A42', textSub: '#7A6A62', textMuted: '#9A8A82',
      border: '#E8D9CC', borderLight: '#F0E6DA',
      accent: '#C87848', accentHover: '#A86238',
    },
  },
  {
    id: 'mint-light',
    name: '薄荷绿轻主题',
    category: 'light',
    base: {
      bgPrimary: '#F0F7F4', bgSecondary: '#E4F0EA', bgCard: '#F8FCFA', bgInput: '#FFFFFF',
      textMain: '#1E3A32', textSecondary: '#2D5248', textSub: '#4A6B5E', textMuted: '#6B8A7C',
      border: '#C8E0D4', borderLight: '#DCEEE4',
      accent: '#2E9B6E', accentHover: '#247A56',
    },
  },
  {
    id: 'haze-blue',
    name: '雾霾蓝轻主题',
    category: 'light',
    base: {
      bgPrimary: '#F0F4F8', bgSecondary: '#E4EBF2', bgCard: '#F8FAFC', bgInput: '#FFFFFF',
      textMain: '#1E293B', textSecondary: '#334155', textSub: '#475569', textMuted: '#64748B',
      border: '#CBD5E1', borderLight: '#E2E8F0',
      accent: '#3B82F6', accentHover: '#2563EB',
    },
  },
  {
    id: 'peach',
    name: '桃粉柔和',
    category: 'light',
    base: {
      bgPrimary: '#FFF5F5', bgSecondary: '#FFECEC', bgCard: '#FFFAFA', bgInput: '#FFFFFF',
      textMain: '#4A2C35', textSecondary: '#6B4450', textSub: '#8A6270', textMuted: '#A8828E',
      border: '#F0D4DC', borderLight: '#F8E8EC',
      accent: '#E879A8', accentHover: '#D45F92',
    },
  },
  {
    id: 'hc-light',
    name: '高对比浅色',
    category: 'light',
    base: {
      bgPrimary: '#FFFFFF', bgSecondary: '#F0F0F0', bgCard: '#FFFFFF', bgInput: '#FFFFFF',
      textMain: '#000000', textSecondary: '#1A1A1A', textSub: '#333333', textMuted: '#555555',
      border: '#000000', borderLight: '#E0E0E0',
      accent: '#0066CC', accentHover: '#004C99',
    },
  },
  {
    id: 'soft',
    name: '护眼灰',
    category: 'light',
    base: {
      bgPrimary: '#E8E9ED', bgSecondary: '#DFE1E6', bgCard: '#F7F8FA', bgInput: '#FFFFFF',
      textMain: '#374151', textSecondary: '#4B5563', textSub: '#6B7280', textMuted: '#9CA3AF',
      border: '#D1D5DB', borderLight: '#E5E7EB',
      accent: '#28A745', accentHover: '#218838',
    },
  },
  // ── 深色 ──
  {
    id: 'dark',
    name: '炭灰暗黑',
    category: 'dark',
    base: {
      bgPrimary: '#24272E', bgSecondary: '#2C2F36', bgCard: '#2C2F36', bgInput: '#363A42',
      textMain: '#E5E7EB', textSecondary: '#D1D3D9', textSub: '#B0B8C4', textMuted: '#7C8490',
      border: '#3E424B', borderLight: '#323640',
      accent: '#28A745', accentHover: '#2EA043',
    },
  },
  {
    id: 'idea-dark',
    name: '墨蓝深空（IDEA Dark）',
    category: 'dark',
    base: {
      bgPrimary: '#2B2D30', bgSecondary: '#313335', bgCard: '#3C3F41', bgInput: '#45474A',
      textMain: '#FFFFFF', textSecondary: '#BBBBBB', textSub: '#A0A0A0', textMuted: '#888888',
      border: '#4E5254', borderLight: '#3C3F41',
      accent: '#4796FF', accentHover: '#5AA8FF', info: '#4796FF',
    },
  },
  {
    id: 'midnight',
    name: '经典纯黑',
    category: 'dark',
    base: {
      bgPrimary: '#121212', bgSecondary: '#1A1A1A', bgCard: '#1E1E1E', bgInput: '#252525',
      textMain: '#F5F5F5', textSecondary: '#E0E0E0', textSub: '#B0B0B0', textMuted: '#888888',
      border: '#333333', borderLight: '#2A2A2A',
      accent: '#3FB950', accentHover: '#4FD662',
    },
  },
  {
    id: 'mocha-purple',
    name: '豆沙紫暗色',
    category: 'dark',
    base: {
      bgPrimary: '#2A2433', bgSecondary: '#322C3C', bgCard: '#3A3444', bgInput: '#423C4E',
      textMain: '#F0E8F5', textSecondary: '#D4C8DC', textSub: '#B0A4BC', textMuted: '#8A8094',
      border: '#4A4454', borderLight: '#3A3444',
      accent: '#B794F6', accentHover: '#A67EE8',
    },
  },
  {
    id: 'hc-dark',
    name: '高对比深色',
    category: 'dark',
    base: {
      bgPrimary: '#1A1A1A', bgSecondary: '#252525', bgCard: '#2D2D2D', bgInput: '#333333',
      textMain: '#FFFFFF', textSecondary: '#F0F0F0', textSub: '#E0E0E0', textMuted: '#CCCCCC',
      border: '#666666', borderLight: '#444444',
      accent: '#66B3FF', accentHover: '#88C5FF',
    },
  },
]

export const BUILTIN_PRESETS: ThemePreset[] = presetsConfig.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  colors: buildColors(p.category, p.base),
}))

export const PRESET_MAP = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p])) as Record<string, ThemePreset>

export const ALL_THEME_VAR_KEYS = Object.keys(BUILTIN_PRESETS[0].colors)

export const DEFAULT_PRESET_ID = 'dark'

export function getPresetById(id: string): ThemePreset | undefined {
  return PRESET_MAP[id]
}

export function buildCustomColors(category: ThemeCategory, partial: Record<string, string>): Record<string, string> {
  const fallback = PRESET_MAP[category === 'light' ? 'light' : 'dark']
  const merged: Record<string, string> = { ...fallback.colors, ...partial }
  // 若只改了 accent，同步 accent-hover
  if (partial['--accent'] && !partial['--accent-hover']) {
    merged['--accent-hover'] = partial['--accent']
  }
  return merged
}

export function validateCinTheme(data: unknown): CinThemeFile | null {
  if (!data || typeof data !== 'object') return null
  const d = data as CinThemeFile
  const baseMode = resolveBaseMode(d)
  if (!d.themeName || typeof d.themeName !== 'string') return null
  if (!baseMode) return null
  if (!d.colors || typeof d.colors !== 'object') return null
  const normalized = normalizeThemeColorKeys(d.colors)
  if (Object.keys(normalized).length === 0) return null
  const out: CinThemeFile = { themeName: d.themeName, baseMode, colors: normalized }
  if (typeof d.backgroundImage === 'string' && d.backgroundImage.length > 0) {
    out.backgroundImage = d.backgroundImage
  }
  if (d.backgroundSize === 'cover' || d.backgroundSize === 'contain' || d.backgroundSize === 'auto') {
    out.backgroundSize = d.backgroundSize
  }
  if (typeof d.backgroundOverlay === 'string' && d.backgroundOverlay) {
    out.backgroundOverlay = d.backgroundOverlay
  }
  return out
}

export function toCinThemeFile(
  name: string,
  baseMode: ThemeCategory,
  colors: Record<string, string>,
  extras?: Pick<CinThemeFile, 'backgroundImage' | 'backgroundSize' | 'backgroundOverlay'>,
): CinThemeFile {
  const base = PRESET_MAP[baseMode === 'light' ? 'light' : 'dark'].colors
  const out: Record<string, string> = {}
  for (const key of EDITABLE_THEME_KEYS) {
    if (colors[key] && colors[key] !== base[key]) out[key] = colors[key]
  }
  if (colors['--accent-hover'] && colors['--accent-hover'] !== base['--accent-hover']) {
    out['--accent-hover'] = colors['--accent-hover']
  }
  const file: CinThemeFile = { themeName: name, baseMode, colors: out }
  if (extras?.backgroundImage) file.backgroundImage = extras.backgroundImage
  if (extras?.backgroundSize) file.backgroundSize = extras.backgroundSize
  if (extras?.backgroundOverlay) file.backgroundOverlay = extras.backgroundOverlay
  return file
}
