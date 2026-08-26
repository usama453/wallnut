import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'
import { formatClock } from '../lib/format'
import type { TranscriptChunk } from '@shared/types'

interface Props {
  chunks: TranscriptChunk[]
  interims: Record<string, string>
}

export function TranscriptView({ chunks, interims }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chunks.length])

  const pending = Object.entries(interims)
    .filter(([segmentId]) => !chunks.some((c) => c.segmentId === segmentId))
    .map(([, text]) => text.trim())
    .filter((t) => t.length > 0)
    .pop()

  if (chunks.length === 0 && !pending) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        The live transcript will appear here as soon as speech is detected.
      </div>
    )
  }

  return (
    <div ref={ref} className="flex h-full flex-col gap-3 overflow-y-auto px-6 py-4">
      {chunks.map((chunk) => (
        <div key={chunk.id} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                chunk.speaker === 'user'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {chunk.speaker === 'user' ? 'You' : 'Other'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatClock(chunk.timestamp)}
            </span>
          </div>
          <p className="text-sm leading-relaxed">{chunk.text}</p>
        </div>
      ))}
      {pending ? (
        <p className="text-sm italic text-muted-foreground/70">…{pending}</p>
      ) : null}
    </div>
  )
}
