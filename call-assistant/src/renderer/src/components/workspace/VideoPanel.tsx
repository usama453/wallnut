import { useRef, useEffect } from 'react'
import { VideoOff } from 'lucide-react'
import { useCamera } from '../CameraProvider'

export function VideoPanel(): React.ReactElement {
  const { stream, enabled } = useCamera()
  const selfRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    console.log('[VideoPanel] Stream changed:', stream?.id, stream?.getVideoTracks().map(t => `${t.label} ready=${t.readyState} muted=${t.muted} enabled=${t.enabled}`))
    const el = selfRef.current
    if (el && stream) {
      el.srcObject = stream
      el.play().catch(e => {
        if (e.name === 'AbortError') return
        console.error('[VideoPanel] play() failed:', e.name, e.message)
      })
    }
  }, [stream])

  useEffect(() => {
    const el = selfRef.current
    if (!el) return
    const logMeta = () => console.log('[VideoPanel] videoWidth:', el.videoWidth, 'videoHeight:', el.videoHeight, 'readyState:', el.readyState, 'paused:', el.paused)
    const logPlaying = () => console.log('[VideoPanel] playing')
    const logWaiting = () => console.log('[VideoPanel] waiting')
    const logStalled = () => console.log('[VideoPanel] stalled')
    const logError = () => console.error('[VideoPanel] video element error:', el.error?.code, el.error?.message)
    const logEnded = () => console.log('[VideoPanel] track ended')
    const logMute = () => console.log('[VideoPanel] track muted:', (el.srcObject as MediaStream | null)?.getVideoTracks().map(t => t.muted))
    el.addEventListener('loadedmetadata', logMeta)
    el.addEventListener('playing', logPlaying)
    el.addEventListener('waiting', logWaiting)
    el.addEventListener('stalled', logStalled)
    el.addEventListener('error', logError)
    el.addEventListener('ended', logEnded)
    el.addEventListener('mute', logMute)
    return () => {
      el.removeEventListener('loadedmetadata', logMeta)
      el.removeEventListener('playing', logPlaying)
      el.removeEventListener('waiting', logWaiting)
      el.removeEventListener('stalled', logStalled)
      el.removeEventListener('error', logError)
      el.removeEventListener('ended', logEnded)
      el.removeEventListener('mute', logMute)
    }
  }, [])

  useEffect(() => {
    console.log('[VideoPanel] Enabled:', enabled)
  }, [enabled])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 200,
        height: 122,
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(255, 255, 255, 0.03)'
      }}
    >
      <video
        ref={selfRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{
          transform: 'scaleX(-1)',
          background: enabled ? 'transparent' : 'rgba(255, 255, 255, 0.03)'
        }}
      />
      {!enabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <VideoOff className="h-6 w-6 text-white/20 mx-auto mb-1" />
            <div className="text-xs text-white/30">Camera Off</div>
          </div>
        </div>
      )}
    </div>
  )
}
