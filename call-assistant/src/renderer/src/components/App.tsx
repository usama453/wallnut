import { useEffect, useState } from 'react'
import { AudioLines, History, Settings as SettingsIcon, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { useCallStore } from '../store/useCallStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useSessionsStore } from '../store/useSessionsStore'
import { LiveCallPage } from '../pages/LiveCallPage'
import { SessionsPage } from '../pages/SessionsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { ListeningIndicator } from './ListeningIndicator'

type Tab = 'live' | 'sessions' | 'settings'

const NAV: Array<{ id: Tab; label: string; icon: typeof AudioLines }> = [
  { id: 'live', label: 'Live Call', icon: AudioLines },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
]

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('live')
  const initCall = useCallStore((s) => s.init)
  const initSettings = useSettingsStore((s) => s.init)
  const loadSessions = useSessionsStore((s) => s.load)
  const callState = useCallStore((s) => s.state)

  useEffect(() => {
    void initCall()
    void initSettings()
    void loadSessions()
    const offCall = useCallStore.getState().subscribe()
    const offSettings = useSettingsStore.getState().subscribe()
    const offSessions = useSessionsStore.getState().subscribe()
    return () => {
      offCall()
      offSettings()
      offSessions()
    }
  }, [initCall, initSettings, loadSessions])

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <AudioLines className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Call Assistant</div>
            <div className="text-[11px] text-muted-foreground">Live AI call copilot</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                tab === item.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t p-3">
          <ListeningIndicator state={callState} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {tab === 'live' ? <LiveCallPage /> : null}
        {tab === 'sessions' ? <SessionsPage /> : null}
        {tab === 'settings' ? <SettingsPage /> : null}
      </main>
    </div>
  )
}

export function QuitButton(): React.ReactElement {
  return (
    <button
      onClick={() => window.api.app.quit()}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="h-4 w-4" />
      Quit
    </button>
  )
}
