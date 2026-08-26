import type { TokenUsage, UsageSnapshot } from '../../../shared/types'

const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'nova-3': { input: 0.0059, output: 0 }
}

function estimateCost(model: string, usage: TokenUsage): number {
  const pricing = PRICING[model] ?? { input: 1, output: 3 }
  return (usage.promptTokens * pricing.input + usage.completionTokens * pricing.output) / 1_000_000
}

export class UsageTracker {
  private sessionUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  private _model = ''

  setModel(model: string): void {
    this._model = model
  }

  add(usage: { promptTokens: number; completionTokens: number }): void {
    const total = usage.promptTokens + usage.completionTokens
    this.sessionUsage.promptTokens += usage.promptTokens
    this.sessionUsage.completionTokens += usage.completionTokens
    this.sessionUsage.totalTokens += total
    this.totalUsage.promptTokens += usage.promptTokens
    this.totalUsage.completionTokens += usage.completionTokens
    this.totalUsage.totalTokens += total
  }

  getSnapshot(): UsageSnapshot {
    const cost = estimateCost(this._model, this.sessionUsage)
    return {
      session: { ...this.sessionUsage },
      total: { ...this.totalUsage },
      estimatedCostUsd: Math.round(cost * 10000) / 10000,
      model: this._model
    }
  }

  resetSession(): void {
    this.sessionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  }
}
