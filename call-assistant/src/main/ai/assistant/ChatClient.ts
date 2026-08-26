export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface JSONSchema {
  name: string
  strict?: boolean
  schema: Record<string, unknown>
}

export interface ChatJSONOptions {
  model: string
  system: string
  messages: ChatMessage[]
  jsonSchema?: JSONSchema
  maxTokens?: number
  temperature?: number
  image?: { mimeType: string; dataBase64: string }
}

export interface ChatResult {
  result: any
  usage?: { promptTokens: number; completionTokens: number }
}

export interface ChatClient {
  chatJSON(opts: ChatJSONOptions): Promise<ChatResult>
  onUsage(cb: (usage: { promptTokens: number; completionTokens: number }) => void): void
}
