export interface AudioSource {
  readonly kind: 'microphone' | 'system'
  readonly id: string
  readonly label: string
  start(): Promise<void>
  stop(): Promise<void>
  onChunk(cb: (pcm: Int16Array) => void): () => void
  onError(cb: (error: Error) => void): () => void
}
