import { useState } from 'react'
import { CornerDownLeft, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Spinner } from './ui/spinner'
import { cn } from '../lib/cn'
import { useCallStore } from '../store/useCallStore'

export function AskAiBox({ disabled }: { disabled?: boolean }): React.ReactElement {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const state = useCallStore((s) => s.state)
  const ask = useCallStore((s) => s.ask)
  const lastAsk = state?.lastAsk

  const submit = async (): Promise<void> => {
    const q = text.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      await ask(q)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Ask the assistant…"
          value={text}
          disabled={disabled || busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <Button size="icon" onClick={() => void submit()} disabled={disabled || busy || !text.trim()}>
          {busy ? <Spinner /> : <CornerDownLeft className="h-4 w-4" />}
        </Button>
      </div>
      {lastAsk ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed animate-fade-in-up">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Answer
          </div>
          {lastAsk.answer}
        </div>
      ) : null}
    </div>
  )
}

export function AskHint(): React.ReactElement {
  return (
    <div className={cn('text-center text-xs text-muted-foreground')}>
      Ask about the conversation and get a ready-to-say answer.
    </div>
  )
}
