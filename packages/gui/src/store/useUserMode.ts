import { create } from 'zustand'

export type UserMode = 'developer' | 'planner' | null

interface UserModeState {
  mode: UserMode
  bannerReminded: boolean
  setMode: (mode: UserMode) => Promise<void>
  markBannerReminded: () => void
  loadFromSettings: () => Promise<void>
}

export const useUserMode = create<UserModeState>((set) => ({
  mode: 'planner',
  bannerReminded: false,

  setMode: async (mode: UserMode) => {
    set({ mode })
    try {
      await (window as any).api.setUserMode(mode)
    } catch {
      // IPC unavailable in browser dev mode
    }
  },

  markBannerReminded: () => {
    set({ bannerReminded: true })
  },

  loadFromSettings: async () => {
    try {
      const mode: UserMode = await (window as any).api.getUserMode()
      set({ mode })
    } catch {
      // IPC unavailable — keep default
    }
  },
}))
