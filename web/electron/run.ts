import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child: ChildProcess = spawn(electronPath, ['.'], {
  cwd: webRoot,
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
