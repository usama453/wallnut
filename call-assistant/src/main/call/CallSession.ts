import type {
  AskResult,
  AssistantSuggestion,
  CallPhase,
  CallStateSnapshot,
  CallSummary,
  ConversationState,
  SuggestionFrequency,
  Speaker,
  TranscriptChunk
} from '../../shared/types'
import { AudioMixer } from '../audio/AudioMixer'
import { VoiceActivityDetector } from '../audio/VAD'
import { captureScreenFrame, startScreenFrameStream } from '../ai/screen/ScreenCapture'
import type { TranscriptionProvider } from '../transcription/TranscriptionProvider'
import { TranscriptionManager } from '../transcription/TranscriptionManager'
import type { InterimEvent } from '../transcription/TranscriptionManager'
import { ConversationContextManager } from '../ai/context/ConversationContextManager'
import { AssistantManager } from '../ai/assistant/AssistantManager'
import type { ChatClient } from '../ai/assistant/ChatClient'
import { formatChunkTime } from '../ai/assistant/GeneralMeetingAssistant'
import { SUMMARY_SYSTEM_PROMPT, SUMMARY_SCHEMA } from '../ai/prompts/summary'
import type { UsageTracker } from '../ai/usage/UsageTracker'
import { LiveInsightsEngine, type LiveInsight } from '../ai/intent/LiveInsightsEngine'
import { TopicEngine } from '../ai/topic/TopicEngine'
import type { TopicNode } from '../../shared/types'

const SUGGEST_DEBOUNCE_MS = 900

export interface CallSessionEvents {
  onTranscriptChunk(chunk: TranscriptChunk): void
  onInterim(e: InterimEvent): void
  onSuggestion(s: AssistantSuggestion): void
  onAsk(r: AskResult): void
  onSnapshot(s: CallStateSnapshot): void
  onError(message: string): void
  onLevel(db: number): void
  onUsage(u: import('../../shared/types').UsageSnapshot): void
  onLiveInsight(insight: LiveInsight): void
  onTopicNode(node: TopicNode): void
  onScreenFrame(frame: { mimeType: string; dataBase64: string; capturedAt: number }): void
}

export interface CallSessionResult {
  transcript: TranscriptChunk[]
  conversationState: ConversationState
  summary: CallSummary | null
  durationSeconds: number
}

export class CallSession {
  readonly startedAt: number
  private events: CallSessionEvents
  private _phase: CallPhase = 'starting'
  private listening = false
  private _error: string | null = null
  private _latestSuggestion: AssistantSuggestion | null = null
  private _lastAsk: AskResult | null = null
  private transcription: TranscriptionManager | null = null
  private suggestTimer: NodeJS.Timeout | null = null
  private clockTimer: NodeJS.Timeout | null = null
  private mixer = new AudioMixer()
  private context: ConversationContextManager
  private assistant: AssistantManager
  private client: ChatClient
  private model: string
  private lastActiveSource: Speaker = 'unknown'
  private insights: LiveInsightsEngine
  private topics: TopicEngine
  private micVad = new VoiceActivityDetector(-45, 600)
  private systemSuppressed = false
  private stopScreenStream: (() => void) | null = null

  constructor(
    opts: {
      startedAt: number
      client: ChatClient
      model: string
      objective?: string
      screenContext?: boolean
      suggestionFrequency: SuggestionFrequency
      context: ConversationContextManager
      usageTracker: UsageTracker
      events: CallSessionEvents
    }
  ) {
    this.startedAt = opts.startedAt
    this.client = opts.client
    this.model = opts.model
    this.context = opts.context
    this.events = opts.events
    this.assistant = new AssistantManager(opts.client, opts.model)
    this.assistant.setSuggestionFrequency(opts.suggestionFrequency)
    this.insights = new LiveInsightsEngine(opts.client, opts.model)
    this.topics = new TopicEngine(
      opts.client,
      opts.model,
      opts.objective ?? '',
      opts.screenContext ? () => captureScreenFrame() : undefined
    )
    this.topics.onNode((node) => this.events.onTopicNode(node))
    this.mixer.setListener((frame) => this.onFrame(frame))
    this.mixer.setLevelListener((db) => this.events.onLevel(db))
    opts.client.onUsage((u) => {
      opts.usageTracker.add(u)
      this.events.onUsage(opts.usageTracker.getSnapshot())
    })
    this.assistant.onSuggestion((s) => {
      this._latestSuggestion = s
      this.events.onSuggestion(s)
      this.emitSnapshot()
    })
    this.assistant.onAsk((r) => {
      const askResult: AskResult = {
        answer: r.answer,
        type: r.type,
        reasoning: r.reasoning,
        createdAt: Date.now()
      }
      this._lastAsk = askResult
      this.events.onAsk(askResult)
      this.emitSnapshot()
    })
  }

