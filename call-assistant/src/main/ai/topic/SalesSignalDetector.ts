export type SignalType =
  | 'objection'
  | 'question'
  | 'pain_point'
  | 'buying_signal'
  | 'competitor_mention'
  | 'pricing_discussion'
  | 'decision_criterion'
  | 'commitment'
  | 'uncertainty'
  | 'rejection'
  | 'interest'
  | 'topic_change'
  | 'thought_boundary'

export interface DetectedSignal {
  type: SignalType
  confidence: number
  keywords: string[]
  text: string
  timestamp: number
  sentiment: 'positive' | 'neutral' | 'negative'
}

const KEYWORDS: Record<SignalType, string[]> = {
  objection: [
    'but', 'however', 'problem', 'issue', 'concern', 'worried', 'difficult',
    'expensive', 'not sure', 'hesitant', 'already have', 'switch', 'change',
    'too much', 'can\'t afford', 'don\'t think', 'doesn\'t work', 'won\'t work'
  ],
  question: [
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can you',
    'could you', 'would you', 'do you', 'does it', 'is there', 'is it',
    'are you', 'have you', 'tell me', 'explain'
  ],
  pain_point: [
    'struggling', 'frustrated', 'wasting', 'inefficient', 'broken', 'slow',
    'pain', 'annoying', 'time-consuming', 'manual', 'error', 'mistake',
    'takes forever', 'hard to', 'difficult to', 'problem with'
  ],
  buying_signal: [
    'interested', 'sounds good', 'like to', 'try', 'demo', 'pilot',
    'next steps', 'move forward', 'pricing', 'contract', 'timeline',
    'let\'s do it', 'let us', 'we can do', 'works for us'
  ],
  competitor_mention: [
    'hubspot', 'salesforce', 'pipedrive', 'zoho', 'freshsales', 'close',
    'copper', 'monday', 'notion', 'airtable', 'competitor', 'other tool',
    'we use', 'we\'re using', 'currently using'
  ],
  pricing_discussion: [
    'cost', 'price', 'pricing', 'budget', 'expensive', 'cheap', 'afford',
    'roi', 'value', 'worth', 'invest', 'save', 'per month', 'per seat',
    'how much', 'quote'
  ],
  decision_criterion: [
    'need to see', 'require', 'must have', 'important that', 'key factor',
    'deciding', 'criteria', 'needs', 'looking for', 'has to', 'have to'
  ],
  commitment: [
    'we\'ll', 'i will', 'let\'s do', 'commit', 'agree', 'approved',
    'sign', 'move ahead', 'go ahead', 'finalize', 'done deal', 'locked in'
  ],
  uncertainty: [
    'maybe', 'perhaps', 'not sure', 'unsure', 'depends', 'might',
    'could be', 'i think', 'question mark', 'need to think', 'think about it'
  ],
  rejection: [
    'not interested', 'no thanks', 'don\'t need', 'not for us', 'pass',
    'we\'re fine', 'stop', 'unsubscribe', 'no budget', 'can\'t do it',
    'no way', 'forget it'
  ],
  interest: [
    'love that', 'like that', 'sounds great', 'excited', 'looking forward',
    'want to learn', 'tell me more', 'that\'s great', 'that works'
  ],
  topic_change: [
    'anyway', 'moving on', 'next thing', 'by the way', 'on another note',
    'let\'s talk about', 'switching', 'different topic', 'another question'
  ],
  thought_boundary: [
    'so anyway', 'okay so', 'alright', 'right', 'um', 'uh', 'well',
    'let me think', 'so', 'anyway', 'basically'
  ]
}

const SIGNAL_ORDER: SignalType[] = [
  'rejection',
  'objection',
  'pricing_discussion',
  'pain_point',
  'commitment',
  'buying_signal',
  'interest',
  'competitor_mention',
  'decision_criterion',
  'uncertainty',
  'question',
  'topic_change',
  'thought_boundary'
]

