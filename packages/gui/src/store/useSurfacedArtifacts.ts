/**
 * useSurfacedArtifacts — T-PATCH-079
 *
 * Per-project localStorage-persisted seen-set for auto-surfaced artifacts.
 * Prevents re-surfacing already-seen artifacts across reloads and app restarts.
 *
 * Key: `pdt:surfaced-artifacts:<projectDir>`
 * Mirrors the persist pattern from store/workspace.ts.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SurfacedState {
  /** projectDir → array of relPaths that have been auto-surfaced. */
  seen: Record<string, string[]>

  /** Returns true if relPath has already been surfaced for this project. */
  has: (projectDir: string, relPath: string) => boolean

  /** Add relPaths to the seen set for this project. */
  add: (projectDir: string, relPaths: string[]) => void

  /**
   * T-PATCH-079 AC-5: If no seen entry exists for projectDir (first load), seed
   * ALL relPaths into the seen set WITHOUT auto-opening. Returns true if this was
   * the first seed (caller should skip opening), false if already seeded.
   */
  seedIfEmpty: (projectDir: string, relPaths: string[]) => boolean
}

export const useSurfacedArtifacts = create<SurfacedState>()(
  persist(
    (set, get) => ({
      seen: {},

      has: (projectDir, relPath) => {
        const list = get().seen[projectDir]
        return list ? list.includes(relPath) : false
      },

      add: (projectDir, relPaths) => {
        if (relPaths.length === 0) return
        set((s) => {
          const existing = s.seen[projectDir] ?? []
          const newPaths = relPaths.filter((p) => !existing.includes(p))
          if (newPaths.length === 0) return s
          return { seen: { ...s.seen, [projectDir]: [...existing, ...newPaths] } }
        })
      },

      seedIfEmpty: (projectDir, relPaths) => {
        const existing = get().seen[projectDir]
        if (existing !== undefined) return false // already seeded
        // First load: seed all current artifacts without opening
        set((s) => ({ seen: { ...s.seen, [projectDir]: relPaths } }))
        return true
      },
    }),
    {
      name: 'pdt:surfaced-artifacts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
