import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, watch } from 'node:fs'

function finalizePreload() {
  const js = 'dist-electron/preload.js'
  const cjs = 'dist-electron/preload.cjs'
  if (existsSync(js)) renameSync(js, cjs)
}

function compile() {
  for (const project of ['electron/tsconfig.json', 'electron/tsconfig.preload.json']) {
    const result = spawnSync('npx', ['tsc', '-p', project], { stdio: 'inherit', shell: true })
    if (result.status !== 0) throw new Error(`tsc failed: ${project}`)
  }
  finalizePreload()
}

compile()
console.log('[electron] watching for changes...')

watch('electron', { recursive: true }, (_event, filename) => {
  if (!filename?.endsWith('.ts') || filename === 'build.ts' || filename === 'watch.ts') return
  try {
    compile()
  } catch (err) {
    console.error('[electron] compile failed:', err instanceof Error ? err.message : err)
  }
})
