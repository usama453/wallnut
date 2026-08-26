import type {
  AssistantSuggestion,
  AudioSourceInfo,
  CallSessionRecord,
  CallStartOptions,
  CallStartResult,
  CallStateSnapshot,
  AskResult,
  LiveInsight,
  SessionListItem,
  Settings,
  TopicNode,
  TranscriptChunk,
  UsageSnapshot
} from './types'

export interface MicDeviceInfo {
  deviceId: string
  label: string
}

export interface ScreenFrameEvent {
  mimeType: string
  dataBase64: string
  capturedAt: number
}

export interface MicBridgeApi {
  onStart(cb: (deviceId: string) => void): void
  onStop(cb: () => void): void
  onList(cb: () => void): void
  started(result: { ok: boolean; error?: string }): void
  stopped(): void
  devices(list: MicDeviceInfo[]): void
  chunk(data: ArrayBuffer): void
  error(message: string): void
}

export interface RendererApi {
  audio: {
    listMicrophones(): Promise<AudioSourceInfo[]>
    listSystemAudio(): Promise<AudioSourceInfo[]>
  }
  call: {
    start(opts: CallStartOptions): Promise<CallStartResult>
    stop(): Promise<CallStartResult>
    toggleListening(): Promise<CallStartResult>
    getState(): Promise<CallStateSnapshot | null>
    ask(question: string): Promise<AskResult | null>
    onState(cb: (s: CallStateSnapshot) => void): () => void
    onTranscript(cb: (chunk: TranscriptChunk) => void): () => void
    onInterim(cb: (e: { segmentId: string; text: string }) => void): () => void
    onSuggestion(cb: (s: AssistantSuggestion) => void): () => void
    onAskResult(cb: (r: AskResult) => void): () => void
    onError(cb: (message: string) => void): () => void
    onAudioLevel(cb: (level: number) => void): () => void
    onUsage(cb: (usage: UsageSnapshot) => void): () => void
    onLiveInsight(cb: (insight: LiveInsight) => void): () => void
    onTopicNode(cb: (node: TopicNode) => void): () => void
    onScreenFrame(cb: (f: ScreenFrameEvent) => void): () => void
    switchMic(deviceId: string): Promise<CallStartResult>
  }
  sessions: {
    list(): Promise<SessionListItem[]>
    get(id: string): Promise<CallSessionRecord | null>
    remove(id: string): Promise<void>
    onChanged(cb: () => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    onChanged(cb: (s: Settings) => void): () => void
  }
  overlay: {
    collapse(): void
    expand(): void
    setCollapsed(collapsed: boolean): void
    hide(): void
    show(): void
    resizeStart(): void
    resize(dx: number, dy: number): void
    resizeEnd(): void
    isVisible(): Promise<boolean>
    onVisibility(cb: (v: { visible: boolean; collapsed: boolean }) => void): () => void
  }
  window: {
    minimize(): void
    close(): void
  }
  app: {
    quit(): void
  }
}
