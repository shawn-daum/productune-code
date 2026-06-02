/**
 * EntryGate (T-P4-101) — workspace entry state machine.
 *
 * Reads .productune/onboarding.json on project mount, then routes:
 *   loading  → blank dark shell (#0F0F0F), no WorkspaceShell grid (flash guard)
 *   pending  → <FreshComposer>  (1-input screen)
 *   done     → <WorkspaceShell> (full UI)
 *   legacy   → secondary fallback: has work traces → WorkspaceShell, else FreshComposer
 *
 * State machine (Decision C):
 *   project mount
 *     ↓
 *   onboarding:read IPC ──→ { loading }  →  blank dark shell
 *           │
 *        resolved
 *           ├─ 'pending'   ──→  <FreshComposer />
 *           ├─ 'done'      ──→  <WorkspaceShell />
 *           └─ null (legacy)
 *                  ├─ has traces (chat.json > 0 OR phase_history > 0)  →  <WorkspaceShell />
 *                  └─ no traces  →  <FreshComposer />
 *
 * Tickets board auto-open side effect is inside WorkspaceShell.
 * Since WorkspaceShell only mounts when gate === 'workspace', the side effect
 * is naturally suppressed while onboarding is pending.
 */

import { useEffect, useState } from 'react'
import type { Project } from '../lib/types'
import FreshComposer from './FreshComposer'
import WorkspaceShell from '../views/WorkspaceShell'

interface Props {
  project: Project
  onBack: () => void
  onOpenRecent?: (projectDir: string, slug: string) => void
}

type Gate = 'loading' | 'fresh' | 'workspace'

export default function EntryGate({ project, onBack, onOpenRecent }: Props) {
  const [gate, setGate] = useState<Gate>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const api = (window as any).api

      // ── Primary: read onboarding.json ────────────────────────────────────
      let status: 'pending' | 'done' | null = null
      try {
        status = await api.onboardingRead?.(project.projectDir) ?? null
      } catch {
        // IPC unavailable (browser dev mode) — skip to workspace
        if (!cancelled) setGate('workspace')
        return
      }

      if (status === 'pending') {
        // Even if pending, skip FreshComposer when the project already has chat history.
        try {
          const [session, poState] = await Promise.all([
            api.chatGetSession?.(project.projectDir).catch(() => null),
            api.readPoState?.(project.projectDir).catch(() => null),
          ])
          const hasMessages =
            Array.isArray((session as any)?.messages) && (session as any).messages.length > 0
          const hasPhaseHistory =
            Array.isArray((poState as any)?.phase_history) &&
            (poState as any).phase_history.length > 0
          if (hasMessages || hasPhaseHistory) {
            if (!cancelled) setGate('workspace')
            return
          }
        } catch { /* ignore — fall through to fresh */ }
        if (!cancelled) setGate('fresh')
        return
      }

      if (status === 'done') {
        if (!cancelled) setGate('workspace')
        return
      }

      // ── Legacy fallback (status === null, no onboarding.json) ────────────
      // Check for work traces: chat messages or phase_history entries.
      // Conservative: any trace → full workspace (Decision C + OQ-4).
      try {
        const [session, poState] = await Promise.all([
          api.chatGetSession?.(project.projectDir).catch(() => null),
          api.readPoState?.(project.projectDir).catch(() => null),
        ])
        const hasMessages =
          Array.isArray((session as any)?.messages) && (session as any).messages.length > 0
        const hasPhaseHistory =
          Array.isArray((poState as any)?.phase_history) &&
          (poState as any).phase_history.length > 0
        if (!cancelled) setGate(hasMessages || hasPhaseHistory ? 'workspace' : 'fresh')
      } catch {
        // Fallback: assume existing project → workspace (safe default)
        if (!cancelled) setGate('workspace')
      }
    })()

    return () => { cancelled = true }
  }, [project.projectDir])

  if (gate === 'loading') {
    // Blank dark shell — prevents full grid flash during hydration.
    return <div style={loadingShell} />
  }

  if (gate === 'fresh') {
    return (
      <FreshComposer
        project={project}
        onConfirm={() => setGate('workspace')}
      />
    )
  }

  return <WorkspaceShell project={project} onBack={onBack} onOpenRecent={onOpenRecent} />
}

// ── Styles ────────────────────────────────────────────────────────────────────

const loadingShell: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#0F0F0F',
}
