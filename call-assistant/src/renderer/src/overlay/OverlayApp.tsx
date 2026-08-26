import { useEffect, useRef, useState } from 'react'
import { AudioLines, ChevronUp, GripHorizontal, Minus } from 'lucide-react'
import { useCallStore } from '../store/useCallStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { TranscriptView } from '../components/TranscriptView'
import { SuggestionCard } from '../components/SuggestionCard'
import { AskAiBox } from '../components/AskAiBox'
import { ListeningIndicator } from '../components/ListeningIndicator'

export function OverlayApp(): React.ReactElement {
  const initCall = useCallStore((s) => s.init)
  const initSettings = useSettingsStore((s) => s.init)
  const state = useCallStore((s) => s.state)
  const transcript = useCallStore((s) => s.transcript)
  const interims = useCallStore((s) => s.interims)
  const [collapsed, setCollapsed] = useState(true)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    void initCall()
    void initSettings()
    const offCall = useCallStore.getState().subscribe()
    const offSettings = useSettingsStore.getState().subscribe()
    const offVis = window.api.overlay.onVisibility((v) => {
      setVisible(v.visible)
      setCollapsed(v.collapsed)
    })
    return () => {
      offCall()
      offSettings()
      offVis()
    }
  }, [initCall, initSettings])

  if (!visible) {
    return (
      <div className="drag-region h-screen w-screen">
        <div className="flex h-screen w-screen items-center justify-center">
          <AudioLines className="h-5 w-5 text-muted-foreground/50" />
        </div>
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="drag-region flex h-screen w-screen items-center">
        <div className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-card/95 px-3 shadow-lg backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
              <AudioLines className="h-3 w-3" />
            </span>
            <ListeningIndicator state={state} compact />
          </div>
          <button
            className="no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => window.api.overlay.expand()}
            aria-label="Expand"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="drag-region flex h-screen w-screen flex-col overflow-hidden rounded-xl border bg-card/95 shadow-2xl backdrop-blur">
      <header className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground">
            <AudioLines className="h-3 w-3" />
          </span>
          <span className="text-xs font-semibold">Call Assistant</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          <ListeningIndicator state={state} compact />
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => window.api.overlay.collapse()}
            aria-label="Collapse"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-background/60">
          <div className="shrink-0 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Live transcript
          </div>
          <TranscriptView
            chunks={transcript.slice(-4)}
            interims={interims}
          />
        </div>

        <div className="shrink-0 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Assistant
          </div>
          <SuggestionCard suggestion={state.latestSuggestion} />
          <AskAiBox disabled={!state.listening} />
        </div>
      </div>

      <ResizeHandle />
    </div>
  )
}

function ResizeHandle(): React.ReactElement {
  const start = useRef<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState(false)

  return (
    <div
      className={`no-drag absolute bottom-0 right-0 flex h-4 w-4 cursor-se-resize items-end justify-end ${active ? 'bg-primary/10' : ''}`}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY }
        setActive(true)
        window.api.overlay.resizeStart()
        const el = e.currentTarget
        const capture = (ev: PointerEvent): void => {
          if (!start.current) return
          window.api.overlay.resize(ev.clientX - start.current.x, ev.clientY - start.current.y)
        }
        const release = (): void => {
          window.api.overlay.resizeEnd()
          start.current = null
          setActive(false)
          window.removeEventListener('pointermove', capture)
          window.removeEventListener('pointerup', release)
        }
        window.addEventListener('pointermove', capture)
        window.addEventListener('pointerup', release)
        el.setPointerCapture(e.pointerId)
      }}
    >
      <GripHorizontal className="h-3 w-3 -rotate-90 text-muted-foreground/60" />
    </div>
  )
}
