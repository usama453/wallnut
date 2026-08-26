import type { ConversationState, TranscriptChunk } from '../../../shared/types'
import { CONTEXT_COMPACTION_PROMPT, CONTEXT_SCHEMA } from '../prompts/context'
import type { ChatClient } from '../assistant/ChatClient'

const RECENT_WINDOW_MS = 3 * 60 * 1000
const MIN_CHUNKS_BEFORE_COMPACT = 24
const COMPACT_INTERVAL_MS = 2 * 60 * 1000

export class ConversationContextManager {
  private allChunks: TranscriptChunk[] = []
  private recentTranscript: TranscriptChunk[] = []
  private importantFacts: string[] = []
  private topics: string[] = []
  private unresolvedQuestions: string[] = []
  private userRequests: string[] = []
  private conversationSummary = ''
  private compactedAt = 0
  private lastCompactionFailedAt = 0
  private compacting = false

  constructor(
    private client: ChatClient,
    private model: string
  ) {}

  addChunks(chunks: TranscriptChunk[]): void {
    if (!chunks.length) return
    this.allChunks.push(...chunks)
    this.recentTranscript.push(...chunks)
    const cutoff = Date.now() - RECENT_WINDOW_MS
    while (this.recentTranscript.length && this.recentTranscript[0].timestamp < cutoff) {
      this.recentTranscript.shift()
    }
  }

  getState(): ConversationState {
    return {
      recentTranscript: [...this.recentTranscript],
      importantFacts: [...this.importantFacts],
      topics: [...this.topics],
      unresolvedQuestions: [...this.unresolvedQuestions],
      userRequests: [...this.userRequests],
      conversationSummary: this.conversationSummary
    }
  }

  getFullTranscript(): TranscriptChunk[] {
    return [...this.allChunks]
  }

  reset(): void {
    this.allChunks = []
    this.recentTranscript = []
    this.importantFacts = []
    this.topics = []
    this.unresolvedQuestions = []
    this.userRequests = []
    this.conversationSummary = ''
    this.compactedAt = 0
    this.lastCompactionFailedAt = 0
  }

  async maybeCompact(): Promise<void> {
    if (this.compacting) return
    if (this.allChunks.length < MIN_CHUNKS_BEFORE_COMPACT) return
    if (Date.now() - this.compactedAt < COMPACT_INTERVAL_MS) return
    if (Date.now() - this.lastCompactionFailedAt < COMPACT_INTERVAL_MS) return
    this.compacting = true
    try {
      const payload = {
        existingSummary: this.conversationSummary,
        existingFacts: this.importantFacts,
        existingTopics: this.topics,
        existingQuestions: this.unresolvedQuestions,
        existingRequests: this.userRequests,
        newChunks: this.allChunks
          .slice(-24)
          .map((c) => ({ speaker: c.speaker, time: c.timestamp, text: c.text }))
      }
      const { result: raw } = await this.client.chatJSON({
        model: this.model,
        system: CONTEXT_COMPACTION_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        jsonSchema: CONTEXT_SCHEMA,
        maxTokens: 1200,
        temperature: 0.1
      })
      if (raw && typeof raw === 'object') {
        this.conversationSummary = String(raw.conversationSummary ?? '').trim() || this.conversationSummary
        this.importantFacts = cleanStringArray(raw.importantFacts, this.importantFacts)
        this.topics = cleanStringArray(raw.topics, this.topics)
        this.unresolvedQuestions = cleanStringArray(raw.unresolvedQuestions, this.unresolvedQuestions)
        this.userRequests = cleanStringArray(raw.userRequests, this.userRequests)
        this.compactedAt = Date.now()
      }
    } catch {
      this.lastCompactionFailedAt = Date.now()
    } finally {
      this.compacting = false
    }
  }
}

function cleanStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const cleaned = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
  return cleaned.length ? cleaned : fallback
}
