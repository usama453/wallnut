import { Monitor, Sparkles, SlidersHorizontal, LayoutPanelTop, Power } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import type { Settings } from '@shared/types'

const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' }
]

const FREQUENCIES = [
  { value: 'low', label: 'Low — every ~45s' },
  { value: 'medium', label: 'Medium — every ~25s' },
  { value: 'high', label: 'High — every ~12s' }
]

const POSITIONS = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' }
]

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' }
]

export function SettingsPage(): React.ReactElement {
  const settings = useSettingsStore((s) => s.settings)
  const set = useSettingsStore((s) => s.set)

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  const update = (patch: Partial<Settings>): void => {
    void set(patch)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <header>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Keys are stored locally in your app config and never leave your machine.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4" />
            AI & Transcription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>AI provider</Label>
            <Select
              value={settings.aiProvider}
              onValueChange={(v) => update({ aiProvider: v as Settings['aiProvider'] })}
              options={AI_PROVIDERS}
            />
          </div>
          {settings.aiProvider === 'openai' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="openai-key">OpenAI API key</Label>
                <Input
                  id="openai-key"
                  type="password"
                  placeholder="sk-…"
                  value={settings.openaiApiKey}
                  onChange={(e) => update({ openaiApiKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openai-model">OpenAI model</Label>
                <Input
                  id="openai-model"
                  placeholder="gpt-4o-mini"
                  value={settings.openaiModel}
                  onChange={(e) => update({ openaiModel: e.target.value })}
                />
              </div>
            </>
          )}
          {settings.aiProvider === 'gemini' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="gemini-key">Gemini API key</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIza…"
                  value={settings.geminiApiKey}
                  onChange={(e) => update({ geminiApiKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gemini-model">Gemini model</Label>
                <Input
                  id="gemini-model"
                  placeholder="gemini-3.5-flash-lite"
                  value={settings.geminiModel}
                  onChange={(e) => update({ geminiModel: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Transcription provider</Label>
              <Select
                value={settings.transcriptionProvider}
                onValueChange={(v) =>
                  update({ transcriptionProvider: v as Settings['transcriptionProvider'] })
                }
                options={[
                  { value: 'deepgram', label: 'Deepgram (Nova-3)' },
                  { value: 'openai', label: 'OpenAI Realtime' },
                  { value: 'gemini', label: 'Gemini Live' }
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deepgram-key">Deepgram API key</Label>
              <Input
                id="deepgram-key"
                type="password"
                placeholder="Required for Deepgram"
                value={settings.deepgramApiKey}
                onChange={(e) => update({ deepgramApiKey: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4" />
            Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Suggestion frequency</Label>
            <Select
              value={settings.suggestionFrequency}
              onValueChange={(v) =>
                update({ suggestionFrequency: v as Settings['suggestionFrequency'] })
              }
              options={FREQUENCIES}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Monitor className="h-4 w-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => update({ theme: v as Settings['theme'] })}
              options={THEMES}
            />
          </div>
          <div className="space-y-2">
            <Label>Overlay position</Label>
            <Select
              value={settings.overlayPosition}
              onValueChange={(v) =>
                update({ overlayPosition: v as Settings['overlayPosition'] })
              }
              options={POSITIONS}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <LayoutPanelTop className="h-4 w-4" />
            Overlay
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void window.api.overlay.show()}>
            Show
          </Button>
          <Button variant="outline" onClick={() => void window.api.overlay.hide()}>
            Hide
          </Button>
          <Button variant="outline" onClick={() => void window.api.overlay.setCollapsed(false)}>
            Expand
          </Button>
          <Button variant="outline" onClick={() => void window.api.overlay.setCollapsed(true)}>
            Collapse
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-destructive">
            <Power className="h-4 w-4" />
            Quit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Call Assistant keeps running in the menu bar while the window is closed.
          </p>
          <Button variant="destructive" onClick={() => void window.api.app.quit()}>
            Quit Call Assistant
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
