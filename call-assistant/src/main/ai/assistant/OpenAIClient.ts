import type { ChatClient, ChatJSONOptions, ChatResult } from './ChatClient'

export type { ChatMessage, JSONSchema, ChatJSONOptions } from './ChatClient'
export type { ChatClient } from './ChatClient'

export class OpenAIClient implements ChatClient {
  private apiKey: () => string
  private usageListeners = new Set<(u: { promptTokens: number; completionTokens: number }) => void>()

  constructor(apiKey: string | (() => string)) {
    this.apiKey = typeof apiKey === 'function' ? apiKey : () => apiKey
  }

  onUsage(cb: (u: { promptTokens: number; completionTokens: number }) => void): void {
    this.usageListeners.add(cb)
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey()}`
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = j?.error?.message || ''
      } catch {
        // ignore
      }
      throw new Error(`OpenAI API error ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return res.json()
  }

  async chatJSON(opts: ChatJSONOptions): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 800,
      response_format: {
        type: 'json_object'
      }
    }
    if (opts.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: opts.jsonSchema.name,
          strict: opts.jsonSchema.strict ?? true,
          schema: opts.jsonSchema.schema
        }
      }
    }
    const data = await this.post('chat/completions', body)
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty response from OpenAI.')
    const usageData = data?.usage
    const usage = usageData
      ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0 }
      : undefined
    if (usage) this.usageListeners.forEach((l) => l(usage))
    return { result: JSON.parse(content), usage }
  }
}
