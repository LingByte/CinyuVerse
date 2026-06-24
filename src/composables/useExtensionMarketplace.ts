import { ref, computed, watch } from 'vue'
import JSZip from 'jszip'
import { loadInstalledExtensions, type InstalledExtension, upsertInstalledExtension } from '@/extensions/store'

export type VsixManifest = {
  name?: string
  displayName?: string
  description?: string
  version?: string
  publisher?: string
  main?: string
}

export type OpenVsxSearchResult = {
  namespace: string
  name: string
  version: string
  displayName?: string
  description?: string
  iconUrl?: string
}

export type ExtensionDetail = {
  namespace: string
  name: string
  version: string
  displayName: string
  description: string
  iconUrl?: string
  categories: string[]
  repository?: string
  license?: string
  downloadCount?: number
  publishedBy?: string
  readme?: string
}

export type ListTab = 'marketplace' | 'installed'

function extensionKey(r: Pick<OpenVsxSearchResult, 'namespace' | 'name'>) {
  return `${r.namespace}.${r.name}`
}

function extensionIconCandidates(r: Pick<OpenVsxSearchResult, 'namespace' | 'name' | 'iconUrl'>) {
  const urls: string[] = []
  if (r.iconUrl?.trim()) urls.push(r.iconUrl.trim())
  const base = `https://open-vsx.org/api/${encodeURIComponent(r.namespace)}/${encodeURIComponent(r.name)}/latest/file`
  urls.push(`${base}/icon.png`, `${base}/icon.svg`)
  return urls
}

function mimeFromUrl(url: string): string {
  const lower = url.split('?')[0]?.toLowerCase() ?? ''
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

async function pickVsixFile(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const p = await invoke<string | null>('open_file_dialog')
    return p ?? ''
  } catch {
    const { open } = await import('@tauri-apps/api/dialog')
    const selected = await open({
      title: 'Install Extension (.vsix)',
      multiple: false,
      filters: [{ name: 'VSIX', extensions: ['vsix'] }],
    })
    return typeof selected === 'string' ? selected : ''
  }
}

async function openVsxGetVsixUrl(namespace: string, name: string): Promise<{ url: string; version: string }> {
  const url = `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch extension failed: ${res.status} ${res.statusText}`)
  const json = (await res.json()) as Record<string, unknown>
  const version = typeof json.version === 'string' ? json.version : ''
  const files = json.files as Record<string, unknown> | undefined
  const downloads = json.downloads as Record<string, unknown> | undefined
  const direct = typeof files?.download === 'string' ? files.download : ''
  const universal = typeof downloads?.universal === 'string' ? downloads.universal : ''
  const vsixUrl = direct || universal
  if (!vsixUrl) throw new Error('VSIX file not found')
  return { url: vsixUrl, version }
}

async function downloadVsixToTemp(url: string, filename: string) {
  const { invoke } = await import('@tauri-apps/api/tauri')
  const path = await import('@tauri-apps/api/path')
  const fs = await import('@tauri-apps/api/fs')
  const appData = await path.appDataDir()
  const tempDir = await path.join(appData, 'temp')
  await fs.createDir(tempDir, { recursive: true })
  const savePath = await path.join(tempDir, filename)
  await invoke('download_file', { url, savePath })
  return savePath
}

async function extractVsixToExtensionsDir(vsixPath: string, extId: string) {
  const { invoke } = await import('@tauri-apps/api/tauri')
  const path = await import('@tauri-apps/api/path')
  const fs = await import('@tauri-apps/api/fs')
  const appData = await path.appDataDir()
  const extsDir = await path.join(appData, 'extensions')
  await fs.createDir(extsDir, { recursive: true })
  const destDir = await path.join(extsDir, extId)
  await fs.createDir(destDir, { recursive: true })
  await invoke('extract_vsix', { vsixPath, destDir })
  return destDir
}