  get isListening(): boolean {
    return this.listening
  }

  get phase(): CallPhase {
    return this._phase
  }

  get latestSuggestion(): AssistantSuggestion | null {
    return this._latestSuggestion
  }

  get lastAsk(): AskResult | null {
    return this._lastAsk
  }

  get error(): string | null {
    return this._error
  }

  setSuggestionFrequency(frequency: SuggestionFrequency): void {
    this.assistant.setSuggestionFrequency(frequency)
  }

  reportError(message: string): void {
    this._error = message
    this.events.onError(message)
    this.emitSnapshot()
  }

  clearError(): void {
    this._error = null
    this.emitSnapshot()
  }

  addCapture(id: string): void {
    this.mixer.addSource(id)
  }

  removeCapture(id: string): void {
    this.mixer.removeSource(id)
  }

  feedAudio(id: string, pcm: Int16Array): void {
    this.lastActiveSource = id === 'mic' ? 'user' : 'other'
    if (id === 'mic') {
      const now = Date.now()
      this.micVad.process(pcm, now)
      this.mixer.feed(id, pcm)
      return
    }
    const micSpeaking = this.micVad.isSpeaking
    if (micSpeaking) {
      if (!this.systemSuppressed) {
        this.systemSuppressed = true
        console.log('[CallSession] Echo gate: suppressing system audio while mic is speaking')
      }
      return
    }
    if (this.systemSuppressed) {
      this.systemSuppressed = false
      console.log('[CallSession] Echo gate: system audio restored')
    }
    this.mixer.feed(id, pcm)
  }

  private onFrame(frame: Int16Array): void {
    if (!this.listening) return
    console.log('[CallSession] onFrame:', frame.length, 'samples, listening:', this.listening, 'transcription:', !!this.transcription)
    this.transcription?.send(frame)
  }

  async start(provider: TranscriptionProvider): Promise<void> {
    this._phase = 'starting'
    this._error = null
    this.emitSnapshot()
    if (this.topics.hasScreenContext() && !this.stopScreenStream) {
      this.stopScreenStream = startScreenFrameStream((frame) => {
        this.events.onScreenFrame({ ...frame, capturedAt: Date.now() })
      })
    }
    const manager = new TranscriptionManager(provider, () => this.currentSpeaker())
    manager.onFinal((chunk) => this.onFinalChunk(chunk))
    manager.onInterim((e) => {
      this.events.onInterim(e)
      this.topics.addInterim(e.text)
    })
    this.transcription = manager
    await manager.start()
    this.listening = true
    this._phase = 'listening'
    this.ensureClock()
    this.emitSnapshot()
  }

  pause(): void {
    this.listening = false
    this.clearSuggestionTimer()
    this.transcription?.stop()
    this.transcription = null
    if (this._phase !== 'finished') {
      this._phase = 'listening'
    }
    this.emitSnapshot()
  }

  private currentSpeaker(): Speaker {
    return this.lastActiveSource
  }

  private onFinalChunk(chunk: TranscriptChunk): void {
    this.context.addChunks([chunk])
    this.events.onTranscriptChunk(chunk)
    this.topics.addChunk(chunk)
    this.processLiveInsight(chunk)
    this.scheduleSuggestion()
  }

  private async processLiveInsight(chunk: TranscriptChunk): Promise<void> {
    try {
      const insight = await this.insights.processChunk(chunk)
      this.events.onLiveInsight(insight)
    } catch {
      // insight failures are non-fatal
    }
  }

  private scheduleSuggestion(): void {
    this.clearSuggestionTimer()
    this.suggestTimer = setTimeout(() => {
      void this.runSuggestion()
    }, SUGGEST_DEBOUNCE_MS)
  }

  private clearSuggestionTimer(): void {
    if (this.suggestTimer) {
      clearTimeout(this.suggestTimer)
      this.suggestTimer = null
    }
  }

