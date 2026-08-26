import type { ChatClient, ChatJSONOptions, ChatResult } from './ChatClient'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function stripUnsupportedProps(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripUnsupportedProps)
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'additionalProperties' || k === 'strict') continue
      out[k] = stripUnsupportedProps(v)
    }
    return out
  }
  return obj
}

export class GeminiClient implements ChatClient {
  private apiKey: () => string
  private usageListeners = new Set<(u: { promptTokens: number; completionTokens: number }) => void>()

  constructor(apiKey: string | (() => string)) {
    this.apiKey = typeof apiKey === 'function' ? apiKey : () => apiKey
  }

  onUsage(cb: (u: { promptTokens: number; completionTokens: number }) => void): void {
    this.usageListeners.add(cb)
  }

  async chatJSON(opts: ChatJSONOptions): Promise<ChatResult> {
    const key = this.apiKey()
    if (!key) throw new Error('Gemini API key is not set.')
    const url = `${GEMINI_BASE}/models/${opts.model}:generateContent?key=${key}`

    const contents = opts.messages.map((m, i) => {
      const parts: Array<Record<string, unknown>> = [{ text: m.content }]
      if (opts.image && i === opts.messages.length - 1) {
        parts.push({ inline_data: { mime_type: opts.image.mimeType, data: opts.image.dataBase64 } })
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      }
    })

    const body: Record<string, unknown> = {
      contents,
      systemInstruction: { role: 'user', parts: [{ text: opts.system }] },
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 800,
        responseMimeType: 'application/json'
      }
    }
    if (opts.jsonSchema) {
      ;(body.generationConfig as Record<string, unknown>).responseSchema = stripUnsupportedProps(opts.jsonSchema.schema)
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`Gemini API error ${res.status}${detail ? `: ${detail}` : ''}`)
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty response from Gemini.')
    const usageMeta = data?.usageMetadata
    const usage = usageMeta
      ? { promptTokens: usageMeta.promptTokenCount ?? 0, completionTokens: usageMeta.candidatesTokenCount ?? 0 }
      : undefined
    if (usage) this.usageListeners.forEach((l) => l(usage))
    return { result: JSON.parse(text), usage }
  }
}

