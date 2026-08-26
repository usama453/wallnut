import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { RendererApi } from '../shared/api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RendererApi = {
  audio: {
    listMicrophones: () => ipcRenderer.invoke(IPC.AudioListMicrophones),
    listSystemAudio: () => ipcRenderer.invoke(IPC.AudioListSystem)
  },
  call: {
    start: (opts) => ipcRenderer.invoke(IPC.CallStart, opts),
    stop: () => ipcRenderer.invoke(IPC.CallStop),
    toggleListening: () => ipcRenderer.invoke(IPC.CallToggleListening),
    getState: () => ipcRenderer.invoke(IPC.CallGetState),
    ask: (question) => ipcRenderer.invoke(IPC.AskAi, question),
    onState: (cb) => subscribe(IPC.CallStateEvent, cb),
    onTranscript: (cb) => subscribe(IPC.CallTranscriptEvent, cb),
    onInterim: (cb) => subscribe(IPC.CallInterimEvent, cb),
    onSuggestion: (cb) => subscribe(IPC.CallSuggestionEvent, cb),
    onAskResult: (cb) => subscribe(IPC.CallAskResultEvent, cb),
    onError: (cb) => subscribe(IPC.CallErrorEvent, cb),
    onAudioLevel: (cb) => subscribe(IPC.CallAudioLevel, cb),
    onUsage: (cb) => subscribe(IPC.CallUsageEvent, cb),
    onLiveInsight: (cb) => subscribe(IPC.CallLiveInsight, cb),
    onTopicNode: (cb) => subscribe(IPC.CallTopicNode, cb),
    onScreenFrame: (cb) => subscribe(IPC.CallScreenFrame, cb),
    switchMic: (deviceId) => ipcRenderer.invoke(IPC.CallSwitchMic, deviceId)
  },
  sessions: {
    list: () => ipcRenderer.invoke(IPC.SessionsList),
    get: (id) => ipcRenderer.invoke(IPC.SessionsGet, id),
    remove: (id) => ipcRenderer.invoke(IPC.SessionsRemove, id),
    onChanged: (cb) => subscribe(IPC.SessionsChangedEvent, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
    onChanged: (cb) => subscribe(IPC.SettingsChangedEvent, cb)
  },
  overlay: {
    collapse: () => ipcRenderer.send(IPC.OverlayCollapse),
    expand: () => ipcRenderer.send(IPC.OverlayExpand),
    setCollapsed: (collapsed) =>
      ipcRenderer.send(IPC.OverlaySetCollapsed, collapsed),
    hide: () => ipcRenderer.send(IPC.OverlayHide),
    show: () => ipcRenderer.send(IPC.OverlayShow),
    resizeStart: () => ipcRenderer.send(IPC.OverlayResizeStart),
    resize: (dx, dy) => ipcRenderer.send(IPC.OverlayResize, dx, dy),
    resizeEnd: () => ipcRenderer.send(IPC.OverlayResizeEnd),
    isVisible: () => ipcRenderer.invoke(IPC.OverlayIsVisible),
    onVisibility: (cb) => subscribe(IPC.OverlayVisibilityEvent, cb)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.WindowMinimize),
    close: () => ipcRenderer.send(IPC.WindowClose)
  },
  app: {
    quit: () => ipcRenderer.send(IPC.AppQuit)
  }
}

contextBridge.exposeInMainWorld('api', api)
