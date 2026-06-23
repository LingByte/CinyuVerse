import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'node:path'
import fs from 'node:fs'

let mainWindow: BrowserWindow | null = null
let goProcess: ChildProcess | null = null

const isDev = !app.isPackaged
const GO_BINARY = isDev
  ? path.join(__dirname, '..', '..', 'cmd', 'server', 'server.exe')
  : path.join(process.resourcesPath, 'bin', 'server')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'CinyuVerse - AI 小说编辑器',
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d1117',
  })

  // Hide native OS menu bar; editor MenuBar.vue is the single menu layer
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  if (isDev) {
    mainWindow.loadURL('http://localhost:9090')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function startGoBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(GO_BINARY)) {
      if (isDev) {
        console.warn('[electron] Go binary not found, skipping backend auto-start (dev mode)')
        resolve()
        return
      }
      reject(new Error(`Go binary not found: ${GO_BINARY}`))
      return
    }

    const dataDir = path.join(app.getPath('userData'), 'data')
    const workspaceDir = path.join(app.getPath('userData'), 'workspace')
    fs.mkdirSync(dataDir, { recursive: true })
    fs.mkdirSync(workspaceDir, { recursive: true })

    goProcess = spawn(GO_BINARY, [], {
      env: {
        ...process.env,
        ADDR: ':8080',
        DSN: path.join(dataDir, 'cinyuverse.db'),
        WORKSPACE_DIR: workspaceDir,
        MODE: isDev ? 'development' : 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    goProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[go] ${data.toString().trim()}`)
    })

    goProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[go:err] ${data.toString().trim()}`)
    })

    goProcess.on('error', (err) => {
      console.error('[electron] Go process error:', err)
      reject(err)
    })

    goProcess.on('exit', (code) => {
      console.log(`[electron] Go process exited with code ${code}`)
      goProcess = null
    })

    // Wait a moment for the server to start
    setTimeout(resolve, 1000)
  })
}

function stopGoBackend() {
  if (goProcess) {
    goProcess.kill('SIGTERM')
    goProcess = null
  }
}

// ── IPC Handlers ────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: Electron.FileFilter[] }) => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [
      { name: 'Markdown / 文本', extensions: ['md', 'txt'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map(fp => {
    const ext = path.extname(fp).toLowerCase()
    const isBinary = ['.jar', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)
    return {
      path: fp,
      name: path.basename(fp),
      content: isBinary
        ? fs.readFileSync(fp).toString('base64')
        : fs.readFileSync(fp, 'utf-8'),
      encoding: isBinary ? 'base64' as const : 'utf8' as const,
    }
  })
})

ipcMain.handle('dialog:saveFile', async (_event, options?: {
  defaultPath?: string
  content?: string
  encoding?: 'utf8' | 'base64'
}) => {
  if (!mainWindow) return null
  const isBinary = options?.encoding === 'base64'
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options?.defaultPath,
    filters: isBinary
      ? [{ name: '主题插件', extensions: ['jar', 'zip'] }]
      : [
          { name: 'Markdown', extensions: ['md'] },
          { name: '纯文本', extensions: ['txt'] },
          { name: '主题文件', extensions: ['cin-theme', 'cin-scheme', 'json'] },
        ],
  })
  if (result.canceled || !result.filePath) return null
  if (options?.content) {
    if (isBinary) {
      fs.writeFileSync(result.filePath, Buffer.from(options.content, 'base64'))
    } else {
      fs.writeFileSync(result.filePath, options.content, 'utf-8')
    }
  }
  return result.filePath
})

ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('fs:scanFolder', async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return []
  type FileEntry = { name: string; path: string; relativePath: string; content: string }
  const results: FileEntry[] = []

  function walkDir(dir: string, basePath: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    // Sort: directories first, then files alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__') {
          walkDir(fullPath, basePath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (['.md', '.txt'].includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            results.push({
              name: entry.name,
              path: fullPath,
              relativePath: path.relative(basePath, fullPath).replace(/\\/g, '/'),
              content,
            })
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walkDir(folderPath, folderPath)
  return results
})

ipcMain.handle('getAppPath', () => app.getPath('userData'))

ipcMain.handle('platform', () => process.platform)

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
  return mainWindow.isMaximized()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(async () => {
  // Remove Electron default application menu (File/Edit/View/Window/Help)
  Menu.setApplicationMenu(null)
  if (!isDev) {
    try {
      await startGoBackend()
    } catch (err) {
      console.error('Failed to start Go backend:', err)
    }
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopGoBackend()
  app.quit()
})

app.on('before-quit', () => {
  stopGoBackend()
})
