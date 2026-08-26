import { create } from 'zustand'
import type {
  CallStartOptions,
  CallStartResult,
  CallStateSnapshot,
  LiveInsight,
  TopicNode,
  TranscriptChunk,
  UsageSnapshot
} from '@shared/types'
import type { ScreenFrameEvent } from '@shared/api'
import { markLatency } from '@shared/latency'

const IDLE_SNAPSHOT: CallStateSnapshot = {
  phase: 'idle',
  startedAt: null,
  elapsedSeconds: 0,
  listening: false,
  latestSuggestion: null,
  lastAsk: null,
  error: null
}

interface CallStore {
  state: CallStateSnapshot
  transcript: TranscriptChunk[]
  interims: Record<string, string>
  audioLevel: number
  usage: UsageSnapshot | null
  liveInsight: LiveInsight | null
  topicNodes: TopicNode[]
  screenFrame: ScreenFrameEvent | null
  screenSharing: boolean
  initialized: boolean
  init(): Promise<void>
  subscribe(): () => void
  start(opts?: CallStartOptions): Promise<CallStartResult>
  stop(): Promise<CallStartResult>
  toggleListening(): Promise<CallStartResult>
  switchMic(deviceId: string): Promise<CallStartResult>
  ask(question: string): Promise<void>
  resetInterims(): void
  clearError(): void
}

export const useCallStore = create<CallStore>((set, get) => ({
  state: IDLE_SNAPSHOT,
  transcript: [],
  interims: {},
  audioLevel: -60,
  usage: null,
  liveInsight: null,
  topicNodes: [],
  screenFrame: null,
  screenSharing: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })
    const current = await window.api.call.getState()
    if (current) {
      set({ state: current })
      if (current.phase === 'starting') set({ transcript: [] })
    }
  },

  subscribe: () => {
    const offs = [
      window.api.call.onState((s) => {
        if (s.phase === 'starting') {
          set({ transcript: [], interims: {}, topicNodes: [] })
        }
        set({ state: s })
      }),
      window.api.call.onTranscript((chunk) => {
        const current = get().transcript
        if (current.some((c) => c.id === chunk.id)) return
        set({ transcript: [...current, chunk] })
      }),
      window.api.call.onInterim((e) => {
        set((prev) => ({
          interims: { ...prev.interims, [e.segmentId || 'live']: e.text }
        }))
      }),
      window.api.call.onAskResult((r) => {
        set((prev) => ({ state: { ...prev.state, lastAsk: r } }))
      }),
      window.api.call.onError((message) => {
        set((prev) => ({ state: { ...prev.state, error: message } }))
      }),
      window.api.call.onAudioLevel((db) => {
        set({ audioLevel: db })
      }),
      window.api.call.onUsage((u) => {
        set({ usage: u })
      }),
      window.api.call.onLiveInsight((i) => {
        set({ liveInsight: i })
      }),
      window.api.call.onTopicNode((n) => {
        markLatency('renderer-received-node', `v${n.version}`)
        set((prev) => {
          const idx = prev.topicNodes.findIndex((x) => x.id === n.id)
          if (idx === -1) {
            const nodes = [...prev.topicNodes, n]
            const prevNodes = nodes.slice(0, -1).map((x) => (x.isActive ? { ...x, isActive: false } : x))
            return { topicNodes: [...prevNodes, { ...n, isActive: true }] }
          }
          const nodes = prev.topicNodes.map((x, i) =>
            i === idx ? { ...n, isActive: true } : x.isActive ? { ...x, isActive: false } : x
          )
          return { topicNodes: nodes }
        })
      }),
      window.api.call.onScreenFrame((f) => {
        set({ screenFrame: f, screenSharing: true })
      })
    ]
    return () => offs.forEach((off) => off())
  },

  start: async (opts) => {
    const res = await window.api.call.start(opts ?? {})
    if (!res.ok) {
      set((prev) => ({ state: { ...prev.state, error: res.error ?? 'Could not start call.' } }))
    }
    return res
  },

  stop: async () => {
    const res = await window.api.call.stop()
    if (!res.ok) {
      set((prev) => ({ state: { ...prev.state, error: res.error ?? 'Could not stop call.' } }))
    }
    return res
  },

  toggleListening: async () => {
    const res = await window.api.call.toggleListening()
    if (!res.ok) {
      set((prev) => ({ state: { ...prev.state, error: res.error ?? 'Could not change listening state.' } }))
    }
    return res
  },

  switchMic: async (deviceId) => {
    const res = await window.api.call.switchMic(deviceId)
    if (!res.ok) {
      set((prev) => ({ state: { ...prev.state, error: res.error ?? 'Could not switch microphone.' } }))
    }
    return res
  },

  ask: async (question) => {
    await window.api.call.ask(question)
  },

  resetInterims: () => set({ interims: {} }),

  clearError: () => set((prev) => ({ state: { ...prev.state, error: null } }))
}))
