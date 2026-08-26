import { create } from 'zustand'
import type { Settings } from '@shared/types'

interface SettingsStore {
  settings: Settings | null
  hydrated: boolean
  init(): Promise<void>
  subscribe(): () => void
  set(patch: Partial<Settings>): Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  hydrated: false,

  init: async () => {
    if (useSettingsStore.getState().hydrated) return
    const s = await window.api.settings.get()
    set({ settings: s, hydrated: true })
    applyTheme(s)
  },

  subscribe: () => {
    return window.api.settings.onChanged((s) => {
      set({ settings: s })
      applyTheme(s)
    })
  },

  set: async (patch) => {
    const next = await window.api.settings.set(patch)
    set({ settings: next })
    applyTheme(next)
  }
}))

function applyTheme(s: Settings): void {
  document.documentElement.classList.toggle('dark', s.theme === 'dark')
}