async function readVsixManifest(vsixPath: string): Promise<VsixManifest> {
  const fs = await import('@tauri-apps/api/fs')
  const bytes = await fs.readBinaryFile(vsixPath)
  const zip = await JSZip.loadAsync(bytes)
  const pkg = zip.file('extension/package.json') ?? zip.file('package.json')
  if (!pkg) throw new Error('VSIX missing package.json')
  return JSON.parse(await pkg.async('string')) as VsixManifest
}

const installed = ref<InstalledExtension[]>([])
const busy = ref(false)
const error = ref('')
const query = ref('')
const results = ref<OpenVsxSearchResult[]>([])
const searching = ref(false)
const page = ref(0)
let lastRequestId = 0
const installingId = ref('')
const listTab = ref<ListTab>('marketplace')
const selectedMarketplaceKey = ref('')
const selectedInstalledId = ref('')
const marketplaceDetail = ref<ExtensionDetail | null>(null)
const detailLoading = ref(false)
const selectedManifest = ref<VsixManifest | null>(null)
const iconDataUrls = ref<Record<string, string>>({})
const iconFailed = ref<Record<string, boolean>>({})
const iconLoading = ref<Record<string, boolean>>({})

const list = computed(() => installed.value)
const selectedMarketplace = computed(
  () => results.value.find((r) => extensionKey(r) === selectedMarketplaceKey.value) ?? null,
)
const selectedInstalled = computed(
  () => list.value.find((x) => x.id === selectedInstalledId.value) ?? null,
)
const hasSelection = computed(
  () =>
    (listTab.value === 'marketplace' && !!selectedMarketplace.value) ||
    (listTab.value === 'installed' && !!selectedInstalled.value),
)

function isInstalledMarketplace(r: Pick<OpenVsxSearchResult, 'namespace' | 'name'>) {
  const id = extensionKey(r)
  return list.value.some((e) => e.id === id)
}

async function loadIcon(key: string, urls: string[]) {
  if (iconDataUrls.value[key] || iconFailed.value[key] || iconLoading.value[key]) return
  iconLoading.value = { ...iconLoading.value, [key]: true }
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    for (const url of urls) {
      try {
        const base64 = (await invoke('fetch_url_base64', { url })) as string
        const mime = mimeFromUrl(url)
        iconDataUrls.value = { ...iconDataUrls.value, [key]: `data:${mime};base64,${base64}` }
        return
      } catch {
        // try next candidate
      }
    }
    iconFailed.value = { ...iconFailed.value, [key]: true }
  } finally {
    const next = { ...iconLoading.value }
    delete next[key]
    iconLoading.value = next
  }
}

const detailCache = ref<Record<string, ExtensionDetail>>({})
const readmeLoadingKey = ref('')

function previewDetailFromResult(r: OpenVsxSearchResult): ExtensionDetail {
  return {
    namespace: r.namespace,
    name: r.name,
    version: r.version,
    displayName: r.displayName ?? `${r.namespace}.${r.name}`,
    description: r.description ?? '',
    iconUrl: r.iconUrl,
    categories: [],
    publishedBy: r.namespace,
  }
}

function parseDetailJson(json: Record<string, unknown>, r: OpenVsxSearchResult): ExtensionDetail {
  const files = json.files as Record<string, string> | undefined
  const categories = Array.isArray(json.categories)
    ? json.categories.filter((c): c is string => typeof c === 'string')
    : []
  return {
    namespace: r.namespace,
    name: r.name,
    version: typeof json.version === 'string' ? json.version : r.version,
    displayName:
      (typeof json.displayName === 'string' ? json.displayName : r.displayName) ||
      `${r.namespace}.${r.name}`,
    description: (typeof json.description === 'string' ? json.description : r.description) || '',
    iconUrl: files?.icon || r.iconUrl,
    categories,
    repository: typeof json.repository === 'string' ? json.repository : undefined,
    license: typeof json.license === 'string' ? json.license : undefined,
    downloadCount: typeof json.downloadCount === 'number' ? json.downloadCount : undefined,
    publishedBy:
      typeof json.publishedBy === 'string'
        ? json.publishedBy
        : typeof (json.publisher as Record<string, unknown> | undefined)?.displayName === 'string'
          ? String((json.publisher as Record<string, unknown>).displayName)
          : r.namespace,
    readme: '',
  }
}

