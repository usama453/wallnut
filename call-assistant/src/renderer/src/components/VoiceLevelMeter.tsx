import { useMemo } from 'react'
import { Mic } from 'lucide-react'
import { cn } from '../lib/cn'

interface VoiceLevelMeterProps {
  level: number
  className?: string
}

export function VoiceLevelMeter({ level, className }: VoiceLevelMeterProps): React.ReactElement {
  const normalizedLevel = useMemo(() => {
    const minDb = -50
    const maxDb = 0
    const clamped = Math.max(minDb, Math.min(maxDb, level))
    return ((clamped - minDb) / (maxDb - minDb)) * 100
  }, [level])

  const bars = 12
  const activeBars = Math.round((normalizedLevel / 100) * bars)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex items-end gap-[2px]">
        {Array.from({ length: bars }, (_, i) => (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-all duration-75',
              i < activeBars
                ? i < bars * 0.6
                  ? 'bg-green-500'
                  : i < bars * 0.85
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                : 'bg-muted'
            )}
            style={{
              height: `${Math.max(4, ((i + 1) / bars) * 16)}px`
            }}
          />
        ))}
      </div>
    </div>
  )
}
