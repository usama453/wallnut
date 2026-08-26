import type { ChatClient } from '../assistant/ChatClient'
import type { Speaker, TopicNode, TranscriptChunk } from '../../../shared/types'
import { uid } from '../../../shared/utils'
import { markLatency } from '../../../shared/latency'
import { detectSignal, templateRoutes, type DetectedSignal } from './SalesSignalDetector'
import {
  emptySalesState,
  setSalesTopic,
  stateToPrompt,
  updateSalesState,
  type SalesConversationState
} from './SalesState'
import type { ScreenFrame } from '../screen/ScreenCapture'

const MAX_WINDOW_WORDS = 120
const SIGNAL_DEBOUNCE_MS = 300
const REQUEST_COOLDOWN_MS = 4000
const MAX_SIGNAL_GAP_MS = 2000

interface TopicAnalysis {
  topic: string
  routes: string[]
}

interface DeepAnalysis {
  routeDetails: Array<{
    route: string
    why: string
    suggestedResponse: string
    predictedReaction: string
    nextBranch: string
    confidence: number
  }>
  strategy: string
  risks: string[]
}

const FAST_PROMPT = `You are a sales navigator analyzing a live conversation.

Current conversation state:
{state}

Latest exchange:
{text}

A screenshot of the conversation participants' shared screen is attached as the final part. Use what is visible on it (documents, presentations, dashboards, websites) to sharpen the topic and routes. Do not mention the screenshot in your JSON.

Respond with a single JSON object only. Do not add any other text.
Use this exact structure:
{"topic": "short 4-5 word topic", "routes": ["route a", "route b", "route c"]}

"topic" must be 4-5 words naming what is being discussed right now.
"routes" must have exactly 3 items, each a possible next move in 3-6 words.`

const DEEP_PROMPT = `You are a sales strategist. A live conversation is in progress.

Current conversation state:
{state}

Topic: {topic}
Candidate routes: {routes}

A screenshot of the shared screen is attached as the final part. Use what is visible on it to ground the route reasons, suggested responses and strategy. Do not mention the screenshot in your JSON.

Respond with a single JSON object only. Do not add any other text.
Use this exact structure:
{"routeDetails": [{"route": "exact route text", "why": "one sentence why this route", "suggestedResponse": "one short line the salesperson could say", "predictedReaction": "short predicted prospect reaction", "nextBranch": "likely next topic after this route", "confidence": 0.0-1.0}], "strategy": "one sentence overall strategy", "risks": ["one risk", "another risk"]}

"routeDetails" must have exactly 3 items matching the candidate routes. Keep every field short.`

export class TopicEngine {
  private window: string[] = []
  private chunkLog: TranscriptChunk[] = []
  private lastSignal: DetectedSignal | null = null
  private lastSignalAt = 0
  private debounceTimer: NodeJS.Timeout | null = null
  private lastNodeAt = 0
  private lastEmitVersion = 0
  private state: SalesConversationState
  private listeners = new Set<(n: TopicNode) => void>()

  constructor(
    private client: ChatClient,
    private model: string,
    objective = '',
    private screenProvider?: () => Promise<ScreenFrame | null>
  ) {
    this.state = emptySalesState()
    this.state.objective = objective
  }

