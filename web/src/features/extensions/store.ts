export type InstalledExtension = {
  id: string
  name: string
  displayName: string
  version: string
  publisher: string
  path: string
  installedAt: string
}

const STORAGE_KEY = 'cinyuverse-installed-extensions'

export function loadInstalledExtensions(): InstalledExtension[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveInstalledExtensions(list: InstalledExtension[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function upsertInstalledExtension(ext: InstalledExtension) {
  const list = loadInstalledExtensions().filter((e) => e.id !== ext.id)
  list.unshift(ext)
  saveInstalledExtensions(list)
}
