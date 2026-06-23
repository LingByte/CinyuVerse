import { unzipSync, zipSync, strToU8, strFromU8, type Unzipped } from 'fflate'
import type { CinThemeFile } from '@/config/themePresets'
import type { CinSchemeFile } from '@/config/editorSchemes'
import { validateCinTheme } from '@/config/themePresets'
import { validateCinScheme } from '@/config/editorSchemes'
import { parseIdeaThemeJson, ideaThemeToCinTheme } from '@/utils/ideaThemeJsonParser'
import { parseIcls } from '@/utils/iclsParser'

export interface ThemePluginManifest {
  name: string
  version: string
  author?: string
  description?: string
  baseMode?: 'light' | 'dark'
  includesUiTheme?: boolean
  includesEditorScheme?: boolean
  includesBackground?: boolean
}

export interface ThemePluginImportResult {
  manifest?: ThemePluginManifest
  uiTheme?: CinThemeFile
  editorScheme?: CinSchemeFile
  backgroundImage?: { dataUrl: string; mimeType: string; filename: string }
  source: 'cinyuverse' | 'idea' | 'mixed'
  warnings: string[]
}

export interface ThemePluginExportInput {
  name: string
  author?: string
  description?: string
  uiTheme?: CinThemeFile
  editorScheme?: CinSchemeFile
  backgroundImage?: { dataUrl: string; mimeType: string }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

function entriesFromUnzipped(unzipped: Unzipped): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(unzipped)) {
    map.set(normalizePath(path), data)
  }
  return map
}

function readText(entries: Map<string, Uint8Array>, path: string): string | null {
  const data = entries.get(normalizePath(path))
  if (!data) return null
  return strFromU8(data)
}

function findEntries(entries: Map<string, Uint8Array>, pattern: RegExp): string[] {
  return [...entries.keys()].filter((k) => pattern.test(k))
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'application/octet-stream'
}

function parsePluginXml(xml: string): { themeJsonPaths: string[] } {
  const paths: string[] = []
  if (typeof DOMParser === 'undefined') return { themeJsonPaths: paths }
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  doc.querySelectorAll('themeProvider, themeMetadata').forEach((el) => {
    const p = el.getAttribute('path') ?? el.getAttribute('source')
    if (p) paths.push(p.replace(/^\//, ''))
  })
  return { themeJsonPaths: paths }
}

export function importThemePlugin(bytes: Uint8Array): ThemePluginImportResult | null {
  let unzipped: Unzipped
  try {
    unzipped = unzipSync(bytes)
  } catch {
    return null
  }

  const entries = entriesFromUnzipped(unzipped)
  const warnings: string[] = []
  let uiTheme: CinThemeFile | undefined
  let editorScheme: CinSchemeFile | undefined
  let backgroundImage: ThemePluginImportResult['backgroundImage']
  let manifest: ThemePluginManifest | undefined
  let source: ThemePluginImportResult['source'] = 'cinyuverse'

  const manifestPaths = findEntries(entries, /manifest\.json$/i)
  const manifestText = readText(entries, 'cinyuverse/manifest.json') ?? (manifestPaths[0] ? readText(entries, manifestPaths[0]) : null)
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText) as ThemePluginManifest
    } catch {
      warnings.push('manifest.json 解析失败')
    }
  }

  const cinThemePath = findEntries(entries, /theme\.cin-theme$/i)[0]
  if (cinThemePath) {
    const text = readText(entries, cinThemePath)
    if (text) {
      try {
        uiTheme = validateCinTheme(JSON.parse(text)) ?? undefined
      } catch {
        warnings.push('theme.cin-theme 无效')
      }
    }
  }

  const themeJsonPaths = [
    ...findEntries(entries, /\.theme\.json$/i),
    ...parsePluginXml(readText(entries, 'META-INF/plugin.xml') ?? '').themeJsonPaths,
  ]
  if (!uiTheme) {
    for (const p of themeJsonPaths) {
      const text = readText(entries, p)
      if (!text) continue
      try {
        const parsed = parseIdeaThemeJson(JSON.parse(text))
        if (parsed) {
          uiTheme = ideaThemeToCinTheme(parsed)
          source = 'idea'
          warnings.push(`IDEA theme.json：${parsed.rawKeyCount} 源键 → ${Object.keys(parsed.colors).length} 项 UI 变量`)
          break
        }
      } catch { /* skip */ }
    }
  }

  const cinSchemePath = findEntries(entries, /scheme\.cin-scheme$/i)[0]
  if (cinSchemePath) {
    const text = readText(entries, cinSchemePath)
    if (text) {
      try {
        editorScheme = validateCinScheme(JSON.parse(text)) ?? undefined
      } catch {
        warnings.push('scheme.cin-scheme 无效')
      }
    }
  }

  const iclsPaths = findEntries(entries, /\.icls$/i)
  if (!editorScheme && iclsPaths.length > 0) {
    const text = readText(entries, iclsPaths[0]!)
    if (text) {
      const parsed = parseIcls(text)
      if (parsed) {
        editorScheme = { schemeName: parsed.schemeName, baseMode: parsed.baseMode, colors: parsed.colors }
        source = uiTheme ? 'mixed' : 'idea'
        warnings.push(`.icls：映射 ${parsed.mappedKeyCount} 项语法色`)
      }
    }
  }

  const imagePaths = findEntries(entries, /\.(png|jpe?g|webp|gif)$/i).filter((p) => !p.includes('META-INF'))
  const bgPath = imagePaths.find((p) => /background|wallpaper|bg/i.test(p)) ?? imagePaths[0]
  if (bgPath) {
    const data = entries.get(bgPath)
    if (data) {
      const mime = mimeFromFilename(bgPath)
      backgroundImage = {
        dataUrl: `data:${mime};base64,${uint8ToBase64(data)}`,
        mimeType: mime,
        filename: bgPath.split('/').pop() ?? 'background.png',
      }
    }
  }

  if (!uiTheme && !editorScheme && !backgroundImage) return null
  return { manifest, uiTheme, editorScheme, backgroundImage, source, warnings }
}

