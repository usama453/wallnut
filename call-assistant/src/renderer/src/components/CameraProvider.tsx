import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface CameraContextType {
  stream: MediaStream | null
  enabled: boolean
  start: (deviceId?: string) => Promise<void>
  stop: () => void
  toggle: () => Promise<void>
  error: string | null
}

const CameraContext = createContext<CameraContextType>({
  stream: null,
  enabled: false,
  start: async () => {},
  stop: () => {},
  toggle: async () => {},
  error: null
})

export function useCamera(): CameraContextType {
  return useContext(CameraContext)
}

export function CameraProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    setEnabled(false)
  }, [stream])

  const start = useCallback(async (deviceId?: string) => {
    try {
      const deviceSpecified = deviceId && deviceId !== '' && deviceId !== 'default'
      console.log('[CameraProvider] Starting camera:', deviceSpecified ? deviceId : 'default')
      const s = await navigator.mediaDevices.getUserMedia({
        video: deviceSpecified ? { deviceId: { exact: deviceId } } : true,
        audio: false
      })
      console.log('[CameraProvider] Camera tracks:', s.getVideoTracks().map(t => t.label))
      setStream(s)
      setEnabled(true)
      setError(null)
    } catch (err) {
      console.error('[CameraProvider] Camera error:', err)
      setEnabled(false)
      setError(err instanceof Error ? err.message : 'Camera access denied')
    }
  }, [])

  const toggle = useCallback(async () => {
    if (enabled) {
      stop()
    } else {
      await start()
    }
  }, [enabled, start, stop])

  useEffect(() => {
    void start()
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CameraContext.Provider value={{ stream, enabled, start, stop, toggle, error }}>
      {children}
    </CameraContext.Provider>
  )
}
