import { useRef, useEffect, useMemo } from 'react'
import { Circle } from 'lucide-react'
import { useCallStore } from '../../store/useCallStore'
import type { TranscriptChunk } from '@shared/types'

const HIGHLIGHT_KEYWORDS = [
  'struggling', 'frustrated', 'wasting', 'problem', 'issue', 'concern',
  'expensive', 'budget', 'cost', 'price', 'hours', 'weeks', 'months',
  'trying', 'need', 'want', 'looking for', 'decision', 'timeline'
]

export function TranscriptPanel(): React.ReactElement {
  const transcript = useCallStore((s) => s.transcript)
  const interims = useCallStore((s) => s.interims)
  const scrollRef = useRef<HTMLDivElement>(null)

  const recentChunks = useMemo(() => transcript.slice(-6), [transcript])
  const interimEntries = Object.entries(interims)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [recentChunks.length, interimEntries.length])

  return (
    <div
      className="absolute left-0 bottom-0 flex flex-col"
      style={{
        left: 32,
        bottom: 24,
        width: 480,
        maxHeight: 240,
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
          Live Transcript
        </span>
        <div className="flex items-center gap-1.5">
          <Circle className="h-1.5 w-1.5 fill-green-500 text-green-500 animate-pulse" />
          <span className="text-[10px] text-green-400/70 font-medium">LIVE</span>
        </div>
      </div>

      {/* Transcript content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ scrollBehavior: 'smooth' }}
      >
        {recentChunks.map((chunk, i) => (
          <TranscriptLine key={chunk.id} chunk={chunk} isLatest={i === recentChunks.length - 1} />
        ))}

        {interimEntries.map(([id, text]) => (
          <div key={`interim-${id}`} className="opacity-40">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
              Speaking...
            </div>
            <div className="text-sm text-white/50 italic">{text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TranscriptLine({
  chunk,
  isLatest
}: {
  chunk: TranscriptChunk
  isLatest: boolean
}): React.ReactElement {
  const highlighted = useMemo(() => highlightText(chunk.text), [chunk.text])

  return (
    <div className={`transition-opacity duration-500 ${isLatest ? 'opacity-100' : 'opacity-50'}`}>
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
        {chunk.speaker === 'user' ? 'You' : 'Client'}
      </div>
      <div className={`text-sm leading-relaxed ${isLatest ? 'text-white/90' : 'text-white/60'}`}>
        {highlighted}
      </div>
    </div>
  )
}

function highlightText(text: string): React.ReactNode {
  const lower = text.toLowerCase()
  const highlights: Array<{ start: number; end: number; keyword: string }> = []

  for (const kw of HIGHLIGHT_KEYWORDS) {
    let idx = 0
    while ((idx = lower.indexOf(kw, idx)) !== -1) {
      highlights.push({ start: idx, end: idx + kw.length, keyword: kw })
      idx += kw.length
    }
  }

  if (highlights.length === 0) return text

  highlights.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const h of highlights) {
    if (merged.length > 0 && h.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end)
    } else {
      merged.push({ start: h.start, end: h.end })
    }
  }

  const parts: React.ReactNode[] = []
  let lastIdx = 0
  for (const m of merged) {
    if (m.start > lastIdx) {
      parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx, m.start)}</span>)
    }
    parts.push(
      <span
        key={`h-${m.start}`}
        className="px-1 py-0.5 rounded"
        style={{ background: 'rgba(139, 92, 246, 0.25)', color: 'rgba(196, 181, 255, 1)' }}
      >
        {text.slice(m.start, m.end)}
      </span>
    )
    lastIdx = m.end
  }
  if (lastIdx < text.length) {
    parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx)}</span>)
  }

  return <>{parts}</>
}
