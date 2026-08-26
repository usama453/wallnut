import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../../shared/types'

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'openai',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',
  transcriptionProvider: 'deepgram',
  deepgramApiKey: '',
  microphoneId: '',
  systemAudioId: '',
  suggestionFrequency: 'medium',
  overlayPosition: 'bottom-right',
  theme: 'dark',
  overlayCollapsed: true,
  overlayAlwaysOnTop: true,
  salesObjective: '',
  screenContextEnabled: true
}

export class SettingsManager {
  private data: Settings
  private file: string
  private listeners: Array<(s: Settings) => void> = []

  constructor() {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'settings.json')
    this.data = { ...DEFAULT_SETTINGS, ...this.load() }
  }

  private load(): Partial<Settings> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return {}
    }
  }

  private persist(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    } catch {
      // non-fatal
    }
  }

  get(): Settings {
    return { ...this.data }
  }

  set(patch: Partial<Settings>): Settings {
    this.data = { ...this.data, ...patch }
    this.persist()
    this.listeners.forEach((l) => l(this.get()))
    return this.get()
  }

  onChanged(cb: (s: Settings) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  effective(): Settings {
    const s = this.data
    return {
      ...s,
      aiProvider: (process.env.AI_PROVIDER as Settings['aiProvider']) || s.aiProvider,
      openaiApiKey: process.env.OPENAI_API_KEY || s.openaiApiKey,
      deepgramApiKey: process.env.DEEPGRAM_API_KEY || s.deepgramApiKey,
      openaiModel: process.env.OPENAI_MODEL || s.openaiModel,
      geminiApiKey: process.env.GEMINI_API_KEY || s.geminiApiKey,
      geminiModel: process.env.GEMINI_MODEL || s.geminiModel,
      transcriptionProvider:
        (process.env.TRANSCRIPTION_PROVIDER as Settings['transcriptionProvider']) ||
        s.transcriptionProvider
    }
  }
}
