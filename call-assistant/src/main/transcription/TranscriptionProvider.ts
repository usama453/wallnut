export interface TranscriptEvent {
  type: 'interim' | 'final'
  text: string
  timestamp: number
  segmentId?: string
}

export interface TranscriptionProvider {
  readonly name: string
  connect(): Promise<void>
  send(pcm16: Int16Array): void
  close(): void
  onEvent(cb: (e: TranscriptEvent) => void): () => void
}

export type TranscriptionProviderName = 'deepgram' | 'openai' | 'gemini'

export interface TranscriptionProviderOptions {
  deepgramApiKey: string
  openaiApiKey: string
  openaiModel: string
  openaiRealtimeModel: string
  geminiApiKey: string
}

export function createTranscriptionProvider(
  name: TranscriptionProviderName,
  opts: TranscriptionProviderOptions
): TranscriptionProvider {
  switch (name) {
    case 'deepgram':
      return new DeepgramProvider(opts.deepgramApiKey)
    case 'openai':
      return new OpenAIRealtimeProvider(opts.openaiApiKey, opts.openaiRealtimeModel)
    case 'gemini':
      return new GeminiLiveProvider(opts.geminiApiKey)
    default:
      throw new Error(`Unknown transcription provider: ${name}`)
  }
}

import WebSocket from 'ws'

class DeepgramProvider implements TranscriptionProvider {
  readonly name = 'deepgram'
  private ws: WebSocket | null = null
  private listeners = new Set<(e: TranscriptEvent) => void>()
  private apiKey: string
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingTimer: NodeJS.Timeout | null = null
  private closed = false
  private audioBuffer: Int16Array[] = []
  private bufferSamples = 0
  private flushTimer: NodeJS.Timeout | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  onEvent(cb: (e: TranscriptEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(e: TranscriptEvent): void {
    this.listeners.forEach((l) => l(e))
  }

  async connect(): Promise<void> {
    this.closed = false
    if (!this.apiKey) throw new Error('Deepgram API key is not configured.')
    await this.connectSocket()
  }

  private async connectSocket(): Promise<void> {
    const params = new URLSearchParams({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
      punctuate: 'true',
      smart_format: 'true',
      diarize: 'true'
    })
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`
    console.log('[DeepgramProvider] Connecting to:', url)
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${this.apiKey}` } })
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('Deepgram connection timed out'))
      }, 10000)
      ws.on('open', () => {
        clearTimeout(timeout)
        console.log('[DeepgramProvider] Connected')
        this.startPing()
        this.startFlushTimer()
        resolve()
      })
      ws.on('error', (err) => {
        clearTimeout(timeout)
        console.error('[DeepgramProvider] Connection error:', err.message)
        reject(new Error(`Deepgram connection failed: ${err.message}`))
      })
      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timeout)
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
          let msg = `HTTP ${res.statusCode}`
          try {
            const j = JSON.parse(body)
            msg += `: ${j.err_msg || j.message || body}`
          } catch {
            msg += `: ${body}`
          }
          console.error('[DeepgramProvider] Unexpected response:', msg)
          reject(new Error(`Deepgram connection failed: ${msg}`))
        })
      })
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'UtteranceEnd') {
          this.emit({
            type: 'final',
            text: '',
            timestamp: Date.now(),
            segmentId: String(msg.last_word_end ?? '')
          })
          return
        }
        if (msg.type === 'SpeechStarted') {
          console.log('[DeepgramProvider] SpeechStarted')
          return
        }
        if (msg.type !== 'Results') return
        const text = msg.channel?.alternatives?.[0]?.transcript?.trim()
        if (!text) return
        console.log('[DeepgramProvider] Transcript:', text, 'is_final:', msg.is_final)
        this.emit({
          type: msg.is_final ? 'final' : 'interim',
          text,
          timestamp: Date.now(),
          segmentId: String(msg.start ?? msg.utterance_end ?? '')
        })
      } catch {
        // ignore malformed frames
      }
    })

    ws.on('close', (code, reason) => {
      console.log('[DeepgramProvider] Closed:', code, reason.toString())
      this.stopPing()
      this.stopFlushTimer()
      if (this.ws === ws) this.ws = null
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => {
          console.log('[DeepgramProvider] Reconnecting...')
          void this.connectSocket()
        }, 1000)
      }
    })
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping()
      }
    }, 15000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private startFlushTimer(): void {
    this.stopFlushTimer()
    this.flushTimer = setInterval(() => this.flushBuffer(), 80)
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private flushBuffer(): void {
    if (this.bufferSamples === 0) return
    const merged = new Int16Array(this.bufferSamples)
    let off = 0
    for (const p of this.audioBuffer) {
      merged.set(p, off)
      off += p.length
    }
    this.audioBuffer = []
    this.bufferSamples = 0
    this.sendRaw(merged)
  }

  send(pcm16: Int16Array): void {
    this.audioBuffer.push(pcm16)
    this.bufferSamples += pcm16.length
    if (this.bufferSamples >= 3200) {
      this.flushBuffer()
    }
  }

  private sendRaw(pcm16: Int16Array): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const buf = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
    console.log('[DeepgramProvider] Sending audio:', pcm16.length, 'samples')
    ws.send(buf)
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopPing()
    this.stopFlushTimer()
    this.flushBuffer()
    try {
      this.ws?.close()
    } catch {
      // already closed
    }
    this.ws = null
  }
}

