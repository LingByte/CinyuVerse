import type { ThemeCategory } from '@/features/theme/config/themePresets'
import { normalizeThemeColorKeys } from '@/features/theme/config/themePresets'
import { IDEA_UI_COLOR_MAP_EXTENDED } from '@/features/theme/config/ideaThemeKeyMapExtended'

export interface IdeaThemeJson {
  name: string
  dark?: boolean
  author?: string
  parentTheme?: string
  colors?: Record<string, string>
}

/** IDEA .theme.json colors 键 → CinyuVerse CSS 变量 */
export const IDEA_UI_COLOR_MAP: Record<string, string> = {
  'window.background': '--bg-primary',
  'Panel.background': '--bg-secondary',
  'panel.background': '--bg-secondary',
  'ToolWindow.background': '--bg-secondary',
  'ToolWindow.headerBackground': '--bg-secondary',
  'ToolWindow.headerTab.background': '--bg-card',
  'Editor.background': '--bg-primary',
  'EditorPane.background': '--bg-primary',
  'EditorTabs.background': '--bg-secondary',
  'TabbedPane.background': '--bg-secondary',
  'StatusBar.background': '--bg-secondary',
  'PopupMenu.background': '--bg-card',
  'Menu.background': '--bg-card',
  'MenuBar.background': '--bg-secondary',
  'ComboBox.background': '--bg-input',
  'TextField.background': '--bg-input',
  'TextArea.background': '--bg-input',
  'List.background': '--bg-card',
  'Tree.background': '--bg-secondary',
  'Table.background': '--bg-card',
  'ScrollBar.background': '--bg-secondary',
  'ScrollBar.thumb': '--scrollbar-thumb',
  'ScrollBar.hoverThumb': '--scrollbar-thumb-hover',
  'Button.background': '--bg-input',
  'Button.default.background': '--btn-primary-bg',
  'ToolTip.background': '--bg-card',
  'Dialog.background': '--bg-card',
  'WelcomeScreen.background': '--bg-primary',
  'WelcomeScreen.sidePanelBackground': '--bg-secondary',
  'SidePanel.background': '--bg-secondary',
  'SplitPane.background': '--bg-secondary',
  'Content.background': '--bg-primary',
  'Card.background': '--bg-card',
  'control': '--bg-input',
  'text.primary': '--text-main',
  'TextField.foreground': '--text-main',
  'Label.foreground': '--text-main',
  'Tree.foreground': '--text-main',
  'Editor.foreground': '--text-main',
  'text.secondary': '--text-sub',
  'text.disabled': '--text-muted',
  'Description.foreground': '--text-sub',
  'Link.activeForeground': '--accent',
  'Link.hoverForeground': '--accent-hover',
  'Separator.separatorColor': '--border',
  'Border.color': '--border',
  'Component.borderColor': '--border',
  'Focus.borderColor': '--accent',
  'Actions.Blue': '--info',
  'Actions.Green': '--success',
  'Actions.Red': '--danger',
  'Actions.Yellow': '--warning',
  'Lookup.background': '--bg-card',
  'CompletionPopup.background': '--bg-card',
  ...IDEA_UI_COLOR_MAP_EXTENDED,
}

export interface ParsedIdeaThemeJson {
  themeName: string
  baseMode: ThemeCategory
  colors: Record<string, string>
  author?: string
  parentTheme?: string
  rawKeyCount: number
}

function parseColorValue(raw: string): string | null {
  const v = raw.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) return v
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`
  if (/^[0-9A-Fa-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`
  if (v.startsWith('rgb') || v.startsWith('hsl')) return v
  return null
}

export function parseIdeaThemeJson(data: unknown): ParsedIdeaThemeJson | null {
  if (!data || typeof data !== 'object') return null
  const d = data as IdeaThemeJson
  if (!d.name || typeof d.name !== 'string') return null

  const baseMode: ThemeCategory = d.dark === false ? 'light' : 'dark'
  const source = d.colors ?? {}
  const mapped: Record<string, string> = {}
  let rawKeyCount = 0

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue
    rawKeyCount++
    const cssVar = IDEA_UI_COLOR_MAP[key]
    if (!cssVar) continue
    const parsed = parseColorValue(value)
    if (parsed) mapped[cssVar] = parsed
  }

  if (Object.keys(mapped).length === 0) return null

  return {
    themeName: d.name,
    baseMode,
    colors: normalizeThemeColorKeys(mapped),
    author: d.author,
    parentTheme: d.parentTheme,
    rawKeyCount,
  }
}

export function ideaThemeToCinTheme(parsed: ParsedIdeaThemeJson) {
  return { themeName: parsed.themeName, baseMode: parsed.baseMode, colors: parsed.colors }
}
