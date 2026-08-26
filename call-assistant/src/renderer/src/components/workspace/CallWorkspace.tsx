import { useCallStore } from '../../store/useCallStore'
import { CameraProvider } from '../CameraProvider'
import { CallHeader } from './CallHeader'
import { ConversationTree } from './ConversationTree'
import { TranscriptPanel } from './TranscriptPanel'
import { CallControls } from './CallControls'
import { VideoPanel } from './VideoPanel'
import { ScreenSharePanel } from './ScreenSharePanel'

export function CallWorkspace(): React.ReactElement {
  const state = useCallStore((s) => s.state)

  const active = state.phase !== 'idle' && state.phase !== 'finished'

  if (!active) return <></>

  return (
    <CameraProvider>
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#080808' }}>
        <CallHeader />

        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <ConversationTree />

          {/* Client + self video top-right */}
          <div className="absolute top-0 right-0 z-10 flex gap-3" style={{ padding: '20px 24px' }}>
            <VideoPanel />
            <ScreenSharePanel />
          </div>

          {/* Transcript bottom-left */}
          <TranscriptPanel />

          {/* Call controls bottom-center */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <CallControls />
          </div>
        </div>
      </div>
    </CameraProvider>
  )
}
