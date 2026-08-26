import { cn } from '../lib/cn'
import type { CallStateSnapshot } from '@shared/types'

export function ListeningIndicator({
  state,
  compact
}: {
  state: CallStateSnapshot | null
  compact?: boolean
}): React.ReactElement {
  const active = !!state && state.phase !== 'idle' && state.phase !== 'finished'
  const listening = active && state.listening
  const label = !active ? 'Idle' : listening ? 'Listening' : 'Paused'

  return (
    <div className={cn('flex items-center gap-2 text-xs', compact ? '' : 'text-muted-foreground')}>
      <span className="relative flex h-2 w-2">
        {listening ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </>
        ) : (
          <span
            className={cn(
              'inline-flex h-2 w-2 rounded-full',
              active ? 'bg-amber-400' : 'bg-muted-foreground/50'
            )}
          />
        )}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  )
}