  onNode(cb: (n: TopicNode) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  hasScreenContext(): boolean {
    return !!this.screenProvider
  }

  addInterim(text: string): void {
    this.pushWords(text)
    this.processSignal(text)
  }

  addChunk(chunk: TranscriptChunk): void {
    this.chunkLog.push(chunk)
    if (this.chunkLog.length > 40) this.chunkLog.shift()
    this.pushWords(chunk.text)
    this.processSignal(chunk.text)
  }

  private pushWords(text: string): void {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return
    this.window = this.window.concat(words).slice(-MAX_WINDOW_WORDS)
  }

  private processSignal(text: string): void {
    const signal = detectSignal(text, this.lastSignal?.text)
    if (!signal) return
    updateSalesState(this.state, signal, text)
    const now = Date.now()
    const sameSignal = this.lastSignal?.type === signal.type
    const withinGap = now - this.lastSignalAt < MAX_SIGNAL_GAP_MS
    if (sameSignal && withinGap) return
    this.lastSignal = signal
    this.lastSignalAt = now
    markLatency('signal-detected', signal.type)
    this.scheduleEmit(signal)
  }

  private scheduleEmit(signal: DetectedSignal): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.emitNode(signal)
    }, SIGNAL_DEBOUNCE_MS)
  }

  private async emitNode(signal: DetectedSignal): Promise<void> {
    if (Date.now() - this.lastNodeAt < REQUEST_COOLDOWN_MS) return
    const now = Date.now()
    const version = this.lastEmitVersion + 1
    this.lastEmitVersion = version
    this.lastNodeAt = now
    const window = [...this.window]
    const chunks = [...this.chunkLog]
    const text = window.join(' ')
    const speaker = dominantSpeaker(chunks)
    const fastRoutes = templateRoutes(signal.type)
    const topic = this.fallbackTopic(window)
    const node: TopicNode = {
      id: uid('topic'),
      topic,
      routes: fastRoutes,
      text,
      chunks,
      speaker,
      startTime: chunks[0]?.timestamp ?? now,
      endTime: now,
      isActive: true,
      signal: signal.type,
      provisional: true,
      version
    }
    markLatency('node-emitted-template', `${signal.type} | v${version}`)
    this.listeners.forEach((l) => l(node))
    void this.refineNode(node, version, text)
  }

  private async refineNode(
    node: TopicNode,
    version: number,
    text: string
  ): Promise<void> {
    markLatency('ai-fast-request-started', `v${version}`)
    const analysis = await this.analyzeFast(text)
    if (version !== this.lastEmitVersion || !analysis) {
      if (version === this.lastEmitVersion) {
        void this.deepReason(node, version)
      }
      return
    }
    markLatency('ai-fast-response-received', `v${version}`)
    setSalesTopic(this.state, analysis.topic)
    const refined: TopicNode = {
      ...node,
      topic: analysis.topic || node.topic,
      routes: analysis.routes.length >= 2 ? analysis.routes : node.routes,
      provisional: false,
      endTime: Date.now()
    }
    markLatency('node-emitted-refined', `v${version}`)
    this.listeners.forEach((l) => l(refined))
    void this.deepReason(refined, version)
  }

  private async deepReason(node: TopicNode, version: number): Promise<void> {
    await sleep(800)
    if (version !== this.lastEmitVersion) return
    markLatency('ai-deep-request-started', `v${version}`)
    const deep = await this.analyzeDeep(node)
    if (version !== this.lastEmitVersion || !deep) return
    markLatency('ai-deep-response-received', `v${version}`)
    if (deep.strategy) this.state.currentRecommendation = deep.strategy
    const updated: TopicNode = {
      ...node,
      detail: {
        routeDetails: deep.routeDetails,
        strategy: deep.strategy,
        risks: deep.risks
      },
      endTime: Date.now()
    }
    markLatency('node-updated-deep', `v${version}`)
    this.listeners.forEach((l) => l(updated))
  }

  private fallbackTopic(words: string[]): string {
    const significant = words.filter((w) => w.length > 3)
    const pick = (significant.length >= 5 ? significant : words).slice(-5)
    return pick.join(' ') || 'Conversation'
  }

  private async analyzeFast(text: string): Promise<TopicAnalysis | null> {
    const prompt = FAST_PROMPT.replace('{state}', stateToPrompt(this.state)).replace('{text}', text)
    const screen = this.screenProvider ? await this.screenProvider() : null
    try {
      const res = await this.client.chatJSON({
        model: this.model,
        system: prompt,
        messages: [{ role: 'user', content: 'Return the JSON now.' }],
        maxTokens: 250,
        temperature: 0.3,
        image: screen ?? undefined
      })
      if (!res?.result) return null
      const r = res.result as Record<string, unknown>
      return {
        topic: ((r.topic as string) || '').trim(),
        routes: ((r.routes as string[]) || []).map((x) => x.trim()).filter(Boolean)
      }
    } catch (err) {
      console.log('[TopicEngine] fast analysis failed:', (err as Error).message)
      return null
    }
  }

  private async analyzeDeep(node: TopicNode): Promise<DeepAnalysis | null> {
    const prompt = DEEP_PROMPT.replace('{state}', stateToPrompt(this.state))
      .replace('{topic}', node.topic)
      .replace('{routes}', JSON.stringify(node.routes))
    const screen = this.screenProvider ? await this.screenProvider() : null
    try {
      const res = await this.client.chatJSON({
        model: this.model,
        system: prompt,
        messages: [{ role: 'user', content: 'Return the JSON now.' }],
        maxTokens: 900,
        temperature: 0.4,
        image: screen ?? undefined
      })
      if (!res?.result) return null
      const r = res.result as Record<string, unknown>
      const raw = (r.routeDetails as Array<Record<string, unknown>>) || []
      const routeDetails = raw
        .filter((d) => d && typeof d === 'object' && typeof d.route === 'string')
        .map((d) => ({
          route: d.route as string,
          why: String(d.why ?? ''),
          suggestedResponse: String(d.suggestedResponse ?? ''),
          predictedReaction: String(d.predictedReaction ?? ''),
          nextBranch: String(d.nextBranch ?? ''),
          confidence: Number(d.confidence) || 0.5
        }))
      if (routeDetails.length < 2) return null
      return {
        routeDetails,
        strategy: String(r.strategy ?? ''),
        risks: ((r.risks as string[]) || []).filter((x) => typeof x === 'string')
      }
    } catch (err) {
      console.log('[TopicEngine] deep analysis failed:', (err as Error).message)
      return null
    }
  }

  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.window = []
    this.chunkLog = []
    this.lastSignal = null
    this.lastSignalAt = 0
    this.lastNodeAt = 0
    this.lastEmitVersion = 0
    this.state = emptySalesState()
  }
}

function dominantSpeaker(chunks: TranscriptChunk[]): Speaker {
  const counts: Record<string, number> = {}
  for (const c of chunks) {
    counts[c.speaker] = (counts[c.speaker] || 0) + 1
  }
  let best: Speaker = 'unknown'
  let bestCount = 0
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) {
      best = k as Speaker
      bestCount = v
    }
  }
  return best
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}