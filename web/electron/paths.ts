import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

export const DIST_ELECTRON = dir
export const WEB_ROOT = path.join(dir, '..')
export const PRELOAD = path.join(dir, 'preload.cjs')
export const DIST = path.join(WEB_ROOT, 'dist')