async function loadReadme(key: string, readmeUrl: string, base: ExtensionDetail) {
  readmeLoadingKey.value = key
  try {
    const readme = await fetch(readmeUrl).then((x) => x.text())
    const next = { ...base, readme }
    detailCache.value = { ...detailCache.value, [key]: next }
    if (selectedMarketplaceKey.value === key) {
      marketplaceDetail.value = next
    }
  } catch {
    // keep detail without readme
  } finally {
    if (readmeLoadingKey.value === key) readmeLoadingKey.value = ''
  }
}

async function selectMarketplace(r: OpenVsxSearchResult) {
  const key = extensionKey(r)
  listTab.value = 'marketplace'
  selectedMarketplaceKey.value = key
  selectedInstalledId.value = ''
  void loadIcon(key, extensionIconCandidates(r))

  const cached = detailCache.value[key]
  if (cached) {
    marketplaceDetail.value = cached
    detailLoading.value = false
    return
  }

  marketplaceDetail.value = previewDetailFromResult(r)
  detailLoading.value = true

  try {
    const url = `https://open-vsx.org/api/${encodeURIComponent(r.namespace)}/${encodeURIComponent(r.name)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to load extension details (${res.status})`)
    const json = (await res.json()) as Record<string, unknown>
    const detail = parseDetailJson(json, r)
    const cachedReadme = detailCache.value[key]?.readme
    if (cachedReadme) detail.readme = cachedReadme

    marketplaceDetail.value = detail
    detailCache.value = { ...detailCache.value, [key]: detail }
    void loadIcon(key, extensionIconCandidates({ ...r, iconUrl: detail.iconUrl }))

    const files = json.files as Record<string, string> | undefined
    if (files?.readme && !detail.readme) {
      void loadReadme(key, files.readme, detail)
    }
  } catch (e: unknown) {
    error.value = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to load details.'
  } finally {
    detailLoading.value = false
  }
}

function selectInstalled(id: string) {
  listTab.value = 'installed'
  selectedInstalledId.value = id
  selectedMarketplaceKey.value = ''
  marketplaceDetail.value = null
}

async function runSearch() {
  searching.value = true
  error.value = ''
  try {
    const rid = ++lastRequestId
    const q = query.value.trim()
    const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(q)}&size=20&offset=${page.value * 20}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as Record<string, unknown>
    const items = Array.isArray(json.extensions) ? json.extensions : []
    const mapped: OpenVsxSearchResult[] = items
      .map((x: unknown) => {
        const item = x as Record<string, unknown>
        const files = item.files as Record<string, unknown> | undefined
        return {
          namespace: typeof item.namespace === 'string' ? item.namespace : '',
          name: typeof item.name === 'string' ? item.name : '',
          version: typeof item.version === 'string' ? item.version : '',
          displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
          description: typeof item.description === 'string' ? item.description : undefined,
          iconUrl: typeof files?.icon === 'string' ? files.icon : undefined,
        }
      })
      .filter((x) => x.namespace && x.name && x.version)
    if (rid !== lastRequestId) return
    results.value = mapped
    for (const r of mapped) {
      void loadIcon(extensionKey(r), extensionIconCandidates(r))
    }
    if (mapped[0]) {
      await selectMarketplace(mapped[0])
    } else {
      selectedMarketplaceKey.value = ''
      marketplaceDetail.value = null
    }
  } catch (e: unknown) {
    error.value = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Search failed.'
    results.value = []
  } finally {
    searching.value = false
  }
}

