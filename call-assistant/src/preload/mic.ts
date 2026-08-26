import { contextBridge, ipcRenderer } from 'electron'
import { MIC_IPC } from '../shared/ipc'
import type { MicBridgeApi } from '../shared/api'

const api: MicBridgeApi = {
  onStart: (cb) => ipcRenderer.on(MIC_IPC.Start, (_e, deviceId: string) => cb(deviceId)),
  onStop: (cb) => ipcRenderer.on(MIC_IPC.Stop, () => cb()),
  onList: (cb) => ipcRenderer.on(MIC_IPC.List, () => cb()),
  started: (result) => ipcRenderer.send(MIC_IPC.Started, result),
  stopped: () => ipcRenderer.send(MIC_IPC.Stopped),
  devices: (list) => ipcRenderer.send(MIC_IPC.Devices, list),
  chunk: (data) => ipcRenderer.send(MIC_IPC.Chunk, data),
  error: (message) => ipcRenderer.send(MIC_IPC.Error, message)
}

contextBridge.exposeInMainWorld('micBridge', api)
