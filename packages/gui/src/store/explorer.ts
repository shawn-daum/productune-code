import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FsNode {
  name: string
  path: string       // absolute
  isDir: boolean
}

export interface DirEntry {
  nodes: FsNode[]
  loading: boolean
  error: string | null
}

interface ExplorerState {
  /** Expanded folder paths (absolute). */
  expanded: Set<string>
  /** Per-folder children cache. key = absolute path. */
  cache: Map<string, DirEntry>
  /** Show dotfiles (^\\.) */
  showHidden: boolean

  toggleExpanded: (absPath: string) => void
  setExpanded: (absPath: string, val: boolean) => void
  setDirEntry: (absPath: string, entry: DirEntry) => void
  invalidateDir: (absPath: string) => void
  toggleShowHidden: () => void
  resetTree: () => void
}

export const useExplorer = create<ExplorerState>((set) => ({
  expanded: new Set<string>(),
  cache: new Map<string, DirEntry>(),
  showHidden: true,

  toggleExpanded: (absPath) =>
    set((s) => {
      const next = new Set(s.expanded)
      if (next.has(absPath)) next.delete(absPath)
      else next.add(absPath)
      return { expanded: next }
    }),

  setExpanded: (absPath, val) =>
    set((s) => {
      const next = new Set(s.expanded)
      if (val) next.add(absPath)
      else next.delete(absPath)
      return { expanded: next }
    }),

  setDirEntry: (absPath, entry) =>
    set((s) => {
      const next = new Map(s.cache)
      next.set(absPath, entry)
      return { cache: next }
    }),

  invalidateDir: (absPath) =>
    set((s) => {
      const next = new Map(s.cache)
      next.delete(absPath)
      return { cache: next }
    }),

  toggleShowHidden: () => set((s) => ({ showHidden: !s.showHidden })),

  resetTree: () =>
    set({ expanded: new Set<string>(), cache: new Map<string, DirEntry>() }),
}))
