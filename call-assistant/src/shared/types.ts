export type Speaker = 'user' | 'other' | 'unknown'

export interface TranscriptChunk {
  id: string
  speaker: Speaker
  text: string
  timestamp: number
  isFinal: boolean
  segmentId?: string
}

export interface RouteDetail {
  route: string
  why: string
  suggestedResponse: string
  predictedReaction: string
  nextBranch: string
  confidence: number
}

export interface TopicNode {
  id: string
  topic: string
  routes: string[]
  text: string
  chunks: TranscriptChunk[]
  speaker: Speaker
  startTime: number
  endTime: number
  isActive: boolean
  signal?: string
  provisional?: boolean
  version: number
  detail?: {
    routeDetails: RouteDetail[]
    strategy: string
    risks: string[]
  } | null
}

export type CallPhase = 'idle' | 'starting' | 'listening' | 'ending' | 'finished'

export interface AudioSourceInfo {
  id: string
  label: string
  kind: 'microphone' | 'system'
  default?: boolean
}

export type SuggestionType =
  | 'answer'
  | 'suggestion'
  | 'clarification'
  | 'warning'
  | 'information'
  | 'summary'

export type SuggestionPriority = 'low' | 'medium' | 'high'
export type SuggestionFrequency = 'low' | 'medium' | 'high'

export interface AssistantSuggestion {
  shouldIntervene: boolean
  type?: SuggestionType
  priority?: SuggestionPriority
  title?: string
  content?: string
  reason?: string
  confidence?: number
  createdAt?: number
}

export interface ConversationState {
  recentTranscript: TranscriptChunk[]
  importantFacts: string[]
  topics: string[]
  unresolvedQuestions: string[]
  userRequests: string[]
  conversationSummary: string
}

export interface ImportantMoment {
  timeSeconds: number
  note: string
}

export interface CallSummary {
  durationSeconds: number
  mainTopics: string[]
  keyPoints: string[]
  openQuestions: string[]
  importantMoments: ImportantMoment[]
}

export interface CallSessionRecord {
  id: string
  name: string
  createdAt: number
  endedAt: number
  durationSeconds: number
  transcript: TranscriptChunk[]
  conversationState: ConversationState
  summary: CallSummary | null
  audioSources: { microphone: string | null; systemAudio: string | null }
}

export interface SessionListItem {
  id: string
  name: string
  createdAt: number
  durationSeconds: number
  summary: CallSummary | null
  transcriptLength: number
}

export interface AskResult {
  answer: string
  type?: string
  reasoning?: string
  createdAt: number
}

export interface CallStateSnapshot {
  phase: CallPhase
  startedAt: number | null
  elapsedSeconds: number
  listening: boolean
  latestSuggestion: AssistantSuggestion | null
  lastAsk: AskResult | null
  error: string | null
}

export type AiProvider = 'openai' | 'gemini'

export interface Settings {
  aiProvider: AiProvider
  openaiApiKey: string
  openaiModel: string
  geminiApiKey: string
  geminiModel: string
  transcriptionProvider: 'deepgram' | 'openai' | 'gemini'
  deepgramApiKey: string
  microphoneId: string
  systemAudioId: string
  suggestionFrequency: SuggestionFrequency
  overlayPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme: 'dark' | 'light'
  overlayCollapsed: boolean
  overlayAlwaysOnTop: boolean
  salesObjective: string
  screenContextEnabled: boolean
}

export interface CallStartOptions {
  microphoneId?: string
  systemAudioId?: string
}

export interface CallStartResult {
  ok: boolean
  error?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface UsageSnapshot {
  session: TokenUsage
  total: TokenUsage
  estimatedCostUsd: number
  model: string
}

export interface LiveInsight {
  intent: {
    type: string
    confidence: number
    keywords: string[]
    sentiment: 'positive' | 'neutral' | 'negative'
    timestamp: number
  }
  classification: {
    type: string
    confidence: number
    sentiment: 'positive' | 'neutral' | 'negative'
    summary: string
    painPoints: string[]
    opportunities: string[]
    suggestedFollowUp: string
    timestamp: number
  } | null
  deepAnalysis: string | null
  timestamp: number
}
