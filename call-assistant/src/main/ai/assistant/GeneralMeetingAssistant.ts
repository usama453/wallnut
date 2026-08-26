import type {
  AssistantSuggestion,
  ConversationState,
  SuggestionPriority,
  SuggestionType,
  TranscriptChunk
} from '../../../shared/types'
import { ASSISTANT_SYSTEM_PROMPT } from '../prompts/system'
import { SUGGESTION_SCHEMA } from '../prompts/summary'
import type { ChatClient } from './ChatClient'
import type { AnswerResult, AssistantStrategy } from './AssistantStrategy'

interface SuggestionPayload {
  should_intervene: boolean
  type: string
  priority: string
  title: string
  content: string
  reason: string
  confidence: number
}

export class GeneralMeetingAssistant implements AssistantStrategy {
  readonly name = 'general-meeting'

  constructor(
    private client: ChatClient,
    private model: string
  ) {}

  async analyze(
    conversation: ConversationState,
    lastSuggestion?: AssistantSuggestion | null
  ): Promise<AssistantSuggestion | null> {
    const context = buildContextPayload(conversation, lastSuggestion)
    const { result: raw } = await this.client.chatJSON({
      model: this.model,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(context) }],
      jsonSchema: SUGGESTION_SCHEMA,
      maxTokens: 500,
      temperature: 0.4
    })
    return normalizeSuggestion(raw)
  }

  async answerQuestion(
    conversation: ConversationState,
    question: string
  ): Promise<AnswerResult> {
    const context = buildContextPayload(conversation, null)
    const { result: raw } = await this.client.chatJSON({
      model: this.model,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: JSON.stringify(context) },
        {
          role: 'user',
          content: `The user asks: "${question}".\nAnswer the question using only the conversation context and common knowledge. If you are uncertain, say so. If the answer is something the user might say aloud, write it in their voice and keep it short. Begin with the answer itself — no preamble.`
        }
      ],
      jsonSchema: {
        name: 'answer',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            reasoning: { type: 'string' }
          },
          required: ['answer', 'reasoning'],
          additionalProperties: false
        }
      },
      maxTokens: 600,
      temperature: 0.3
    })
    return {
      answer: raw?.answer ?? '',
      reasoning: raw?.reasoning,
      type: 'answer'
    }
  }
}

function buildContextPayload(
  conversation: ConversationState,
  lastSuggestion?: AssistantSuggestion | null
): Record<string, unknown> {
  return {
    recentTranscript: conversation.recentTranscript.map((c) => ({
      speaker: c.speaker === 'user' ? 'YOU' : 'SPEAKER',
      time: formatClockTime(c.timestamp),
      text: c.text
    })),
    conversationSummary: conversation.conversationSummary,
    importantFacts: conversation.importantFacts,
    topics: conversation.topics,
    unresolvedQuestions: conversation.unresolvedQuestions,
    userRequests: conversation.userRequests,
    lastSuggestion: lastSuggestion?.content
      ? `${lastSuggestion.title ?? ''}: ${lastSuggestion.content}`
      : null
  }
}

export function normalizeSuggestion(raw: SuggestionPayload | null): AssistantSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const shouldIntervene = !!raw.should_intervene
  const type = (['answer', 'suggestion', 'clarification', 'warning', 'information', 'summary'].includes(
    raw.type
  )
    ? raw.type
    : 'information') as SuggestionType
  const priority = (['low', 'medium', 'high'].includes(raw.priority)
    ? raw.priority
    : 'medium') as SuggestionPriority
  const content = String(raw.content ?? '').trim()
  return {
    shouldIntervene,
    type,
    priority,
    title: String(raw.title ?? '').trim(),
    content,
    reason: String(raw.reason ?? '').trim(),
    confidence: typeof raw.confidence === 'number' ? clamp01(raw.confidence) : undefined
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function formatChunkTime(chunk: TranscriptChunk, callStartMs: number): number {
  return Math.max(0, Math.floor((chunk.timestamp - callStartMs) / 1000))
}

function formatClockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