export function exportThemePlugin(input: ThemePluginExportInput): Uint8Array {
  const slug = input.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').slice(0, 40) || 'theme'
  const manifest: ThemePluginManifest = {
    name: input.name,
    version: '1.0.0',
    author: input.author ?? 'CinyuVerse',
    description: input.description,
    baseMode: input.uiTheme?.baseMode,
    includesUiTheme: !!input.uiTheme,
    includesEditorScheme: !!input.editorScheme,
    includesBackground: !!input.backgroundImage,
  }

  const files: Record<string, Uint8Array> = {}
  files['cinyuverse/manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))

  if (input.uiTheme) {
    files['cinyuverse/theme.cin-theme'] = strToU8(JSON.stringify(input.uiTheme, null, 2))
    files[`theme/${slug}.theme.json`] = strToU8(JSON.stringify({
      name: input.uiTheme.themeName,
      dark: input.uiTheme.baseMode === 'dark',
      author: input.author ?? 'CinyuVerse',
      colors: input.uiTheme.colors,
    }, null, 2))
  }

  if (input.editorScheme) {
    files['cinyuverse/scheme.cin-scheme'] = strToU8(JSON.stringify(input.editorScheme, null, 2))
  }

  if (input.backgroundImage) {
    const ext = input.backgroundImage.mimeType.includes('png') ? 'png'
      : input.backgroundImage.mimeType.includes('webp') ? 'webp' : 'jpg'
    const b64 = input.backgroundImage.dataUrl.split(',')[1] ?? ''
    files[`cinyuverse/background.${ext}`] = base64ToUint8(b64)
  }

  files['META-INF/plugin.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<idea-plugin>
  <id>com.cinyuverse.theme.${slug}</id>
  <name>${input.name}</name>
  <vendor>CinyuVerse</vendor>
  <extensions defaultExtensionNs="com.intellij">
    <themeProvider id="${slug}" path="/theme/${slug}.theme.json"/>
  </extensions>
</idea-plugin>`)

  return zipSync(files, { level: 6 })
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export function bytesToDownloadBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'application/java-archive' })
}
