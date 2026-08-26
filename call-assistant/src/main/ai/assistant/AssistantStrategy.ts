import type { AssistantSuggestion, ConversationState } from '../../../shared/types'

export interface AnswerResult {
  answer: string
  reasoning?: string
  type?: string
}

export interface AssistantStrategy {
  readonly name: string
  analyze(conversation: ConversationState, lastSuggestion?: AssistantSuggestion | null): Promise<AssistantSuggestion | null>
  answerQuestion(conversation: ConversationState, question: string): Promise<AnswerResult>
}
