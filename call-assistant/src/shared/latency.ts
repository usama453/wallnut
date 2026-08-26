export const LATENCY_LOGGING = true

export function markLatency(stage: string, extra?: string): void {
  if (!LATENCY_LOGGING) return
  console.log(`[latency] ${Date.now()} ${stage}${extra ? ` ${extra}` : ''}`)
}