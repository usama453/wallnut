import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  Circle,
  Mic,
  MonitorSpeaker,
  Play,
  Square,
  Volume2
} from 'lucide-react'
import { formatDuration } from '../lib/format'
import { useCallStore } from '../store/useCallStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { TranscriptView } from '../components/TranscriptView'
import { SuggestionCard } from '../components/SuggestionCard'
import { AskAiBox } from '../components/AskAiBox'
import { ListeningIndicator } from '../components/ListeningIndicator'
import { VoiceLevelMeter } from '../components/VoiceLevelMeter'
import { UsageDisplay } from '../components/UsageDisplay'
import { MicSwitcher } from '../components/MicSwitcher'
import { LiveInsightDisplay } from '../components/LiveInsightDisplay'
import { CallWorkspace } from '../components/workspace/CallWorkspace'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import type { AudioSourceInfo, CallStateSnapshot, TranscriptChunk } from '@shared/types'

export function LiveCallPage(): React.ReactElement {
  const state = useCallStore((s) => s.state)
  const transcript = useCallStore((s) => s.transcript)
  const interims = useCallStore((s) => s.interims)
  const audioLevel = useCallStore((s) => s.audioLevel)
  const usage = useCallStore((s) => s.usage)
  const start = useCallStore((s) => s.start)
  const stop = useCallStore((s) => s.stop)
  const toggleListening = useCallStore((s) => s.toggleListening)
  const clearError = useCallStore((s) => s.clearError)

  const active = state.phase !== 'idle' && state.phase !== 'finished'

  // Show full-screen workspace when call is active
  if (active) {
    return <CallWorkspace />
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Live Call</h1>
          <ListeningIndicator state={state} compact />
          {active ? (
            <>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(state.elapsedSeconds)}
              </span>
              <VoiceLevelMeter level={audioLevel} />
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {active ? <UsageDisplay usage={usage} /> : null}
          <CallControls
            state={state}
            onStart={async () => {
              await start()
            }}
            onStop={async () => {
              await stop()
            }}
            onToggle={async () => {
              await toggleListening()
            }}
          />
        </div>
      </header>

      {state.error ? (
        <div className="flex items-center justify-between gap-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          <span>{state.error}</span>
          <Button variant="ghost" size="sm" onClick={() => clearError()}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {active ? (
          <ActiveCallView state={state} transcript={transcript} interims={interims} />
        ) : (
          <SetupView />
        )}
      </div>
    </div>
  )
}

function CallControls({
  state,
  onStart,
  onStop,
  onToggle
}: {
  state: CallStateSnapshot
  onStart(): void
  onStop(): void
  onToggle(): void
}): React.ReactElement {
  if (state.phase === 'idle') {
    return (
      <Button onClick={onStart}>
        <Play className="h-4 w-4" />
        Start call
      </Button>
    )
  }
  if (state.phase === 'finished') {
    return (
      <Button onClick={onStart}>
        <Play className="h-4 w-4" />
        New call
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={onToggle}
        disabled={state.phase === 'starting' || state.phase === 'ending'}
      >
        {state.listening ? (
          <>
            <Circle className="h-4 w-4 fill-amber-400 text-amber-400" />
            Pause
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Resume
          </>
        )}
      </Button>
      <Button variant="destructive" onClick={onStop} disabled={state.phase === 'ending'}>
        <Square className="h-4 w-4" />
        End call
      </Button>
    </div>
  )
}

function ActiveCallView({
  state,
  transcript,
  interims
}: {
  state: CallStateSnapshot
  transcript: TranscriptChunk[]
  interims: Record<string, string>
}): React.ReactElement {
  const busy = state.phase === 'starting' || state.phase === 'ending'

  if (state.phase === 'finished') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AudioLines className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="text-base font-medium">Call ended</div>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          The transcript and AI summary were saved to your Sessions. Start a new call any time.
        </p>
      </div>
    )
  }

  return (
    <div className="relative grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="shrink-0 border-b py-3">
          <CardTitle className="text-sm">Live transcript</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-53px)] p-0">
          <TranscriptView chunks={transcript} interims={interims} />
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Microphone
          </div>
          <MicSwitcher />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live Insight
          </div>
          <LiveInsightDisplay />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assistant
          </div>
          <SuggestionCard
            suggestion={state.latestSuggestion}
            emptyHint={
              state.listening
                ? 'Listening… suggestions will appear here.'
                : 'Start listening to get live suggestions.'
            }
          />
        </div>
        <div className="mt-auto">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ask the assistant
          </div>
          <AskAiBox disabled={!state.listening} />
        </div>
      </div>

      {busy ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {state.phase === 'starting' ? 'Starting…' : 'Finishing…'}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SetupView(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings)
  const setSettings = useSettingsStore((s) => s.set)
  const start = useCallStore((s) => s.start)

  const [mics, setMics] = useState<AudioSourceInfo[]>([])
  const [systems, setSystems] = useState<AudioSourceInfo[]>([])
  const [micSel, setMicSel] = useState<string>('')
  const [sysSel, setSysSel] = useState<string>('none')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.audio.listMicrophones().then((list) => {
      setMics(list)
      setMicSel((prev) => prev || 'default')
    })
    void window.api.audio.listSystemAudio().then((list) => {
      setSystems(list)
      setSysSel((prev) => (prev === 'none' && list.length > 0 ? 'default' : prev))
    })
  }, [])

  useEffect(() => {
    if (!settings) return
    if (settings.microphoneId && settings.microphoneId !== 'none') {
      setMicSel(settings.microphoneId)
    } else {
      setMicSel((prev) => prev || 'default')
    }
    if (settings.systemAudioId && settings.systemAudioId !== 'none') {
      setSysSel(settings.systemAudioId)
    }
  }, [settings?.microphoneId, settings?.systemAudioId])

  const micOptions = useMemo(
    () => [
      { value: 'default', label: 'Default microphone' },
      ...mics
        .filter((m) => m.id !== 'default')
        .map((m) => ({ value: m.id, label: m.label }))
    ],
    [mics]
  )
  const sysOptions = useMemo(
    () => [
      { value: 'none', label: 'Off' },
      ...(systems.length
        ? systems.map((s) => ({ value: s.id, label: s.label }))
        : [{ value: 'default', label: 'System audio' }])
    ],
    [systems]
  )

  const doStart = async (): Promise<void> => {
    setError(null)
    setStarting(true)
    try {
      await setSettings({ microphoneId: micSel, systemAudioId: sysSel === 'none' ? 'none' : sysSel })
      const res = await start({
        microphoneId: micSel,
        systemAudioId: sysSel === 'none' ? undefined : sysSel
      })
      if (!res.ok) setError(res.error ?? 'Could not start call.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Start a call</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Volume2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Capture your call audio to get a live transcript and AI suggestions. Call Assistant
              listens locally — nothing is stored until you save a session.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              Microphone
            </Label>
            <Select
              value={micSel}
              onValueChange={setMicSel}
              options={micOptions}
              placeholder="Select microphone"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MonitorSpeaker className="h-3.5 w-3.5" />
              System audio
            </Label>
            <Select
              value={sysSel}
              onValueChange={setSysSel}
              options={sysOptions}
              placeholder="Select system audio"
            />
            {sysSel !== 'none' ? (
              <p className="text-xs text-muted-foreground">
                Requires Screen Recording permission on macOS 13+.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button className="w-full" size="lg" onClick={() => void doStart()} disabled={starting}>
            {starting ? <Spinner /> : <Play className="h-4 w-4" />}
            Start call
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
