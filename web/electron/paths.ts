import path from 'node:path'

export const DIST_ELECTRON = __dirname
export const WEB_ROOT = path.join(__dirname, '..')
export const PRELOAD = path.join(__dirname, 'preload.cjs')
export const DIST = path.join(WEB_ROOT, 'dist')
