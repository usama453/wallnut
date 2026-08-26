import type { Speaker, TranscriptChunk } from '../../shared/types'
import { uid } from '../../shared/utils'
import type { TranscriptionProvider, TranscriptEvent } from './TranscriptionProvider'

export interface InterimEvent {
  segmentId?: string
  text: string
}

export class TranscriptionManager {
  private finalListeners = new Set<(chunk: TranscriptChunk) => void>()
  private interimListeners = new Set<(e: InterimEvent) => void>()
  private providerListener: () => void

  constructor(
    private provider: TranscriptionProvider,
    private speaker: () => Speaker
  ) {
    this.providerListener = this.provider.onEvent((e) => this.handleEvent(e))
  }

  private handleEvent(e: TranscriptEvent): void {
    if (e.type === 'final') {
      const chunk: TranscriptChunk = {
        id: uid('seg'),
        speaker: this.speaker(),
        text: e.text,
        timestamp: e.timestamp,
        isFinal: true,
        segmentId: e.segmentId
      }
      this.finalListeners.forEach((l) => l(chunk))
    } else {
      this.interimListeners.forEach((l) => l({ segmentId: e.segmentId, text: e.text }))
    }
  }

  async start(): Promise<void> {
    await this.provider.connect()
  }

  send(pcm: Int16Array): void {
    console.log('[TranscriptionManager] send:', pcm.length, 'samples')
    this.provider.send(pcm)
  }

  stop(): void {
    this.provider.close()
    this.providerListener()
    this.finalListeners.clear()
    this.interimListeners.clear()
  }

  onFinal(cb: (chunk: TranscriptChunk) => void): () => void {
    this.finalListeners.add(cb)
    return () => this.finalListeners.delete(cb)
  }

  onInterim(cb: (e: InterimEvent) => void): () => void {
    this.interimListeners.add(cb)
    return () => this.interimListeners.delete(cb)
  }
}
