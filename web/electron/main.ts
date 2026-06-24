import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { DIST, PRELOAD } from './paths'
import { buildDirTree, isEditableFile, isBinaryFile } from './fsTree'

let mainWindow: BrowserWindow | null = null
const childWindows = new Map<string, BrowserWindow>()
let pendingOpenFile: string | null = null

const isDev = !app.isPackaged
const DEV_URL = 'http://127.0.0.1:9090'

function loadURL(win: BrowserWindow, pathQuery = '') {
  if (isDev) {
    win.loadURL(DEV_URL + pathQuery)
  } else {
    const indexHtml = path.join(DIST, 'index.html')
    if (pathQuery.startsWith('?')) {
      win.loadFile(indexHtml, { search: pathQuery })
    } else {
      win.loadFile(indexHtml)
    }
  }
}

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
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d1117',
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }

  if (pendingOpenFile) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('app:open-file', pendingOpenFile)
      pendingOpenFile = null
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── IPC Handlers ────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: Electron.FileFilter[] }) => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options?.filters || [
      { name: '所有支持的文件', extensions: ['md', 'txt', 'json', 'js', 'ts', 'html', 'css', 'py', 'go', 'rs', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'csv', 'tsv', 'xlsx', 'xls', 'xml', 'yaml', 'yml'] },
      { name: 'Markdown / 文本', extensions: ['md', 'txt', 'markdown'] },
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: '表格', extensions: ['csv', 'tsv', 'xlsx', 'xls'] },
      { name: '代码', extensions: ['js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'css', 'py', 'go', 'rs', 'java'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map(fp => {
    const binary = isBinaryFile(fp)
    return {
      path: fp,
      name: path.basename(fp),
      content: binary
        ? fs.readFileSync(fp).toString('base64')
        : fs.readFileSync(fp, 'utf-8'),
      encoding: binary ? 'base64' as const : 'utf8' as const,
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
      ? [{ name: '文件', extensions: ['*'] }]
      : [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: '纯文本', extensions: ['txt'] },
          { name: '代码', extensions: ['js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'css', 'json', 'py', 'go', 'rs', 'java'] },
          { name: '配置', extensions: ['yaml', 'yml', 'toml', 'ini', 'xml', 'cin-theme', 'cin-scheme'] },
          { name: '全部', extensions: ['*'] },
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

ipcMain.handle('fs:listDirTree', async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return null
  return buildDirTree(folderPath)
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('文件不存在')
  }
  const binary = isBinaryFile(filePath)
  return {
    content: binary
      ? fs.readFileSync(filePath).toString('base64')
      : fs.readFileSync(filePath, 'utf-8'),
    encoding: binary ? 'base64' as const : 'utf8' as const,
  }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  if (!filePath || !isEditableFile(filePath)) {
    throw new Error('无法写入该文件')
  }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
})

ipcMain.handle('fs:createFile', async (_event, parentPath: string, fileName: string) => {
  const safeName = path.basename(fileName)
  if (!safeName || !parentPath) throw new Error('无效的文件名')
  const fullPath = path.join(parentPath, safeName)
  if (fs.existsSync(fullPath)) throw new Error('文件已存在')
  fs.writeFileSync(fullPath, '', 'utf-8')
  return fullPath
})

ipcMain.handle('fs:createDir', async (_event, parentPath: string, dirName: string) => {
  const safeName = path.basename(dirName)
  if (!safeName || !parentPath) throw new Error('无效的文件夹名')
  const fullPath = path.join(parentPath, safeName)
  if (fs.existsSync(fullPath)) throw new Error('文件夹已存在')
  fs.mkdirSync(fullPath)
  return fullPath
})

ipcMain.handle('fs:deletePath', async (_event, targetPath: string) => {
  if (!targetPath || !fs.existsSync(targetPath)) return
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    fs.rmdirSync(targetPath)
  } else {
    fs.unlinkSync(targetPath)
  }
})

ipcMain.handle('fs:dirname', async (_event, filePath: string) => path.dirname(filePath))

/** Legacy: scan .md/.txt for workspace metadata building */
ipcMain.handle('fs:scanFolder', async (_event, folderPath: string) => {
  if (!folderPath || !fs.existsSync(folderPath)) return []
  type FileEntry = { name: string; path: string; relativePath: string; content: string }
  const results: FileEntry[] = []

  function walkDir(dir: string, basePath: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
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

ipcMain.handle('window:minimize', () => { mainWindow?.minimize() })

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
  return mainWindow.isMaximized()
})

ipcMain.handle('window:close', () => { mainWindow?.close() })
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── Inspiration drafts ──────────────────────────────────────

function inspirationPath(wsId: string) {
  return path.join(app.getPath('userData'), 'inspiration', `${wsId}.json`)
}

function readInspiration(wsId: string) {
  const fp = inspirationPath(wsId)
  if (!fs.existsSync(fp)) return []
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'))
  } catch {
    return []
  }
}

function writeInspiration(wsId: string, notes: unknown[]) {
  const dir = path.dirname(inspirationPath(wsId))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(inspirationPath(wsId), JSON.stringify(notes, null, 2), 'utf-8')
}

ipcMain.handle('inspiration:list', (_e, wsId: string) => readInspiration(wsId || 'default'))

ipcMain.handle('inspiration:add', (_e, wsId: string, note: { id: string; content: string; created_at: string }) => {
  const id = wsId || 'default'
  const list = readInspiration(id)
  list.unshift(note)
  writeInspiration(id, list)
  mainWindow?.webContents.send('inspiration:saved')
  return list
})

function createInspirationWindow(wsId: string) {
  const key = 'inspiration-' + wsId
  if (childWindows.has(key)) {
    childWindows.get(key)?.focus()
    return
  }
  const win = new BrowserWindow({
    width: 420,
    height: 360,
    alwaysOnTop: true,
    title: '灵感草稿箱',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  loadURL(win, `?mode=inspiration&wsId=${encodeURIComponent(wsId)}`)
  childWindows.set(key, win)
  win.on('closed', () => childWindows.delete(key))
}

ipcMain.handle('window:openInspiration', (_e, wsId: string) => {
  createInspirationWindow(wsId || 'default')
})

function createDetachedPanel(panel: 'ai' | 'outline', wsId: string) {
  const key = `detach-${panel}-${wsId}`
  if (childWindows.has(key)) {
    childWindows.get(key)?.focus()
    return
  }
  const win = new BrowserWindow({
    width: panel === 'ai' ? 420 : 520,
    height: 800,
    title: panel === 'ai' ? 'CinyuVerse AI' : 'CinyuVerse 大纲',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  loadURL(win, `?mode=detach&panel=${panel}&wsId=${encodeURIComponent(wsId)}`)
  childWindows.set(key, win)
  win.on('closed', () => childWindows.delete(key))
}

ipcMain.handle('window:openDetached', (_e, panel: 'ai' | 'outline', wsId: string) => {
  createDetachedPanel(panel, wsId)
})

function handleOpenFile(filePath: string) {
  if (mainWindow) {
    mainWindow.webContents.send('app:open-file', filePath)
    mainWindow.focus()
  } else {
    pendingOpenFile = filePath
  }
}

// ── App Lifecycle ───────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const fileArg = argv.find((a) => !a.startsWith('-') && /\.\w+$/i.test(a))
    if (fileArg) handleOpenFile(fileArg)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  handleOpenFile(filePath)
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    createInspirationWindow('default')
  })

  const startupFile = process.argv.find((a) => !a.startsWith('-') && /\.\w+$/i.test(a))
  if (startupFile) handleOpenFile(startupFile)

  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient('cinyuverse')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { globalShortcut.unregisterAll() })
