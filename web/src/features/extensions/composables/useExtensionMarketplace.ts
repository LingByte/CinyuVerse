import { ref, watch } from 'vue'
import JSZip from 'jszip'
import { desktopApi } from '@/services/desktopApi'
import { ideApi } from '@/services/ideApi'
import { loadInstalledExtensions, upsertInstalledExtension, type InstalledExtension } from '../store'

export type OpenVsxSearchResult = {
  namespace: string
  name: string
  version: string
  displayName?: string
  description?: string
}

export function useExtensionMarketplace() {
  const query = ref('')
  const results = ref<OpenVsxSearchResult[]>([])
  const installed = ref<InstalledExtension[]>(loadInstalledExtensions())
  const searching = ref(false)
  const busy = ref(false)
  const error = ref('')
  const listTab = ref<'marketplace' | 'installed'>('marketplace')

  async function searchMarketplace() {
    const q = query.value.trim()
    if (!q) {
      results.value = []
      return
    }
    searching.value = true
    error.value = ''
    try {
      const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(q)}&size=20`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`搜索失败: ${res.status}`)
      const json = await res.json() as { extensions?: OpenVsxSearchResult[] }
      results.value = json.extensions ?? []
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '搜索扩展失败'
      results.value = []
    } finally {
      searching.value = false
    }
  }

  watch(query, () => {
    const t = window.setTimeout(() => void searchMarketplace(), 400)
    return () => window.clearTimeout(t)
  })

  async function installFromVsix() {
    busy.value = true
    error.value = ''
    try {
      const files = await desktopApi.openFiles()
      const vsixPath = files[0]?.path
      if (!vsixPath?.endsWith('.vsix')) throw new Error('请选择 .vsix 文件')
      await installVsixAtPath(vsixPath)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '安装失败'
    } finally {
      busy.value = false
    }
  }

  async function installFromMarketplace(item: OpenVsxSearchResult) {
    busy.value = true
    error.value = ''
    try {
      const metaUrl = `https://open-vsx.org/api/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}`
      const metaRes = await fetch(metaUrl)
      if (!metaRes.ok) throw new Error('获取扩展信息失败')
      const meta = await metaRes.json() as Record<string, unknown>
      const files = meta.files as Record<string, string> | undefined
      const vsixUrl = files?.download
      if (!vsixUrl) throw new Error('未找到 VSIX 下载地址')
      const path = await import('@tauri-apps/api/path')
      const fs = await import('@tauri-apps/api/fs')
      const appData = await path.appDataDir()
      const tempDir = await path.join(appData, 'temp')
      await fs.createDir(tempDir, { recursive: true })
      const savePath = await path.join(tempDir, `${item.namespace}.${item.name}.vsix`)
      await ideApi.downloadFile(vsixUrl, savePath)
      await installVsixAtPath(savePath, item)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '安装失败'
    } finally {
      busy.value = false
    }
  }

  async function installVsixAtPath(vsixPath: string, meta?: OpenVsxSearchResult) {
    const fs = await import('@tauri-apps/api/fs')
    const path = await import('@tauri-apps/api/path')
    const bytes = await fs.readBinaryFile(vsixPath)
    const zip = await JSZip.loadAsync(bytes)
    const manifestFile = zip.file('extension/package.json') ?? zip.file('package.json')
    if (!manifestFile) throw new Error('无效的 VSIX')
    const manifest = JSON.parse(await manifestFile.async('string')) as Record<string, string>
    const publisher = manifest.publisher ?? meta?.namespace ?? 'unknown'
    const name = manifest.name ?? meta?.name ?? 'extension'
    const extId = `${publisher}.${name}`
    const appData = await path.appDataDir()
    const destDir = await path.join(appData, 'extensions', extId)
    await ideApi.extractVsix(vsixPath, destDir)
    const ext: InstalledExtension = {
      id: extId,
      name,
      displayName: manifest.displayName ?? meta?.displayName ?? name,
      version: manifest.version ?? meta?.version ?? '0.0.0',
      publisher,
      path: destDir,
      installedAt: new Date().toISOString(),
    }
    upsertInstalledExtension(ext)
    installed.value = loadInstalledExtensions()
    try { await ideApi.startExtensionHost() } catch { /* optional */ }
  }

  function refreshInstalled() {
    installed.value = loadInstalledExtensions()
  }

  return {
    query,
    results,
    installed,
    searching,
    busy,
    error,
    listTab,
    installFromVsix,
    installFromMarketplace,
    refreshInstalled,
  }
}
