import type { ChatClient } from '../assistant/ChatClient'
import type { IntentType } from './IntentDetector'

export interface ClassifiedIntent {
  type: IntentType
  confidence: number
  sentiment: 'positive' | 'neutral' | 'negative'
  summary: string
  painPoints: string[]
  opportunities: string[]
  suggestedFollowUp: string
  timestamp: number
}

const CLASSIFICATION_PROMPT = `You are analyzing a sales conversation transcript. Classify the intent and provide a brief analysis.

Transcript chunk: "{text}"

Respond with JSON (no markdown):
{
  "type": "question|objection|pain_point|buying_signal|competitor_mention|pricing_discussion|feature_request|small_talk|closing_signal|general",
  "confidence": 0.0-1.0,
  "sentiment": "positive|neutral|negative",
  "summary": "1 sentence summary",
  "painPoints": ["pain point 1"] or [],
  "opportunities": ["opportunity 1"] or [],
  "suggestedFollowUp": "suggested next thing to say"
}`

export class IntentClassifier {
  constructor(
    private client: ChatClient,
    private model: string
  ) {}

  async classify(text: string): Promise<ClassifiedIntent | null> {
    if (!text.trim()) return null

    try {
      const response = await this.client.chatJSON({
        model: this.model,
        system: CLASSIFICATION_PROMPT.replace('{text}', text),
        messages: [{ role: 'user', content: `Classify this transcript chunk: "${text}"` }],
        jsonSchema: {
          name: 'intent_classification',
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              confidence: { type: 'number' },
              sentiment: { type: 'string' },
              summary: { type: 'string' },
              painPoints: { type: 'array', items: { type: 'string' } },
              opportunities: { type: 'array', items: { type: 'string' } },
              suggestedFollowUp: { type: 'string' }
            }
          }
        },
        temperature: 0.1
      })

      if (!response?.result) return null

      const r = response.result as Record<string, unknown>
      return {
        type: (r.type as IntentType) || 'general',
        confidence: (r.confidence as number) || 0.5,
        sentiment: (r.sentiment as 'positive' | 'neutral' | 'negative') || 'neutral',
        summary: (r.summary as string) || '',
        painPoints: (r.painPoints as string[]) || [],
        opportunities: (r.opportunities as string[]) || [],
        suggestedFollowUp: (r.suggestedFollowUp as string) || '',
        timestamp: Date.now()
      }
    } catch {
      return null
    }
  }
}