async function installFromStore(r: OpenVsxSearchResult) {
  const key = extensionKey(r)
  if (installingId.value === key) return
  installingId.value = key
  busy.value = true
  error.value = ''
  try {
    const { url, version } = await openVsxGetVsixUrl(r.namespace, r.name)
    const fileName = `${r.namespace}.${r.name}-${version || r.version}.vsix`
    const vsixPath = await downloadVsixToTemp(url, fileName)
    const manifest = await readVsixManifest(vsixPath)
    const name = (manifest.name ?? r.name).trim()
    const publisher = (manifest.publisher ?? r.namespace).trim()
    const id = `${publisher}.${name}`
    const installDir = await extractVsixToExtensionsDir(vsixPath, id)
    const ext: InstalledExtension = {
      id,
      name,
      publisher,
      displayName: (manifest.displayName ?? r.displayName ?? name).trim(),
      description: (manifest.description ?? r.description ?? '').trim(),
      version: (manifest.version ?? version ?? r.version ?? '0.0.0').trim(),
      installedAt: Date.now(),
      vsixPath,
      installDir,
      main: typeof manifest.main === 'string' ? manifest.main : undefined,
      enabled: true,
    }
    installed.value = upsertInstalledExtension(ext)
    selectInstalled(ext.id)
    selectedManifest.value = manifest
    window.dispatchEvent(new CustomEvent('extensions-installed-changed'))
  } catch (e: unknown) {
    error.value = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to install extension.'
  } finally {
    busy.value = false
    installingId.value = ''
  }
}

async function installFromVsix() {
  error.value = ''
  busy.value = true
  try {
    const vsixPath = await pickVsixFile()
    if (!vsixPath) return
    const manifest = await readVsixManifest(vsixPath)
    const name = (manifest.name ?? '').trim()
    const publisher = (manifest.publisher ?? '').trim()
    if (!name || !publisher) throw new Error('Invalid extension manifest: missing name/publisher')
    const id = `${publisher}.${name}`
    const installDir = await extractVsixToExtensionsDir(vsixPath, id)
    const ext: InstalledExtension = {
      id,
      name,
      publisher,
      displayName: (manifest.displayName ?? name).trim(),
      description: (manifest.description ?? '').trim(),
      version: (manifest.version ?? '0.0.0').trim(),
      installedAt: Date.now(),
      vsixPath,
      installDir,
      main: typeof manifest.main === 'string' ? manifest.main : undefined,
      enabled: true,
    }
    installed.value = upsertInstalledExtension(ext)
    selectInstalled(ext.id)
  } catch (e: unknown) {
    error.value = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to install extension.'
  } finally {
    busy.value = false
  }
}

function initExtensionMarketplace() {
  installed.value = loadInstalledExtensions()
  if (installed.value[0]) selectedInstalledId.value = installed.value[0].id
  void runSearch()
}

watch([query, page], () => {
  const t = window.setTimeout(() => void runSearch(), 250)
  return () => window.clearTimeout(t)
})

watch(listTab, (tab) => {
  if (tab === 'installed' && list.value[0] && !selectedInstalledId.value) {
    selectInstalled(list.value[0].id)
  }
  if (tab === 'marketplace' && selectedMarketplace.value) {
    void selectMarketplace(selectedMarketplace.value)
  }
})

watch([installed, selectedInstalledId], async () => {
  if (!selectedInstalledId.value) {
    selectedManifest.value = null
    return
  }
  const ext = installed.value.find((x) => x.id === selectedInstalledId.value)
  if (!ext?.vsixPath) {
    selectedManifest.value = null
    return
  }
  try {
    selectedManifest.value = await readVsixManifest(ext.vsixPath)
  } catch {
    selectedManifest.value = null
  }
})

export function useExtensionMarketplace() {
  return {
    extensionKey,
    extensionIconCandidates,
    installed,
    busy,
    error,
    query,
    results,
    searching,
    page,
    installingId,
    listTab,
    selectedMarketplaceKey,
    selectedInstalledId,
    marketplaceDetail,
    detailLoading,
    selectedManifest,
    iconDataUrls,
    iconFailed,
    iconLoading,
    list,
    selectedMarketplace,
    selectedInstalled,
    hasSelection,
    isInstalledMarketplace,
    loadIcon,
    selectMarketplace,
    selectInstalled,
    runSearch,
    installFromStore,
    installFromVsix,
    initExtensionMarketplace,
    readmeLoadingKey,
    detailCache,
  }
}
