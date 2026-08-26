import { Circle } from 'lucide-react'
import { useCallStore } from '../../store/useCallStore'
import { formatDuration } from '../../lib/format'

export function CallHeader(): React.ReactElement {
  const state = useCallStore((s) => s.state)

  return (
    <div
      className="absolute top-0 left-0 z-10 flex items-center gap-3"
      style={{ padding: '20px 24px' }}
    >
      <div className="flex items-center gap-2">
        {state.phase === 'listening' && (
          <Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />
        )}
        <span className="text-xs font-medium text-white/90 uppercase tracking-wider">
          {state.phase === 'listening' ? 'LIVE' : state.phase}
        </span>
      </div>
      <div className="text-sm text-white/60">
        Discovery Call
      </div>
      <div className="ml-4 text-xs tabular-nums text-white/40 font-mono">
        {formatDuration(state.elapsedSeconds)}
      </div>
    </div>
  )
}
