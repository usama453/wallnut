import type {
  AskResult,
  AssistantSuggestion,
  CallStartOptions,
  CallStartResult,
  CallStateSnapshot,
  CallSessionRecord,
  TranscriptChunk,
  UsageSnapshot,
  LiveInsight,
  TopicNode
} from '../../shared/types'
import { SettingsManager } from '../settings/SettingsManager'
import { MicBridgeCapture } from '../audio/MicBridgeCapture'
import { createSystemAudioSource, listSystemAudioSources } from '../audio/SystemAudioCapture'
import type { AudioSource } from '../audio/AudioSource'
import type { AudioSourceInfo } from '../../shared/types'
import type { ChatClient } from '../ai/assistant/ChatClient'
import { ConversationContextManager } from '../ai/context/ConversationContextManager'
import { createTranscriptionProvider } from '../transcription/TranscriptionProvider'
import { CallSession } from './CallSession'
import type { SessionRepository } from '../storage/sessions/SessionRepository'
import { UsageTracker } from '../ai/usage/UsageTracker'

export interface CallControllerEvents {
  onState(s: CallStateSnapshot): void
  onTranscript(chunk: TranscriptChunk): void
  onInterim(e: { segmentId: string; text: string }): void
  onSuggestion(s: AssistantSuggestion): void
  onAsk(r: AskResult): void
  onError(message: string): void
  onSessionEnded(recordId: string): void
  onLevel(db: number): void
  onUsage(u: UsageSnapshot): void
  onLiveInsight(i: LiveInsight): void
  onTopicNode(n: TopicNode): void
  onScreenFrame(f: { mimeType: string; dataBase64: string; capturedAt: number }): void
}

export class CallController {
  private session: CallSession | null = null
  private micSource: AudioSource | null = null
  private systemSource: AudioSource | null = null
  private events?: CallControllerEvents
  private usageTracker = new UsageTracker()

  constructor(
    private settings: SettingsManager,
    private micBridge: MicBridgeCapture,
    private repository: SessionRepository,
    private buildClient: () => ChatClient,
    private buildModel: () => string
  ) {}

  onEvents(events: CallControllerEvents): void {
    this.events = events
  }

  get isActive(): boolean {
    return !!this.session
  }

  applySuggestionFrequency(): void {
    this.session?.setSuggestionFrequency(this.settings.effective().suggestionFrequency)
  }

  async listMicrophones(): Promise<AudioSourceInfo[]> {
    return this.micBridge.listMicrophones()
  }

  async listSystemAudio(): Promise<AudioSourceInfo[]> {
    return listSystemAudioSources()
  }

