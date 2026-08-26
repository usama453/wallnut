import { create } from 'zustand'
import type { SessionListItem } from '@shared/types'

interface SessionsStore {
  sessions: SessionListItem[]
  loading: boolean
  load(): Promise<void>
  remove(id: string): Promise<void>
  subscribe(): () => void
}

export const useSessionsStore = create<SessionsStore>((set, get) => ({
  sessions: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const sessions = await window.api.sessions.list()
      set({ sessions })
    } finally {
      set({ loading: false })
    }
  },

  remove: async (id) => {
    await window.api.sessions.remove(id)
    set({ sessions: get().sessions.filter((s) => s.id !== id) })
  },

  subscribe: () => {
    return window.api.sessions.onChanged(() => {
      void get().load()
    })
  }
}))
