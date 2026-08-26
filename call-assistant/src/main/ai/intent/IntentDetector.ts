export type IntentType =
  | 'question'
  | 'objection'
  | 'pain_point'
  | 'buying_signal'
  | 'competitor_mention'
  | 'pricing_discussion'
  | 'feature_request'
  | 'small_talk'
  | 'closing_signal'
  | 'general'

export interface DetectedIntent {
  type: IntentType
  confidence: number
  keywords: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
  timestamp: number
}

const KEYWORDS: Record<IntentType, string[]> = {
  objection: [
    'but', 'however', 'problem', 'issue', 'concern', 'worried', 'difficult',
    'expensive', 'not sure', 'hesitant', 'already have', 'switch', 'change'
  ],
  pain_point: [
    'struggling', 'frustrated', 'wasting', 'inefficient', 'broken', 'slow',
    'pain', 'annoying', 'time-consuming', 'manual', 'error', 'mistake'
  ],
  question: [
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can you',
    'could you', 'would you', 'do you', 'does it', 'is there'
  ],
  buying_signal: [
    'interested', 'sounds good', 'like to', 'try', 'demo', 'pilot',
    'next steps', 'move forward', 'pricing', 'contract', 'timeline'
  ],
  competitor_mention: [
    'hubspot', 'salesforce', 'pipedrive', 'zoho', 'freshsales', 'close',
    'copper', 'monday', 'notion', 'airtable'
  ],
  pricing_discussion: [
    'cost', 'price', 'pricing', 'budget', 'expensive', 'cheap', 'afford',
    'roi', 'value', 'worth', 'invest', 'save'
  ],
  feature_request: [
    'need', 'want', 'wish', 'should have', 'must have', 'require',
    'looking for', 'support', 'integration', 'api', 'automate'
  ],
  small_talk: [
    'hello', 'hi', 'hey', 'thanks', 'thank you', 'good', 'great',
    'awesome', 'perfect', 'nice', 'weather', 'weekend', 'holiday'
  ],
  closing_signal: [
    'decision', 'deadline', 'timeline', 'urgency', 'asap', 'immediately',
    'right away', 'today', 'this week', 'end of quarter', 'fiscal'
  ],
  general: []
}

const SENTIMENT_WORDS = {
  positive: ['great', 'good', 'awesome', 'perfect', 'love', 'excellent', 'amazing', 'fantastic', 'wonderful'],
  negative: ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'frustrated', 'annoyed', 'angry']
}

export function detectIntent(text: string): DetectedIntent {
  const lower = text.toLowerCase()

  let bestIntent: IntentType = 'general'
  let bestConfidence = 0
  let bestKeywords: string[] = []

  for (const [intent, keywords] of Object.entries(KEYWORDS) as [IntentType, string[]][]) {
    const matches = keywords.filter((kw) => lower.includes(kw))
    if (matches.length > bestConfidence) {
      bestConfidence = matches.length
      bestIntent = intent
      bestKeywords = matches
    }
  }

  const confidence = Math.min(bestConfidence / 3, 1)

  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
  const posCount = SENTIMENT_WORDS.positive.filter((w) => lower.includes(w)).length
  const negCount = SENTIMENT_WORDS.negative.filter((w) => lower.includes(w)).length
  if (posCount > negCount) sentiment = 'positive'
  else if (negCount > posCount) sentiment = 'negative'

  return {
    type: bestIntent,
    confidence,
    keywords: bestKeywords,
    sentiment,
    timestamp: Date.now()
  }
}

export function shouldTriggerDeepAnalysis(intent: DetectedIntent): boolean {
  return intent.type !== 'general' && intent.type !== 'small_talk' && intent.confidence >= 0.3
}