  async startCall(opts: CallStartOptions): Promise<CallStartResult> {
    if (this.session) {
      return { ok: false, error: 'A call is already in progress.' }
    }
    const settings = this.settings.effective()
    const micId = opts.microphoneId ?? settings.microphoneId
    const sysId = opts.systemAudioId ?? settings.systemAudioId
    const micEnabled = micId !== undefined && micId !== '' && micId !== 'none'
    const sysEnabled = sysId !== undefined && sysId !== '' && sysId !== 'none'
    if (!micEnabled && !sysEnabled) {
      return { ok: false, error: 'Select a microphone or system audio source to start a call.' }
    }

    const client = this.buildClient()
    const model = this.buildModel()
    const context = new ConversationContextManager(client, model)
    this.usageTracker.resetSession()
    this.usageTracker.setModel(model)

    let provider
    try {
provider = createTranscriptionProvider(settings.transcriptionProvider, {
        deepgramApiKey: settings.deepgramApiKey,
        openaiApiKey: settings.openaiApiKey,
        openaiModel: settings.openaiModel,
        openaiRealtimeModel: 'gpt-4o-realtime-preview',
        geminiApiKey: settings.geminiApiKey
      })
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    const session = new CallSession({
      startedAt: Date.now(),
      client,
      model,
      objective: settings.salesObjective,
      screenContext: settings.screenContextEnabled,
      suggestionFrequency: settings.suggestionFrequency,
      context,
      usageTracker: this.usageTracker,
      events: {
        onTranscriptChunk: (chunk) => this.events?.onTranscript(chunk),
        onInterim: (e) => this.events?.onInterim({ segmentId: e.segmentId ?? 'live', text: e.text }),
        onSuggestion: (s) => this.events?.onSuggestion(s),
        onAsk: (r) => this.events?.onAsk(r),
        onSnapshot: (s) => this.events?.onState(s),
        onError: (message) => this.events?.onError(message),
        onLevel: (db) => this.events?.onLevel(db),
        onUsage: (u) => this.events?.onUsage(u),
        onLiveInsight: (i) => this.events?.onLiveInsight(i),
        onTopicNode: (n) => this.events?.onTopicNode(n),
        onScreenFrame: (f) => this.events?.onScreenFrame(f)
      }
    })
    this.session = session

    try {
      await session.start(provider)
    } catch (err) {
      session.dispose()
      this.session = null
      return { ok: false, error: (err as Error).message }
    }

    try {
      if (micEnabled) {
        const source = this.micBridge.createSource(micId, 'Microphone')
        await this.attachSource('mic', source)
      }
      if (sysEnabled) {
        const source = await createSystemAudioSource(sysId, 'System Audio')
        await this.attachSource('system', source)
      }
    } catch (err) {
      this.stopCaptures()
      session.dispose()
      this.session = null
      return { ok: false, error: (err as Error).message }
    }

    return { ok: true }
  }

  private async attachSource(id: string, source: AudioSource): Promise<void> {
    if (id === 'mic') {
      this.micSource = source
    } else {
      this.systemSource = source
    }
    source.onChunk((pcm) => this.session?.feedAudio(id, pcm))
    source.onError((err) => this.session?.reportError(err.message))
    this.session?.addCapture(id)
    await source.start()
  }

  private stopCaptures(): void {
    void this.micSource?.stop()
    void this.systemSource?.stop()
    this.micSource = null
    this.systemSource = null
  }

  async stopCall(): Promise<CallStartResult> {
    const session = this.session
    if (!session) return { ok: false, error: 'No active call.' }
    this.stopCaptures()
    this.session = null
    let result
    try {
      result = await session.end()
    } catch (err) {
      session.dispose()
      return { ok: false, error: (err as Error).message }
    }
    session.dispose()
    const settings = this.settings.effective()
    const record: CallSessionRecord = {
      id: newId(),
      name: defaultCallName(),
      createdAt: session.startedAt,
      endedAt: Date.now(),
      durationSeconds: result.durationSeconds,
      transcript: result.transcript,
      conversationState: result.conversationState,
      summary: result.summary,
      audioSources: { microphone: settings.microphoneId || null, systemAudio: settings.systemAudioId || null }
    }
    try {
      await this.repository.save(record)
      this.events?.onSessionEnded(record.id)
    } catch {
      // saving a session must not break the call UI
    }
    return { ok: true }
  }

  async getState(): Promise<CallStateSnapshot | null> {
    const s = this.session
    if (!s) return null
    return {
      phase: s.phase,
      startedAt: s.startedAt,
      elapsedSeconds: Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)),
      listening: s.isListening,
      latestSuggestion: s.latestSuggestion,
      lastAsk: s.lastAsk,
      error: s.error
    }
  }

  async switchMic(deviceId: string): Promise<CallStartResult> {
    const s = this.session
    if (!s) return { ok: false, error: 'No active call.' }
    try {
      void this.micSource?.stop()
      const source = this.micBridge.createSource(deviceId, 'Microphone')
      await this.attachSource('mic', source)
      this.settings.set({ microphoneId: deviceId })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  async toggleListening(): Promise<CallStartResult> {
    const s = this.session
    if (!s) return { ok: false, error: 'No active call.' }
    if (s.isListening) {
      s.pause()
      this.stopCaptures()
      return { ok: true }
    }
    const settings = this.settings.effective()
    const micEnabled = settings.microphoneId && settings.microphoneId !== 'none'
    const sysEnabled = settings.systemAudioId && settings.systemAudioId !== 'none'
    try {
      const provider = createTranscriptionProvider(settings.transcriptionProvider, {
        deepgramApiKey: settings.deepgramApiKey,
        openaiApiKey: settings.openaiApiKey,
        openaiModel: settings.openaiModel,
        openaiRealtimeModel: 'gpt-4o-realtime-preview',
        geminiApiKey: settings.geminiApiKey
      })
      await s.start(provider)
      if (micEnabled && !this.micSource) {
        const source = this.micBridge.createSource(settings.microphoneId, 'Microphone')
        await this.attachSource('mic', source)
      }
      if (sysEnabled && !this.systemSource) {
        const source = await createSystemAudioSource(settings.systemAudioId, 'System Audio')
        await this.attachSource('system', source)
      }
      return { ok: true }
    } catch (err) {
      this.stopCaptures()
      s.pause()
      return { ok: false, error: (err as Error).message }
    }
  }

  async ask(question: string): Promise<AskResult | null> {
    const s = this.session
    if (!s) return null
    return s.ask(question)
  }

  async requestSuggestion(): Promise<void> {
    await this.session?.requestSuggestion()
  }
}

function newId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function defaultCallName(): string {
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `Call ${date} ${time}`
}
