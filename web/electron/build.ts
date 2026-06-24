import { spawnSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'

function tsc(project: string) {
  const result = spawnSync('npx', ['tsc', '-p', project], { stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function finalizePreload() {
  const js = 'dist-electron/preload.js'
  const cjs = 'dist-electron/preload.cjs'
  if (existsSync(js)) renameSync(js, cjs)
}

tsc('electron/tsconfig.json')
tsc('electron/tsconfig.preload.json')
finalizePreload()
