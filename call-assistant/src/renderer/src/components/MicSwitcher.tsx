import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { useCallStore } from '../store/useCallStore'
import { Select } from './ui/select'
import type { AudioSourceInfo } from '@shared/types'

export function MicSwitcher({ compact = false }: { compact?: boolean }): React.ReactElement {
  const switchMic = useCallStore((s) => s.switchMic)
  const [mics, setMics] = useState<AudioSourceInfo[]>([])
  const [current, setCurrent] = useState('default')

  useEffect(() => {
    void window.api.audio.listMicrophones().then((list) => {
      setMics(list)
    })
  }, [])

  const options = [
    { value: 'default', label: 'Default mic' },
    ...mics.filter((m) => m.id !== 'default').map((m) => ({ value: m.id, label: m.label }))
  ]

  const handleChange = async (val: string): Promise<void> => {
    setCurrent(val)
    await switchMic(val)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <Mic className="h-3 w-3 shrink-0 text-white/40" />
        <Select
          value={current}
          onValueChange={(v) => void handleChange(v)}
          options={options}
          placeholder="Mic"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Select
        value={current}
        onValueChange={(v) => void handleChange(v)}
        options={options}
        placeholder="Microphone"
      />
    </div>
  )
}