export function detectSignal(text: string, previousText?: string): DetectedSignal | null {
  const lower = text.toLowerCase()
  let best: SignalType | null = null
  let bestMatches = 0
  let bestKeywords: string[] = []
  for (const type of SIGNAL_ORDER) {
    const matches = KEYWORDS[type].filter((kw) => lower.includes(kw))
    if (matches.length > bestMatches) {
      best = type
      bestMatches = matches.length
      bestKeywords = matches
    }
  }
  if (!best || bestMatches === 0) {
    if (previousText && textChangedTopic(text, previousText)) {
      return {
        type: 'topic_change',
        confidence: 0.5,
        keywords: [],
        text,
        timestamp: Date.now(),
        sentiment: 'neutral'
      }
    }
    return null
  }
  const confidence = Math.min(0.35 + bestMatches * 0.2, 0.95)
  const sentiment =
    best === 'rejection' || best === 'objection' || best === 'pain_point' || best === 'uncertainty'
      ? 'negative'
      : best === 'buying_signal' || best === 'interest' || best === 'commitment'
        ? 'positive'
        : 'neutral'
  return {
    type: best,
    confidence,
    keywords: bestKeywords,
    text,
    timestamp: Date.now(),
    sentiment
  }
}

function textChangedTopic(text: string, previous: string): boolean {
  const a = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
  const b = new Set(previous.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
  if (a.size < 6) return false
  let overlap = 0
  for (const w of a) if (b.has(w)) overlap++
  return overlap / a.size < 0.15
}

export interface RouteTemplate {
  signal: SignalType
  routes: string[]
}

const ROUTE_TEMPLATES: Record<SignalType, string[]> = {
  pricing_discussion: [
    'Acknowledge budget concern',
    'Present value vs. cost',
    'Offer flexible pricing option',
    'Ask about budget range'
  ],
  competitor_mention: [
    'Ask what they like about it',
    'Differentiate your strengths',
    'Offer comparison data',
    'Acknowledge competitor honestly'
  ],
  uncertainty: [
    'Reassure and clarify concerns',
    'Summarize key benefits again',
    'Offer a low-risk trial',
    'Ask what is holding them back'
  ],
  rejection: [
    'Respect the decision gracefully',
    'Ask for the real reason',
    'Offer a smaller commitment',
    'Propose a future check-in'
  ],
  objection: [
    'Acknowledge the concern',
    'Ask a clarifying question',
    'Reframe around value',
    'Propose a small next step'
  ],
  question: [
    'Answer directly and concisely',
    'Confirm understanding',
    'Bridge to a benefit',
    'Offer to go deeper'
  ],
  pain_point: [
    'Empathize with the pain',
    'Quantify the cost of inaction',
    'Connect to your solution',
    'Suggest a next step'
  ],
  buying_signal: [
    'Confirm interest explicitly',
    'Propose next steps',
    'Offer a demo or trial',
    'Discuss implementation timeline'
  ],
  decision_criterion: [
    'Map criterion to capability',
    'Ask about other criteria',
    'Share proof and evidence',
    'Propose evaluation steps'
  ],
  commitment: [
    'Confirm the commitment',
    'Outline immediate next steps',
    'Align on timeline',
    'Remove remaining blockers'
  ],
  interest: [
    'Encourage and reinforce',
    'Offer a demo or sample',
    'Move to concrete next steps',
    'Ask about decision process'
  ],
  topic_change: [
    'Acknowledge the shift',
    'Note the prior topic',
    'Pivot to the new topic',
    'Keep thread for follow-up'
  ],
  thought_boundary: [
    'Let them finish the thought',
    'Summarize what was said',
    'Ask a follow-up question',
    'Move to the next point'
  ]
}

export function templateRoutes(type: SignalType): string[] {
  return ROUTE_TEMPLATES[type] || ROUTE_TEMPLATES.topic_change
}