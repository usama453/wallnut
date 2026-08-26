import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { Settings } from '../../shared/types'
import type { CallController } from '../call/CallController'
import type { SessionRepository } from '../storage/sessions/SessionRepository'
import type { SettingsManager } from '../settings/SettingsManager'
import * as overlay from '../windows/OverlayWindow'

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(deps: {
  controller: CallController
  repository: SessionRepository
  settings: SettingsManager
}): void {
  const { controller, repository, settings } = deps

  controller.onEvents({
    onState: (s) => broadcast(IPC.CallStateEvent, s),
    onTranscript: (c) => broadcast(IPC.CallTranscriptEvent, c),
    onInterim: (e) => broadcast(IPC.CallInterimEvent, e),
    onSuggestion: (s) => broadcast(IPC.CallSuggestionEvent, s),
    onAsk: (r) => broadcast(IPC.CallAskResultEvent, r),
    onError: (message) => broadcast(IPC.CallErrorEvent, message),
    onSessionEnded: () => broadcast(IPC.SessionsChangedEvent),
    onLevel: (db) => broadcast(IPC.CallAudioLevel, db),
    onUsage: (u) => broadcast(IPC.CallUsageEvent, u),
    onLiveInsight: (i) => broadcast(IPC.CallLiveInsight, i),
    onTopicNode: (n) => broadcast(IPC.CallTopicNode, n),
    onScreenFrame: (f) => broadcast(IPC.CallScreenFrame, f)
  })

  ipcMain.handle(IPC.AudioListMicrophones, () => controller.listMicrophones())
  ipcMain.handle(IPC.AudioListSystem, () => controller.listSystemAudio())

  ipcMain.handle(IPC.CallStart, (_e, opts) => controller.startCall(opts ?? {}))
  ipcMain.handle(IPC.CallStop, () => controller.stopCall())
  ipcMain.handle(IPC.CallToggleListening, () => controller.toggleListening())
  ipcMain.handle(IPC.CallSwitchMic, (_e, deviceId: string) => controller.switchMic(deviceId))
  ipcMain.handle(IPC.CallGetState, () => controller.getState())
  ipcMain.handle(IPC.AskAi, (_e, question: string) => controller.ask(question))

  ipcMain.handle(IPC.SessionsList, () => repository.list())
  ipcMain.handle(IPC.SessionsGet, (_e, id: string) => repository.get(id))
  ipcMain.handle(IPC.SessionsRemove, async (_e, id: string) => {
    await repository.remove(id)
    broadcast(IPC.SessionsChangedEvent)
  })

  ipcMain.handle(IPC.SettingsGet, () => settings.get())
  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<Settings>) => {
    const next = settings.set(patch)
    controller.applySuggestionFrequency()
    broadcast(IPC.SettingsChangedEvent, next)
    return next
  })

  ipcMain.on(IPC.OverlayCollapse, () => {
    overlay.setOverlayCollapsed(true)
    settings.set({ overlayCollapsed: true })
  })
  ipcMain.on(IPC.OverlayExpand, () => {
    overlay.setOverlayCollapsed(false)
    settings.set({ overlayCollapsed: false })
  })
  ipcMain.on(IPC.OverlaySetCollapsed, (_e, collapsed: boolean) => {
    overlay.setOverlayCollapsed(collapsed)
    settings.set({ overlayCollapsed: collapsed })
  })
  ipcMain.on(IPC.OverlayHide, () => overlay.hideOverlay())
  ipcMain.on(IPC.OverlayShow, () => overlay.showOverlay())
  ipcMain.on(IPC.OverlayResizeStart, () => overlay.resizeStart())
  ipcMain.on(IPC.OverlayResize, (_e, dx: number, dy: number) => overlay.overlayResize(dx, dy))
  ipcMain.on(IPC.OverlayResizeEnd, () => overlay.resizeEnd())
  ipcMain.handle(IPC.OverlayIsVisible, () => overlay.overlayVisible())

  ipcMain.on(IPC.WindowMinimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.WindowClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.on(IPC.AppQuit, () => app.quit())
}
