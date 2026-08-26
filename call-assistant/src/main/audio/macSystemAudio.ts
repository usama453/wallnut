import type { AudioSource } from './AudioSource'
import type { AudioSourceInfo } from '../../shared/types'
import { floatToPcm16, resampleFloat } from './Resampler'

let addon: unknown = null

function loadAddon(): any {
  if (addon !== null) return addon
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    addon = require('screencapturekit-audio-capture')
  } catch {
    addon = false
  }
  return addon
}

export function isSupported(): boolean {
  return process.platform === 'darwin' && !!loadAddon()
}

export function listSources(): AudioSourceInfo[] {
  const m = loadAddon()
  if (!m) return []
  try {
    const cap = new m.AudioCapture()
    try {
      const displays = cap.getDisplays() || []
      if (!displays.length) {
        return [{ id: 'default', label: 'System Audio (default)', kind: 'system' }]
      }
      return displays.map((d: any, i: number) => ({
        id: String(d?.id ?? d?.displayId ?? i),
        label: d?.name ? `System Audio — ${d.name}` : `System Audio — Display ${i + 1}`,
        kind: 'system' as const
      }))
    } finally {
      cap.dispose()
    }
  } catch {
    return [{ id: 'default', label: 'System Audio', kind: 'system' }]
  }
}

function resolveDisplayId(cap: any, id: string): number | null {
  const displays = cap.getDisplays() || []
  for (const d of displays) {
    if (String(d?.id ?? d?.displayId) === id) return Number(d?.id ?? d?.displayId)
  }
  return displays.length ? Number(displays[0]?.id ?? displays[0]?.displayId) : null
}

function toMono16(sample: any): Int16Array {
  try {
    const data = sample?.data
    if (!data) return new Int16Array(0)
    const channels = sample.channels || 1
    const sampleRate = sample.sampleRate || 48000
    const format = sample.format || 'float32'
    let floats: Float32Array
    if (format === 'float32') {
      floats = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4)
    } else {
      const i16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2)
      floats = new Float32Array(i16.length)
      for (let i = 0; i < i16.length; i++) floats[i] = i16[i] / 32768
    }
    if (channels > 1) {
      const frames = Math.floor(floats.length / channels)
      const mono = new Float32Array(frames)
      for (let i = 0; i < frames; i++) {
        let s = 0
        for (let c = 0; c < channels; c++) s += floats[i * channels + c]
        mono[i] = s / channels
      }
      floats = mono
    }
    if (sampleRate !== 16000) floats = resampleFloat(floats, sampleRate, 16000)
    return floatToPcm16(floats)
  } catch {
    return new Int16Array(0)
  }
}

export function createSource(id: string, label: string): AudioSource {
  const m = loadAddon()
  const cap = new m.AudioCapture()
  let capturing = false

  const source: AudioSource = {
    kind: 'system',
    id,
    label,
    start: async () => {
      const displayId = resolveDisplayId(cap, id)
      if (displayId === null) {
        throw new Error('No display available for system audio capture.')
      }
      await cap.captureDisplay(displayId, {
        format: 'int16',
        channels: 1,
        bufferSize: 1024,
        minVolume: 0
      })
      capturing = true
    },
    stop: async () => {
      try {
        if (capturing) cap.stopCapture()
      } catch {
        // already stopped
      }
      try {
        cap.dispose()
      } catch {
        // already disposed
      }
      capturing = false
    },
    onChunk: (cb) => {
      const h = (sample: any) => {
        const pcm = toMono16(sample)
        if (pcm.length) cb(pcm)
      }
      cap.on('audio', h)
      return () => cap.off('audio', h)
    },
    onError: (cb) => {
      const h = (err: any) => {
        cb(err instanceof Error ? err : new Error(err?.message || 'System audio capture error.'))
      }
      cap.on('error', h)
      return () => cap.off('error', h)
    }
  }

  return source
}