  private async runSuggestion(): Promise<void> {
    if (!this.listening) return
    try {
      const s = await this.assistant.maybeSuggest(this.context.getState(), this._latestSuggestion)
      if (s) {
        this._latestSuggestion = s
        this.events.onSuggestion(s)
        this.emitSnapshot()
      }
    } catch {
      // suggestion failures are non-fatal
    } finally {
      void this.context.maybeCompact()
    }
  }

  async requestSuggestion(): Promise<void> {
    if (!this.listening) return
    this.clearSuggestionTimer()
    await this.runSuggestion()
  }

  async ask(question: string): Promise<AskResult> {
    const result = await this.assistant.ask(this.context.getState(), question)
    const askResult: AskResult = {
      answer: result.answer,
      type: result.type,
      reasoning: result.reasoning,
      createdAt: Date.now()
    }
    this._lastAsk = askResult
    this.events.onAsk(askResult)
    this.emitSnapshot()
    return askResult
  }

  private async buildSummary(
    transcript: TranscriptChunk[],
    conversationState: ConversationState,
    durationSeconds: number
  ): Promise<CallSummary | null> {
    const payload = {
      durationSeconds,
      conversationSummary: conversationState.conversationSummary,
      importantFacts: conversationState.importantFacts,
      topics: conversationState.topics,
      unresolvedQuestions: conversationState.unresolvedQuestions,
      userRequests: conversationState.userRequests,
      transcript: transcript.map((c) => ({
        speaker: c.speaker === 'user' ? 'YOU' : 'SPEAKER',
        timeSeconds: formatChunkTime(c, this.startedAt),
        text: c.text
      }))
    }
    const { result: raw } = await this.client.chatJSON({
      model: this.model,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      jsonSchema: SUMMARY_SCHEMA,
      maxTokens: 1000,
      temperature: 0.2
    })
    if (!raw || typeof raw !== 'object') return null
    return {
      durationSeconds,
      mainTopics: toStringArray(raw.mainTopics),
      keyPoints: toStringArray(raw.keyPoints),
      openQuestions: toStringArray(raw.openQuestions),
      importantMoments: Array.isArray(raw.importantMoments)
        ? raw.importantMoments
            .filter((m: unknown): m is { timeSeconds: number; note: string } => !!m && typeof m === 'object' && 'timeSeconds' in m && 'note' in m)
            .map((m: { timeSeconds: number; note: string }) => ({ timeSeconds: Number(m.timeSeconds) || 0, note: String(m.note) }))
        : []
    }
  }

  async end(): Promise<CallSessionResult> {
    this.clearSuggestionTimer()
    if (this.clockTimer) {
      clearInterval(this.clockTimer)
      this.clockTimer = null
    }
    this.listening = false
    this._phase = 'ending'
    this.emitSnapshot()
    this.transcription?.stop()
    this.transcription = null
    this.topics.flush()
    if (this.stopScreenStream) {
      this.stopScreenStream()
      this.stopScreenStream = null
    }
    const durationSeconds = Math.max(0, Math.round((Date.now() - this.startedAt) / 1000))
    const transcript = this.context.getFullTranscript()
    const conversationState = this.context.getState()
    let summary: CallSummary | null = null
    try {
      summary = await this.buildSummary(transcript, conversationState, durationSeconds)
    } catch {
      summary = null
    }
    this._phase = 'finished'
    this.emitSnapshot()
    return { transcript, conversationState, summary, durationSeconds }
  }

  private ensureClock(): void {
    if (this.clockTimer) return
    this.clockTimer = setInterval(() => this.emitSnapshot(), 1000)
  }

  private emitSnapshot(): void {
    const snapshot: CallStateSnapshot = {
      phase: this._phase,
      startedAt: this.startedAt,
      elapsedSeconds: Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000)),
      listening: this.listening,
      latestSuggestion: this._latestSuggestion,
      lastAsk: this._lastAsk,
      error: this._error
    }
    this.events.onSnapshot(snapshot)
  }

  dispose(): void {
    this.clearSuggestionTimer()
    if (this.clockTimer) {
      clearInterval(this.clockTimer)
      this.clockTimer = null
    }
    this.transcription?.stop()
    this.transcription = null
    this.topics.clear()
    if (this.stopScreenStream) {
      this.stopScreenStream()
      this.stopScreenStream = null
    }
    this.mixer.stop()
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
}
