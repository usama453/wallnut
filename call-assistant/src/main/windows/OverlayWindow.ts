import { BrowserWindow, screen, Rectangle } from 'electron'
import { join } from 'path'
import type { Settings } from '../../shared/types'

const EXPANDED_WIDTH = 360
const EXPANDED_HEIGHT = 460
const COLLAPSED_WIDTH = 128
const COLLAPSED_HEIGHT = 40
const MIN_WIDTH = 300
const MIN_HEIGHT = 320
const MAX_WIDTH = 640
const MAX_HEIGHT = 760
const MARGIN = 16

let overlay: BrowserWindow | null = null
let collapsed = true
let visible = false
let baseBounds: Rectangle | null = null

function isDev(): boolean {
  return !!process.env['ELECTRON_RENDERER_URL']
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
    height: collapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT,
    x: 100,
    y: 100,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('move', () => {
    const b = win.getBounds()
    if (b.x !== undefined && b.y !== undefined) {
      onPositionChange?.(b.x, b.y)
    }
  })

  win.on('closed', () => {
    if (overlay === win) overlay = null
  })

  if (isDev()) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  overlay = win
  return win
}

let onPositionChange: ((x: number, y: number) => void) | null = null

export function initOverlayWindow(opts: {
  collapsed: boolean
  position: Settings['overlayPosition']
  onPositionChange?: (x: number, y: number) => void
}): BrowserWindow {
  collapsed = opts.collapsed
  onPositionChange = opts.onPositionChange ?? null
  const win = createWindow()
  placeOverlay(opts.position)
  return win
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlay
}

export function showOverlay(): void {
  if (!overlay) return
  visible = true
  overlay.showInactive()
  emitVisibility()
}

export function hideOverlay(): void {
  if (!overlay) return
  visible = false
  overlay.hide()
  emitVisibility()
}

export function overlayVisible(): boolean {
  return visible
}

export function setOverlayCollapsed(next: boolean): void {
  if (!overlay) return
  if (collapsed === next) return
  const prev = overlay.getBounds()
  collapsed = next
  overlay.setBounds({
    ...prev,
    width: next ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
    height: next ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT
  })
  emitVisibility()
}

export function toggleOverlayCollapsed(): void {
  setOverlayCollapsed(!collapsed)
}

export function isOverlayCollapsed(): boolean {
  return collapsed
}

export function resizeStart(): void {
  if (!overlay) return
  baseBounds = overlay.getBounds()
}

export function overlayResize(dx: number, dy: number): void {
  if (!overlay || !baseBounds) return
  const width = clamp(baseBounds.width + dx, MIN_WIDTH, MAX_WIDTH)
  const height = clamp(baseBounds.height + dy, MIN_HEIGHT, MAX_HEIGHT)
  overlay.setBounds({ ...baseBounds, width, height })
}

export function resizeEnd(): void {
  baseBounds = null
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function placeOverlay(position: Settings['overlayPosition']): void {
  if (!overlay) return
  const display = screen.getPrimaryDisplay()
  const wa = display.workArea
  const b = overlay.getBounds()
  let x: number
  let y: number
  const pad = 8
  switch (position) {
    case 'bottom-right':
      x = wa.x + wa.width - b.width - pad
      y = wa.y + wa.height - b.height - pad
      break
    case 'bottom-left':
      x = wa.x + pad
      y = wa.y + wa.height - b.height - pad
      break
    case 'top-right':
      x = wa.x + wa.width - b.width - pad
      y = wa.y + pad
      break
    case 'top-left':
    default:
      x = wa.x + pad
      y = wa.y + pad
      break
  }
  overlay.setBounds({ ...b, x, y })
}

function emitVisibility(): void {
  overlay?.webContents.send('overlay:visibility-event', {
    visible,
    collapsed
  })
}

export { MARGIN }
