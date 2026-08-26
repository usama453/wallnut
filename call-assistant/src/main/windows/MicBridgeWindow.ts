import { BrowserWindow } from 'electron'
import { join } from 'path'

let micWindow: BrowserWindow | null = null
let loaded = false
let loadWaiters: Array<() => void> = []

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

function notifyLoaded(): void {
  loaded = true
  const waiters = loadWaiters
  loadWaiters = []
  waiters.forEach((r) => r())
}

export function getMicBridgeWindow(): BrowserWindow {
  if (micWindow && !micWindow.isDestroyed()) return micWindow

  micWindow = new BrowserWindow({
    width: 200,
    height: 100,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/mic.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  micWindow.webContents.once('did-finish-load', notifyLoaded)

  micWindow.on('closed', () => {
    micWindow = null
    loaded = false
  })

  if (isDev()) {
    micWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/mic.html`)
  } else {
    micWindow.loadFile(join(__dirname, '../renderer/mic.html'))
  }

  return micWindow
}

export function whenMicBridgeLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  return new Promise((resolve) => loadWaiters.push(resolve))
}

export function destroyMicBridgeWindow(): void {
  if (micWindow && !micWindow.isDestroyed()) micWindow.destroy()
  micWindow = null
  loaded = false
}
