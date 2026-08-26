import { BrowserWindow, session, shell } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'Call Assistant',
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())
  setTimeout(() => { if (!win.isVisible()) win.show() }, 3000)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'camera', 'microphone', 'display-capture']
    callback(allowed.includes(permission))
  })

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev()) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function hideMainWindow(): void {
  mainWindow?.hide()
}
