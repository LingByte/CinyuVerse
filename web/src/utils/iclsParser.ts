import type { EditorSchemeColors, SchemeCategory } from '@/config/editorSchemes'
import { mergeSchemeColors } from '@/config/editorSchemes'
import {
  ICLS_ATTRIBUTE_KEY_MAP,
  ICLS_COLOR_KEY_MAP,
  ICLS_FIELD_PRIORITY,
} from '@/config/iclsKeyMap'

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function parseHexValue(raw: string): string | null {
  const v = raw.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`
  if (/^[0-9A-Fa-f]{3}$/.test(v)) {
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`
  }
  if (/^[0-9A-Fa-f]{8}$/.test(v)) return `#${v.slice(0, 6)}`
  return null
}

function inferBaseMode(name: string, partial: Partial<EditorSchemeColors>): SchemeCategory {
  const bg = partial.background
  if (bg?.startsWith('#') && bg.length >= 7) {
    const h = bg.replace('#', '').slice(0, 6)
    const lum = (parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)) / 3
    return lum > 160 ? 'light' : 'dark'
  }
  const lower = name.toLowerCase()
  if (lower.includes('light') || lower.includes('white')) return 'light'
  return 'dark'
}

export interface ParsedIcls {
  schemeName: string
  baseMode: SchemeCategory
  colors: Partial<EditorSchemeColors>
  mappedKeyCount: number
  totalKeyCount: number
}

type RawColorHits = Map<keyof EditorSchemeColors, Map<string, string>>

function setHit(hits: RawColorHits, field: keyof EditorSchemeColors, iclsKey: string, hex: string) {
  if (!hits.has(field)) hits.set(field, new Map())
  hits.get(field)!.set(iclsKey, hex)
}

function resolveHits(hits: RawColorHits): Partial<EditorSchemeColors> {
  const out: Partial<EditorSchemeColors> = {}
  for (const [field, keyMap] of hits) {
    const priority = ICLS_FIELD_PRIORITY[field] ?? []
    let chosen: string | undefined
    for (const p of priority) {
      if (keyMap.has(p)) { chosen = keyMap.get(p); break }
    }
    if (!chosen) {
      chosen = keyMap.values().next().value
    }
    if (chosen) out[field] = chosen
  }
  return out
}

function extractHexFromElement(el: Element): string | null {
  const r = el.getAttribute('r')
  const g = el.getAttribute('g')
  const b = el.getAttribute('b')
  if (r != null && g != null && b != null) {
    return rgbToHex(Number(r), Number(g), Number(b))
  }
  const value = el.getAttribute('value')
  if (value) return parseHexValue(value)
  const fg = el.querySelector(':scope > option[name="FOREGROUND"], :scope > option[name="FOREGROUND"]')
  if (fg) {
    const fv = fg.getAttribute('value')
    if (fv) return parseHexValue(fv)
  }
  return null
}

function parseColorsSection(schemeEl: Element, hits: RawColorHits, stats: { total: number; mapped: number }) {
  schemeEl.querySelectorAll('colors > option, colors > color').forEach((el) => {
    const name = el.getAttribute('name')?.toUpperCase()
    if (!name) return
    stats.total++
    const field = ICLS_COLOR_KEY_MAP[name]
    if (!field) return
    const hex = extractHexFromElement(el)
    if (!hex) return
    stats.mapped++
    setHit(hits, field, name, hex)
  })
}

function parseAttributesSection(schemeEl: Element, hits: RawColorHits, stats: { total: number; mapped: number }) {
  schemeEl.querySelectorAll('attributes > option').forEach((attrEl) => {
    const attrName = attrEl.getAttribute('name')?.toUpperCase()
    if (!attrName) return
    stats.total++
    const field = ICLS_ATTRIBUTE_KEY_MAP[attrName]
    if (!field) return

    const fgEl = attrEl.querySelector('option[name="FOREGROUND"]')
    const fgVal = fgEl?.getAttribute('value')
    if (fgVal) {
      const hex = parseHexValue(fgVal)
      if (hex) {
        stats.mapped++
        setHit(hits, field, attrName, hex)
      }
    }

    const bgEl = attrEl.querySelector('option[name="BACKGROUND"]')
    const bgVal = bgEl?.getAttribute('value')
    if (bgVal && (field === 'background' || field === 'activeLine' || field === 'selection')) {
      const hex = parseHexValue(bgVal)
      if (hex) {
        stats.mapped++
        setHit(hits, field, `${attrName}_BG`, hex)
      }
    }
  })
}

export function parseIcls(xml: string): ParsedIcls | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return null

  const schemeEl = doc.querySelector('scheme')
  if (!schemeEl) return null

  const schemeName = schemeEl.getAttribute('name')?.trim() || '导入配色'
  const hits: RawColorHits = new Map()
  const stats = { total: 0, mapped: 0 }

  parseColorsSection(schemeEl, hits, stats)
  parseAttributesSection(schemeEl, hits, stats)

  const colors = resolveHits(hits)
  if (Object.keys(colors).length === 0) return null

  const baseMode = inferBaseMode(schemeName, colors)
  return {
    schemeName,
    baseMode,
    colors,
    mappedKeyCount: stats.mapped,
    totalKeyCount: stats.total,
  }
}

export function iclsToFullColors(parsed: ParsedIcls): EditorSchemeColors {
  return mergeSchemeColors(parsed.baseMode, parsed.colors)
}
