import type { MicDeviceInfo } from '@shared/api'

let stream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let processor: ScriptProcessorNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let mute: GainNode | null = null

const TARGET_RATE = 16000

function resampleTo16k(ch0: Float32Array, nativeRate: number): Int16Array {
  if (nativeRate === TARGET_RATE) {
    const pcm = new Int16Array(ch0.length)
    for (let i = 0; i < ch0.length; i++) {
      const v = Math.max(-1, Math.min(1, ch0[i]))
      pcm[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff)
    }
    return pcm
  }
  const ratio = nativeRate / TARGET_RATE
  const outLen = Math.round(ch0.length / ratio)
  const pcm = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, ch0.length - 1)
    const frac = pos - i0
    const v = Math.max(-1, Math.min(1, ch0[i0] * (1 - frac) + ch0[i1] * frac))
    pcm[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff)
  }
  return pcm
}

window.micBridge.onList(async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const list: MicDeviceInfo[] = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }))
    window.micBridge.devices(list)
  } catch {
    window.micBridge.devices([])
  }
})

window.micBridge.onStart(async (deviceId: string) => {
  try {
    await startCapture(deviceId)
    window.micBridge.started({ ok: true })
  } catch (err) {
    window.micBridge.started({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    })
  }
})

window.micBridge.onStop(() => {
  stopCapture()
  window.micBridge.stopped()
})

async function startCapture(deviceId: string): Promise<void> {
  stopCapture()
  const deviceSpecified = deviceId && deviceId !== '' && deviceId !== 'default'
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceSpecified ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  }
  console.log('[micMain] Starting capture with device:', deviceSpecified ? deviceId : 'default')
  stream = await navigator.mediaDevices.getUserMedia(constraints)
  console.log('[micMain] Audio tracks:', stream.getAudioTracks().map(t => t.label))
  const ctx = new AudioContext()
  await ctx.resume()
  console.log('[micMain] AudioContext state:', ctx.state, 'sampleRate:', ctx.sampleRate)
  audioCtx = ctx
  source = ctx.createMediaStreamSource(stream)
  processor = ctx.createScriptProcessor(4096, 1, 1)
  processor.channelCount = 1
  processor.channelCountMode = 'explicit'
  mute = ctx.createGain()
  mute.gain.value = 0
  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer
    if (input.numberOfChannels < 1) return
    const ch0 = input.getChannelData(0)
    const pcm = resampleTo16k(ch0, ctx.sampleRate)
    window.micBridge.chunk(pcm.buffer as ArrayBuffer)
  }
  source.connect(processor)
  processor.connect(mute)
  mute.connect(ctx.destination)
}

function stopCapture(): void {
  if (processor) {
    try {
      processor.disconnect()
    } catch {
      // already disconnected
    }
    processor = null
  }
  if (source) {
    try {
      source.disconnect()
    } catch {
      // already disconnected
    }
    source = null
  }
  if (mute) {
    try {
      mute.disconnect()
    } catch {
      // already disconnected
    }
    mute = null
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  if (audioCtx) {
    void audioCtx.close().catch(() => undefined)
    audioCtx = null
  }
}
