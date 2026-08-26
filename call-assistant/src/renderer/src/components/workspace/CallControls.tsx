import React from 'react'
import { Mic, MicOff, Video, VideoOff, Monitor, MoreHorizontal, PhoneOff } from 'lucide-react'
import { useCallStore } from '../../store/useCallStore'
import { useCamera } from '../CameraProvider'

interface ControlBtn {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  active?: boolean
}

export function CallControls(): React.ReactElement {
  const stop = useCallStore((s) => s.stop)
  const { enabled: camOn, toggle: toggleCam } = useCamera()
  const [micOn, setMicOn] = React.useState(true)
  const [sharing, setSharing] = React.useState(false)

  const controls: ControlBtn[] = [
    {
      icon: micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />,
      label: 'Mic',
      onClick: () => setMicOn(!micOn),
      active: micOn
    },
    {
      icon: camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />,
      label: 'Camera',
      onClick: () => void toggleCam(),
      active: camOn
    },
    {
      icon: <Monitor className="h-4 w-4" />,
      label: 'Share',
      onClick: () => setSharing(!sharing),
      active: sharing
    },
    {
      icon: <MoreHorizontal className="h-4 w-4" />,
      label: 'More',
      onClick: () => {}
    },
    {
      icon: <PhoneOff className="h-4 w-4" />,
      label: 'End',
      onClick: () => void stop(),
      danger: true
    }
  ]

  return (
    <div className="flex items-center gap-2 mt-3">
      {controls.map((c) => (
        <button
          key={c.label}
          onClick={c.onClick}
          className={`flex items-center justify-center rounded-full transition-all ${
            c.danger
              ? 'bg-red-500/80 hover:bg-red-500 text-white w-12 h-11'
              : c.active === false
              ? 'bg-white/10 hover:bg-white/15 text-white/50 w-11 h-11'
              : 'bg-white/5 hover:bg-white/10 text-white/70 w-11 h-11'
          }`}
          title={c.label}
        >
          {c.icon}
        </button>
      ))}
    </div>
  )
}
