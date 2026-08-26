import type { AudioSource } from './AudioSource'
import type { AudioSourceInfo } from '../../shared/types'
import * as mac from './macSystemAudio'

function enabled(): boolean {
  return process.env.SYSTEM_AUDIO_ENABLED !== 'false'
}

export async function listSystemAudioSources(): Promise<AudioSourceInfo[]> {
  if (!enabled()) return []
  if (process.platform === 'darwin' && mac.isSupported()) {
    return mac.listSources()
  }
  return []
}

export async function createSystemAudioSource(
  id: string,
  label: string
): Promise<AudioSource> {
  if (!enabled()) throw new Error('System audio capture is disabled.')
  if (process.platform === 'darwin' && mac.isSupported()) {
    return mac.createSource(id, label)
  }
  throw new Error(
    'System audio capture is not yet supported on this platform. Use a microphone-only call or run on macOS 13+ with Screen Recording permission.'
  )
}

export function systemAudioReason(): string {
  if (!enabled()) return 'System audio capture is disabled.'
  if (process.platform === 'darwin' && !mac.isSupported()) {
    return 'System audio requires macOS 13+ and the ScreenCaptureKit addon.'
  }
  return ''
}
