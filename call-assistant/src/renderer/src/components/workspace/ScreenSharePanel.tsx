import { Monitor } from 'lucide-react'
import { useCallStore } from '../../store/useCallStore'

export function ScreenSharePanel(): React.ReactElement {
  const screenFrame = useCallStore((s) => s.screenFrame)
  const screenSharing = useCallStore((s) => s.screenSharing)

  if (!screenSharing) return <></>

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 200,
        height: 122,
        borderRadius: 12,
        border: '1px solid rgba(52, 211, 153, 0.35)',
        background: 'rgba(255, 255, 255, 0.03)'
      }}
    >
      {screenFrame ? (
        <img
          src={`data:${screenFrame.mimeType};base64,${screenFrame.dataBase64}`}
          alt="Shared screen"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Monitor className="h-6 w-6 text-white/20" />
        </div>
      )}
      <div
        className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5"
        style={{ background: 'rgba(6, 78, 59, 0.85)' }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-medium text-emerald-200 uppercase tracking-wider">
          Screen shared
        </span>
      </div>
    </div>
  )
}