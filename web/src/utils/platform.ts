/** 跨平台修饰键与快捷键显示（Mac ⌘ / Windows Ctrl） */

let cachedMac: boolean | null = null

export function isMacPlatform(): boolean {
  if (cachedMac !== null) return cachedMac
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    cachedMac = true
    return true
  }
  return false
}

export async function detectMacPlatform(): Promise<boolean> {
  if (cachedMac !== null) return cachedMac
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    cachedMac = true
    return true
  }
  try {
    const p = await window.electronAPI?.platform?.()
    cachedMac = p === 'darwin'
  } catch {
    cachedMac = false
  }
  return cachedMac
}

export function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

export function formatShortcut(shortcut: string, mac = isMacPlatform()): string {
  if (!mac) return shortcut
  return shortcut
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧')
}

export function modEnterLabel(mac = isMacPlatform()): string {
  return mac ? '⌘+Enter' : 'Ctrl+Enter'
}
