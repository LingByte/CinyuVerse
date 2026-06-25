/** Detect desktop runtime (Tauri Rust backend). */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

export function isDesktop(): boolean {
  return isTauri()
}

export type DesktopKind = 'tauri' | 'web'

export function desktopKind(): DesktopKind {
  return isTauri() ? 'tauri' : 'web'
}
