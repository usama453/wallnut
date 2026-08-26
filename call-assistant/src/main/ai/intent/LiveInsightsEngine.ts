import type { ChatClient } from '../assistant/ChatClient'
import type { TranscriptChunk } from '../../../shared/types'
import { detectIntent, shouldTriggerDeepAnalysis, type DetectedIntent } from './IntentDetector'
import { IntentClassifier, type ClassifiedIntent } from './IntentClassifier'

export interface LiveInsight {
  intent: DetectedIntent
  classification: ClassifiedIntent | null
  deepAnalysis: string | null
  timestamp: number
}

export class LiveInsightsEngine {
  private classifier: IntentClassifier
  private recentChunks: TranscriptChunk[] = []
  private maxChunks = 20
  private lastClassifyAt = 0
  private lastDeepAt = 0

  constructor(
    private client: ChatClient,
    private model: string
  ) {
    this.classifier = new IntentClassifier(client, model)
  }

  async processChunk(chunk: TranscriptChunk): Promise<LiveInsight> {
    this.recentChunks.push(chunk)
    if (this.recentChunks.length > this.maxChunks) {
      this.recentChunks = this.recentChunks.slice(-this.maxChunks)
    }

    const intent = detectIntent(chunk.text)
    let classification: ClassifiedIntent | null = null
    let deepAnalysis: string | null = null

    if (intent.confidence >= 0.3 && Date.now() - this.lastClassifyAt > 15000) {
      this.lastClassifyAt = Date.now()
      classification = await this.classifier.classify(chunk.text)
    }

    if (shouldTriggerDeepAnalysis(intent) && Date.now() - this.lastDeepAt > 30000) {
      this.lastDeepAt = Date.now()
      deepAnalysis = await this.generateDeepAnalysis(chunk.text, intent)
    }

    return {
      intent,
      classification,
      deepAnalysis,
      timestamp: Date.now()
    }
  }

  private async generateDeepAnalysis(text: string, intent: DetectedIntent): Promise<string | null> {
    const context = this.recentChunks
      .map((c) => `${c.speaker}: ${c.text}`)
      .join('\n')

    const prompt = `You are a sales coaching AI analyzing a live conversation.

Recent context:
${context}

Current statement: "${text}"
Detected intent: ${intent.type}
Confidence: ${intent.confidence}

Provide a concise analysis with:
1. What they mean (1 sentence)
2. Why it matters (1 sentence)
3. Recommended response (2-3 sentences)
4. Possible next routes (2-3 bullet points)

Keep it brief and actionable.`

    try {
      const response = await this.client.chatJSON({
        model: this.model,
        system: prompt,
        messages: [{ role: 'user', content: 'Analyze this conversation moment.' }],
        jsonSchema: {
          name: 'deep_analysis',
          schema: {
            type: 'object',
            properties: {
              whatTheyMean: { type: 'string' },
              whyItMatters: { type: 'string' },
              recommendedResponse: { type: 'string' },
              possibleRoutes: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        temperature: 0.3
      })

      if (!response) return null
      return JSON.stringify(response, null, 2)
    } catch {
      return null
    }
  }

  getRecentContext(): TranscriptChunk[] {
    return [...this.recentChunks]
  }

  clear(): void {
    this.recentChunks = []
  }
}
