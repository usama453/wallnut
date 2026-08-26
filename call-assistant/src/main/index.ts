import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { SettingsManager } from './settings/SettingsManager'
import { MicBridgeCapture } from './audio/MicBridgeCapture'
import { LocalSessionRepository } from './storage/sessions/LocalSessionRepository'
import { OpenAIClient } from './ai/assistant/OpenAIClient'
import { GeminiClient } from './ai/assistant/GeminiClient'
import { CallController } from './call/CallController'
import { registerIpc } from './ipc/registerIpc'
import {
  initOverlayWindow,
  showOverlay,
  hideOverlay,
  toggleOverlayCollapsed,
  getOverlayWindow
} from './windows/OverlayWindow'
import {
  createMainWindow,
  getMainWindow,
  showMainWindow,
  hideMainWindow
} from './windows/MainWindow'
import { destroyMicBridgeWindow } from './windows/MicBridgeWindow'

let tray: Tray | null = null
let isQuitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

function createTray(controller: CallController): void {
  let iconPath = join(__dirname, '../../resources/trayTemplate.png')
  if (!isDev()) {
    iconPath = join(process.resourcesPath, 'resources/trayTemplate.png')
  }
  let image: Electron.NativeImage
  try {
    image = nativeImage.createFromPath(iconPath)
  } catch {
    return
  }
  if (image.isEmpty()) return
  image = image.resize({ width: 18, height: 18 })

  tray = new Tray(image)
  tray.setToolTip('Call Assistant')
  const menu = Menu.buildFromTemplate([
    { label: 'Open Call Assistant', click: () => showMainWindow() },
    {
      label: 'Overlay',
      click: () => {
        const win = getOverlayWindow()
        if (win && win.isVisible()) hideOverlay()
        else showOverlay()
      }
    },
    {
      label: 'Expand / Collapse Overlay',
      click: () => toggleOverlayCollapsed()
    },
    { type: 'separator' },
    {
      label: 'Start / Stop Call',
      click: () => {
        if (controller.isActive) {
          void controller.stopCall()
        } else {
          void controller.startCall({})
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showMainWindow())
}

app.whenReady().then(() => {
  const settings = new SettingsManager()
  const micBridge = new MicBridgeCapture()
  const repository = new LocalSessionRepository()

  const buildClient = () => {
    const s = settings.effective()
    return s.aiProvider === 'gemini'
      ? new GeminiClient(() => settings.effective().geminiApiKey)
      : new OpenAIClient(() => settings.effective().openaiApiKey)
  }
  const buildModel = () => {
    const s = settings.effective()
    return s.aiProvider === 'gemini' ? s.geminiModel : s.openaiModel
  }

  const controller = new CallController(settings, micBridge, repository, buildClient, buildModel)

  registerIpc({ controller, repository, settings })

  createMainWindow()

  const stored = settings.get()
  initOverlayWindow({
    collapsed: stored.overlayCollapsed,
    position: stored.overlayPosition
  })

  const main = getMainWindow()
  if (main) {
    main.on('close', (e) => {
      if (isQuitting) return
      e.preventDefault()
      hideMainWindow()
    })
  }

  createTray(controller)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (isQuitting) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  destroyMicBridgeWindow()
})
