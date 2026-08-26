/// <reference types="vite/client" />

import type { MicBridgeApi, RendererApi } from '@shared/api'

declare global {
  interface Window {
    api: RendererApi
    micBridge: MicBridgeApi
  }
}

export {}