class OpenAIRealtimeProvider implements TranscriptionProvider {
  readonly name = 'openai'
  private ws: WebSocket | null = null
  private listeners = new Set<(e: TranscriptEvent) => void>()
  private audioBuf: Int16Array[] = []
  private bufSamples = 0
  private currentSegment: { id: string; text: string } | null = null
  private eventId = 0

  constructor(
    private apiKey: string,
    private model = 'gpt-4o-realtime-preview'
  ) {}

  onEvent(cb: (e: TranscriptEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(e: TranscriptEvent): void {
    this.listeners.forEach((l) => l(e))
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('OpenAI API key is not configured.')
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${this.model}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    })
    this.ws = ws
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (err) => reject(new Error(`OpenAI connection failed: ${err.message}`)))
    })
    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()))
      } catch {
        // ignore malformed frames
      }
    })
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null
    })
    this.sendEvent({
      type: 'session.update',
      session: {
        modalities: ['text'],
        input_audio_transcription: { model: 'gpt-4o-transcribe' },
        turn_detection: {
          type: 'server_vad',
          create_response: false,
          silence_duration_ms: 450,
          prefix_padding_ms: 300,
          threshold: 0.5
        }
      }
    })
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'input_audio_buffer.speech_started': {
        this.currentSegment = { id: msg.item_id ?? `seg_${++this.eventId}`, text: '' }
        break
      }
      case 'input_audio_buffer.speech_stopped': {
        this.flushSegment()
        break
      }
      case 'conversation.item.input_audio_transcription.delta': {
        if (this.currentSegment) {
          this.currentSegment.text += msg.delta ?? ''
          this.emit({
            type: 'interim',
            text: this.currentSegment.text,
            timestamp: Date.now(),
            segmentId: this.currentSegment.id
          })
        }
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (msg.transcript || '').trim()
        if (!text) break
        this.emit({
          type: 'final',
          text,
          timestamp: Date.now(),
          segmentId: msg.item_id ?? `seg_${++this.eventId}`
        })
        if (this.currentSegment && msg.item_id && this.currentSegment.id === msg.item_id) {
          this.currentSegment = null
        }
        break
      }
      default:
        break
    }
  }

  private flushSegment(): void {
    if (!this.currentSegment) return
    const text = this.currentSegment.text.trim()
    if (text) {
      this.emit({ type: 'final', text, timestamp: Date.now(), segmentId: this.currentSegment.id })
    }
    this.currentSegment = null
  }

  send(pcm16: Int16Array): void {
    this.audioBuf.push(pcm16)
    this.bufSamples += pcm16.length
    if (this.bufSamples < 3200) return
    const merged = new Int16Array(this.bufSamples)
    let off = 0
    for (const p of this.audioBuf) {
      merged.set(p, off)
      off += p.length
    }
    this.audioBuf = []
    this.bufSamples = 0
    const b64 = Buffer.from(merged.buffer, merged.byteOffset, merged.byteLength).toString('base64')
    this.sendEvent({ type: 'input_audio_buffer.append', audio: b64 })
  }

  private sendEvent(evt: Record<string, unknown>): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(evt))
  }

  close(): void {
    try {
      this.ws?.close()
    } catch {
      // already closed
    }
    this.ws = null
  }
}

