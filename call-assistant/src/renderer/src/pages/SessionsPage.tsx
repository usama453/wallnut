import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, FileText, History, Trash2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatDateTime, formatDuration } from '../lib/format'
import { useSessionsStore } from '../store/useSessionsStore'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Spinner } from '../components/ui/spinner'
import { EmptyState } from '../components/ui/empty-state'
import type { CallSessionRecord, SessionListItem } from '@shared/types'

export function SessionsPage(): React.ReactElement {
  const sessions = useSessionsStore((s) => s.sessions)
  const loading = useSessionsStore((s) => s.loading)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Sessions</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading && sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No sessions yet"
            description="Finished calls are saved here with their transcript and AI summary."
          />
        ) : selectedId ? (
          <SessionDetail id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="grid gap-3">
            {sessions.map((s) => (
              <SessionRow key={s.id} item={s} onOpen={() => setSelectedId(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SessionRow({
  item,
  onOpen
}: {
  item: SessionListItem
  onOpen(): void
}): React.ReactElement {
  const remove = useSessionsStore((s) => s.remove)
  const [deleting, setDeleting] = useState(false)

  const doRemove = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    setDeleting(true)
    try {
      await remove(item.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/30"
      onClick={onOpen}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(item.createdAt)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(item.durationSeconds)}
            </span>
            <span>{item.transcriptLength} lines</span>
          </div>
          {item.summary && item.summary.mainTopics.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.summary.mainTopics.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={(e) => void doRemove(e)} disabled={deleting}>
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </CardContent>
    </Card>
  )
}

function SessionDetail({ id, onBack }: { id: string; onBack(): void }): React.ReactElement {
  const [record, setRecord] = useState<CallSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.sessions.get(id).then((r) => {
      if (!cancelled) {
        setRecord(r)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!record) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-3">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <EmptyState icon={FileText} title="Session not found" />
      </div>
    )
  }

  const topics = record.summary?.mainTopics ?? record.conversationState.topics
  const keyPoints = record.summary?.keyPoints ?? []
  const openQuestions = record.summary?.openQuestions ?? record.conversationState.unresolvedQuestions
  const moments = record.summary?.importantMoments ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h2 className="text-xl font-semibold">{record.name}</h2>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(record.createdAt)} · {formatDuration(record.durationSeconds)} ·{' '}
          {record.transcript.length} transcript lines
        </p>
      </div>

      {record.summary ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Topics
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {keyPoints.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Key points
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {keyPoints.map((k) => (
                      <li key={k} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {openQuestions.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Open questions
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {openQuestions.map((q) => (
                      <li key={q}>• {q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {moments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Important moments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {moments.map((m) => (
                  <div key={`${m.timeSeconds}-${m.note}`} className="flex gap-3 text-sm">
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatDuration(m.timeSeconds)}
                    </span>
                    <span>{m.note}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            No AI summary was generated for this call.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transcript</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {record.transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">This session has no transcript.</p>
          ) : (
            record.transcript.map((c) => (
              <div key={c.id} className="flex flex-col gap-0.5">
                <span
                  className={cn(
                    'w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    c.speaker === 'user'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {c.speaker === 'user' ? 'You' : 'Other'}
                </span>
                <p className="text-sm leading-relaxed">{c.text}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
