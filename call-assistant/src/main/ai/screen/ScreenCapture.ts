import { desktopCapturer } from 'electron'

const FRAME_INTERVAL_MS = 4000
const THUMB_WIDTH = 640

let lastCaptureAt = 0
let lastFrame: { mimeType: string; dataBase64: string } | null = null

export interface ScreenFrame {
  mimeType: string
  dataBase64: string
}

export async function captureScreenFrame(force = false): Promise<ScreenFrame | null> {
  const now = Date.now()
  if (!force && lastFrame && now - lastCaptureAt < FRAME_INTERVAL_MS) return lastFrame
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: THUMB_WIDTH, height: THUMB_WIDTH }
    })
    if (!sources.length) return lastFrame
    const primary = sources.find((s) => s.display_id !== '' && s.name === 'Entire Screen') || sources[0]
    const thumb = primary.thumbnail
    if (!thumb || thumb.isEmpty()) return lastFrame
    const jpeg = thumb.toJPEG(55)
    lastCaptureAt = now
    lastFrame = { mimeType: 'image/jpeg', dataBase64: jpeg.toString('base64') }
    return lastFrame
  } catch {
    return lastFrame
  }
}

export function clearScreenFrameCache(): void {
  lastFrame = null
  lastCaptureAt = 0
}

export function startScreenFrameStream(cb: (frame: ScreenFrame) => void): () => void {
  const tick = async (): Promise<void> => {
    const frame = await captureScreenFrame(true)
    if (frame) cb(frame)
  }
  void tick()
  const interval = setInterval(tick, FRAME_INTERVAL_MS)
  return () => clearInterval(interval)
}