class GeminiLiveProvider implements TranscriptionProvider {
  readonly name = 'gemini'
  private apiKey: string
  private listeners = new Set<(e: TranscriptEvent) => void>()
  private ws: WebSocket | null = null
  private closed = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private pendingFinal = ''
  private finalTimer: NodeJS.Timeout | null = null
  private readonly model = 'gemini-3.5-live-translate-preview'
  private readonly finalSilenceMs = 1500

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  onEvent(cb: (e: TranscriptEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(e: TranscriptEvent): void {
    this.listeners.forEach((l) => l(e))
  }

  async connect(): Promise<void> {
    this.closed = false
    if (!this.apiKey) throw new Error('Gemini API key is not configured.')
    await this.connectSocket()
  }

  private async connectSocket(): Promise<void> {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`
    console.log('[GeminiLiveProvider] Connecting...')
    const ws = new WebSocket(url)
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('Gemini connection timed out'))
      }, 15000)
      ws.on('open', () => {
        clearTimeout(timeout)
        this.reconnectAttempts = 0
        const setup = {
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
              }
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [
                {
                  text: 'Transcribe the user\'s speech verbatim into clean, readable text. Do not respond, only transcribe.'
                }
              ]
            }
          }
        }
        ws.send(JSON.stringify(setup))
        resolve()
      })
      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(new Error(`Gemini connection failed: ${err.message}`))
      })
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()))
      } catch {
        // ignore malformed frames
      }
    })

    ws.on('close', (code, reason) => {
      console.log('[GeminiLiveProvider] Closed:', code, reason.toString().slice(0, 120))
      if (this.ws === ws) this.ws = null
      if (!this.closed) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 8000)
        this.reconnectAttempts++
        this.reconnectTimer = setTimeout(() => {
          void this.connectSocket()
        }, delay)
      }
    })
  }

  private handleMessage(msg: any): void {
    const sc = msg.serverContent
    if (sc?.inputTranscription) {
      console.log('[GeminiLiveProvider] inputTranscription:', JSON.stringify(sc.inputTranscription).slice(0, 80))
    } else if (sc?.modelTurn) {
      console.log('[GeminiLiveProvider] modelTurn')
    } else if (msg.setupComplete) {
      console.log('[GeminiLiveProvider] setupComplete')
    }
    if (!msg.serverContent) return
    const it = sc.inputTranscription
    if (it && it.text) {
      const text = (it.text as string).trim()
      if (text) {
        this.pendingFinal += text + ' '
        this.emit({
          type: 'interim',
          text: this.pendingFinal.trim(),
          timestamp: Date.now(),
          segmentId: 'live'
        })
        if (this.finalTimer) clearTimeout(this.finalTimer)
        this.finalTimer = setTimeout(() => {
          this.commitFinal()
        }, this.finalSilenceMs)
      }
    }
  }

  private commitFinal(): void {
    if (this.finalTimer) {
      clearTimeout(this.finalTimer)
      this.finalTimer = null
    }
    if (this.pendingFinal.trim()) {
      this.emit({
        type: 'final',
        text: this.pendingFinal.trim(),
        timestamp: Date.now(),
        segmentId: `g_${Date.now()}`
      })
    }
    this.pendingFinal = ''
  }

  send(pcm16: Int16Array): void {
    if (this.closed) return
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const b64 = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength).toString('base64')
    ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { mimeType: 'audio/pcm;rate=16000', data: b64 }
        }
      })
    )
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.finalTimer) {
      clearTimeout(this.finalTimer)
      this.finalTimer = null
    }
    try {
      this.ws?.close()
    } catch {
      // already closed
    }
    this.ws = null
  }
}
