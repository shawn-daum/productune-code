/**
 * useArtifacts.ts — Zustand store for dev/designer persona output artifact files (T-P4-112).
 *
 * Populated via 'po:artifact-files' IPC (ChatPanel useEffect).
 * Session-scoped: clearSession() called on PO "close version" event.
 * In-memory only. Persists tab open state within session via `opened` flag.
 */

import { create } from 'zustand'
import type { TabType } from './workspace'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArtifactFile {
  path: string       // projectDir 기준 상대 경로
  tabType: TabType
  addedAt: number    // epoch ms
  ticketId?: string
  opened: boolean    // whether it has been opened in main panel
}

interface ArtifactsState {
  files: ArtifactFile[]

  /** Push new artifact files from persona envelope. Idempotent on duplicate path. */
  pushFiles: (filePaths: string[], ticketId?: string) => void

  /** Mark a file as opened (for dim-row UX). */
  markOpened: (path: string) => void

  /** Clear all session artifacts — call on PO version-close event. */
  clearSession: () => void

  /** Returns up to 20 most-recently-added files. */
  recentFiles: () => ArtifactFile[]
}

// ── Extension → TabType mapping ───────────────────────────────────────────────

function extToTabType(filePath: string): TabType {
  if (filePath.endsWith('.excalidraw.json')) return 'design-gate'
  if (filePath.endsWith('.html')) return 'browser'
  // .md, .ts, .tsx, .js, .jsx, .json, and all others → markdown (syntax highlight)
  return 'markdown'
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useArtifacts = create<ArtifactsState>((set, get) => ({
  files: [],

  pushFiles: (filePaths, ticketId) =>
    set((s) => {
      const existingPaths = new Set(s.files.map((f) => f.path))
      const newFiles: ArtifactFile[] = []
      for (const path of filePaths) {
        if (!path || existingPaths.has(path)) continue
        newFiles.push({
          path,
          tabType: extToTabType(path),
          addedAt: Date.now(),
          ticketId,
          opened: false,
        })
        existingPaths.add(path) // handle duplicates within same batch
      }
      if (newFiles.length === 0) return s
      return { files: [...s.files, ...newFiles] }
    }),

  markOpened: (path) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, opened: true } : f)),
    })),

  clearSession: () => set({ files: [] }),

  recentFiles: () => {
    const { files } = get()
    return [...files].sort((a, b) => b.addedAt - a.addedAt).slice(0, 20)
  },
}))
