import type { AssistantSuggestion, ConversationState } from '../../../shared/types'
import type { SuggestionFrequency } from '../../../shared/types'
import type { ChatClient } from './ChatClient'
import { GeneralMeetingAssistant } from './GeneralMeetingAssistant'
import type { AnswerResult, AssistantStrategy } from './AssistantStrategy'

const COOLDOWN_BY_FREQUENCY: Record<SuggestionFrequency, number> = {
  low: 45000,
  medium: 25000,
  high: 12000
}

export class AssistantManager {
  private strategy: AssistantStrategy
  private lastSuggestionAt = 0
  private lastSuggestionContent = ''
  private cooldownMs = COOLDOWN_BY_FREQUENCY.medium
  private suggestionListeners = new Set<(s: AssistantSuggestion) => void>()
  private askListeners = new Set<(r: AnswerResult) => void>()

  constructor(client: ChatClient, model: string) {
    this.strategy = new GeneralMeetingAssistant(client, model)
  }

  setSuggestionFrequency(frequency: SuggestionFrequency): void {
    this.cooldownMs = COOLDOWN_BY_FREQUENCY[frequency]
  }

  async maybeSuggest(
    ctx: ConversationState,
    lastSuggestion?: AssistantSuggestion | null
  ): Promise<AssistantSuggestion | null> {
    if (Date.now() - this.lastSuggestionAt < this.cooldownMs) return null
    const s = await this.strategy.analyze(ctx, lastSuggestion)
    if (!s || !s.shouldIntervene || !s.content) return null
    if (s.content.trim() === this.lastSuggestionContent) return null
    this.lastSuggestionAt = Date.now()
    this.lastSuggestionContent = s.content.trim()
    s.createdAt = Date.now()
    this.suggestionListeners.forEach((l) => l(s))
    return s
  }

  async ask(ctx: ConversationState, question: string): Promise<AnswerResult> {
    const r = await this.strategy.answerQuestion(ctx, question)
    this.lastSuggestionAt = Date.now()
    this.askListeners.forEach((l) => l(r))
    return r
  }

  reset(): void {
    this.lastSuggestionAt = 0
    this.lastSuggestionContent = ''
  }

  onSuggestion(cb: (s: AssistantSuggestion) => void): () => void {
    this.suggestionListeners.add(cb)
    return () => this.suggestionListeners.delete(cb)
  }

  onAsk(cb: (r: AnswerResult) => void): () => void {
    this.askListeners.add(cb)
    return () => this.askListeners.delete(cb)
  }
}
