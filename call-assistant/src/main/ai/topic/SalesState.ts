import type { DetectedSignal } from './SalesSignalDetector'

export interface SalesConversationState {
  currentTopic: string
  previousTopics: string[]
  salesStage: string
  objective: string
  painPoints: string[]
  objections: string[]
  interests: string[]
  competitors: string[]
  decisionCriteria: string[]
  buyingSignals: string[]
  unansweredQuestions: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
  lastMeaningfulSignal: string | null
  currentRecommendation: string | null
}

export function emptySalesState(): SalesConversationState {
  return {
    currentTopic: '',
    previousTopics: [],
    salesStage: 'discovery',
    objective: '',
    painPoints: [],
    objections: [],
    interests: [],
    competitors: [],
    decisionCriteria: [],
    buyingSignals: [],
    unansweredQuestions: [],
    sentiment: 'neutral',
    lastMeaningfulSignal: null,
    currentRecommendation: null
  }
}

export function updateSalesState(
  state: SalesConversationState,
  signal: DetectedSignal | null,
  text: string
): void {
  if (!signal) return
  const snippet = trimSnippet(text)
  if (!snippet) return
  state.lastMeaningfulSignal = `${signal.type}: ${snippet}`
  state.sentiment = signal.sentiment
  switch (signal.type) {
    case 'pain_point':
      pushUnique(state.painPoints, snippet)
      break
    case 'objection':
    case 'pricing_discussion':
    case 'uncertainty':
    case 'rejection':
      pushUnique(state.objections, snippet)
      break
    case 'buying_signal':
    case 'interest':
    case 'commitment':
      pushUnique(state.buyingSignals, snippet)
      break
    case 'competitor_mention':
      pushUnique(state.competitors, snippet)
      break
    case 'decision_criterion':
      pushUnique(state.decisionCriteria, snippet)
      break
    case 'question':
      pushUnique(state.unansweredQuestions, snippet)
      break
    default:
      break
  }
}

export function setSalesTopic(
  state: SalesConversationState,
  topic: string
): void {
  const t = topic.trim()
  if (!t || t === state.currentTopic) return
  if (state.currentTopic) {
    pushUnique(state.previousTopics, state.currentTopic)
  }
  state.currentTopic = t
}

export function stateToPrompt(state: SalesConversationState): string {
  const parts: string[] = []
  parts.push(`Stage: ${state.salesStage || 'discovery'}`)
  if (state.currentTopic) parts.push(`Topic: ${state.currentTopic}`)
  if (state.objective) parts.push(`Objective: ${state.objective}`)
  if (state.painPoints.length) parts.push(`Pain points: ${state.painPoints.join(' | ')}`)
  if (state.objections.length) parts.push(`Objections: ${state.objections.join(' | ')}`)
  if (state.buyingSignals.length) parts.push(`Buying signals: ${state.buyingSignals.join(' | ')}`)
  if (state.competitors.length) parts.push(`Competitors: ${state.competitors.join(' | ')}`)
  if (state.decisionCriteria.length) parts.push(`Decision criteria: ${state.decisionCriteria.join(' | ')}`)
  if (state.unansweredQuestions.length) parts.push(`Open questions: ${state.unansweredQuestions.join(' | ')}`)
  parts.push(`Sentiment: ${state.sentiment}`)
  if (state.previousTopics.length) parts.push(`Previous topics: ${state.previousTopics.join(' > ')}`)
  if (state.lastMeaningfulSignal) parts.push(`Last signal: ${state.lastMeaningfulSignal}`)
  return parts.join('\n')
}

function pushUnique(list: string[], value: string): void {
  const v = value.trim()
  if (!v) return
  if (list.includes(v)) return
  list.push(v)
  if (list.length > 6) list.shift()
}

function trimSnippet(text: string): string {
  const t = text.trim()
  if (t.length <= 90) return t
  return `${t.slice(0, 90)}…`
}