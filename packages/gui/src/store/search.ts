import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchMatchRange {
  start: number
  end: number
}

export interface SearchMatch {
  line: number
  text: string
  ranges: SearchMatchRange[]
}

export interface SearchFileGroup {
  absPath: string
  relPath: string
  name: string
  dir: string
  matches: SearchMatch[]
}

export interface SearchResult {
  groups: SearchFileGroup[]
  totalMatches: number
  fileCount: number
  truncated: boolean
  error?: string
}

export type SearchStatus = 'idle' | 'searching' | 'results' | 'noresult' | 'error'

export type SearchScope = 'project' | 'folder'

interface SearchState {
  query: string
  options: SearchOptions
  scope: SearchScope            // default = whole project (AC-5)
  status: SearchStatus
  result: SearchResult | null
  errorMsg: string | null
  /** File abs paths whose group is collapsed in the results list. */
  collapsed: Set<string>

  setQuery: (q: string) => void
  toggleOption: (key: keyof SearchOptions) => void
  setScope: (scope: SearchScope) => void
  setStatus: (status: SearchStatus) => void
  setResult: (result: SearchResult | null) => void
  setError: (msg: string | null) => void
  toggleCollapsed: (absPath: string) => void
  collapseAll: (absPaths: string[]) => void
  expandAll: () => void
  reset: () => void
}

const DEFAULT_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
}

export const useSearch = create<SearchState>((set) => ({
  query: '',
  options: { ...DEFAULT_OPTIONS },
  scope: 'project',
  status: 'idle',
  result: null,
  errorMsg: null,
  collapsed: new Set<string>(),

  setQuery: (query) => set({ query }),

  toggleOption: (key) =>
    set((s) => ({ options: { ...s.options, [key]: !s.options[key] } })),

  setScope: (scope) => set({ scope }),

  setStatus: (status) => set({ status }),

  setResult: (result) =>
    set({
      result,
      // Reset collapse state on a fresh result set.
      collapsed: new Set<string>(),
    }),

  setError: (errorMsg) => set({ errorMsg }),

  toggleCollapsed: (absPath) =>
    set((s) => {
      const next = new Set(s.collapsed)
      if (next.has(absPath)) next.delete(absPath)
      else next.add(absPath)
      return { collapsed: next }
    }),

  collapseAll: (absPaths) => set({ collapsed: new Set(absPaths) }),

  expandAll: () => set({ collapsed: new Set<string>() }),

  reset: () =>
    set({
      query: '',
      status: 'idle',
      result: null,
      errorMsg: null,
      collapsed: new Set<string>(),
    }),
}))
