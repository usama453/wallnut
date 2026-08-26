import { ipcMain, systemPreferences, BrowserWindow } from 'electron'
import { MIC_IPC } from '../../shared/ipc'
import type { AudioSourceInfo } from '../../shared/types'
import type { MicDeviceInfo } from '../../shared/api'
import { getMicBridgeWindow, whenMicBridgeLoaded } from '../windows/MicBridgeWindow'
import type { AudioSource } from './AudioSource'

export class MicBridgeCapture {
  private winPromise: Promise<BrowserWindow> | null = null
  private startedResolvers: Array<(ok: boolean, error?: string) => void> = []
  private listResolvers: Array<(devices: AudioSourceInfo[]) => void> = []
  private chunkListeners = new Set<(pcm: Int16Array) => void>()
  private errorListeners = new Set<(error: Error) => void>()
  private cachedDevices: AudioSourceInfo[] = []
  private registered = false

  constructor() {
    this.registerHandlers()
  }

  private registerHandlers(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.on(MIC_IPC.Started, (_e, result: { ok: boolean; error?: string }) => {
      const r = this.startedResolvers.shift()
      r?.(result?.ok, result?.error)
    })

    ipcMain.on(MIC_IPC.Devices, (_e, list: MicDeviceInfo[]) => {
      const devices = (list || []).map((d, i) => ({
        id: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
        kind: 'microphone' as const,
        default: i === 0
      }))
      this.cachedDevices = devices
      this.listResolvers.shift()?.(devices)
    })

    ipcMain.on(MIC_IPC.Chunk, (_e, buf: ArrayBuffer) => {
      if (!buf || buf.byteLength === 0) return
      const pcm = new Int16Array(buf)
      console.log('[MicBridgeCapture] Received chunk:', pcm.length, 'samples')
      this.chunkListeners.forEach((l) => l(pcm))
    })

    ipcMain.on(MIC_IPC.Error, (_e, message: string) => {
      const err = new Error(message || 'Microphone capture failed.')
      this.errorListeners.forEach((l) => l(err))
    })
  }

  private ensureWindow(): Promise<BrowserWindow> {
    if (!this.winPromise) {
      this.winPromise = (async () => {
        const win = getMicBridgeWindow()
        await whenMicBridgeLoaded()
        return win
      })()
    }
    return this.winPromise
  }

  private send(channel: string, payload?: unknown): void {
    this.winPromise?.then((win) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    })
  }

  async listMicrophones(): Promise<AudioSourceInfo[]> {
    await this.ensureWindow()
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.cachedDevices), 6000)
      this.listResolvers.push((devices) => {
        clearTimeout(timer)
        resolve(devices)
      })
      this.send(MIC_IPC.List)
    })
  }

  createSource(deviceId: string | null, label: string): AudioSource {
    const source: AudioSource = {
      kind: 'microphone',
      id: deviceId || 'default',
      label,
      start: () => this.startCapture(deviceId),
      stop: async () => {
        this.send(MIC_IPC.Stop)
      },
      onChunk: (cb) => {
        this.chunkListeners.add(cb)
        return () => this.chunkListeners.delete(cb)
      },
      onError: (cb) => {
        this.errorListeners.add(cb)
        return () => this.errorListeners.delete(cb)
      }
    }
    return source
  }

  private async startCapture(deviceId: string | null): Promise<void> {
    const win = await this.ensureWindow()
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (!granted) throw new Error('Microphone access was denied.')
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Microphone did not start in time.')), 8000)
      this.startedResolvers.push((ok, error) => {
        clearTimeout(timer)
        if (ok) resolve()
        else reject(new Error(error || 'Microphone failed to start.'))
      })
      win.webContents.send(MIC_IPC.Start, deviceId || '')
    })
  }

  stopAll(): void {
    this.send(MIC_IPC.Stop)
    this.chunkListeners.clear()
  }
}
