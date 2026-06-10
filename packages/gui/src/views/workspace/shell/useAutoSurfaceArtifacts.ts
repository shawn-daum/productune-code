/**
 * useAutoSurfaceArtifacts — T-PATCH-079
 *
 * Mounted ONCE in WorkspaceShell (alongside useIpcSubscriptions).
 * Subscribes to the `artifacts:reload` window event and on first mount,
 * auto-opens artifacts whose owning ticket is review-gated.
 *
 * Trigger conditions (AC-1):
 *   - artifact appears in artifactsListScoped after an artifacts:reload
 *   - NOT in the per-project surfaced seen-set (AC-4)
 *   - owning ticket has requires_user_gate:true AND status==='user-verify'
 *
 * First load (AC-5): seeds seen-set without opening anything (anti-spam).
 * Focus steal guard (AC-6): if active tab is dirty, always background-open.
 * At most one tab activated per reload; extras always background.
 * Resilience (AC-9): any error is silently swallowed.
 */

import { useEffect, useRef } from 'react'
import type { Ticket } from '../../../lib/types'
import { useWorkspace } from '../../../store/workspace'
import { useSurfacedArtifacts } from '../../../store/useSurfacedArtifacts'

interface ArtifactEntry {
  relPath: string
  absPath: string
  ext: string
}

interface Props {
  projectDir: string
  currentVersion: string | null
  tickets: Ticket[]
}

/** Derive the owning ticket id from an artifact filename.
 *  Convention: `<ticket-id>-<slug>.<ext>` e.g. `T-PATCH-077-foo.html` → `T-PATCH-077`.
 *  Regex: T- followed by UPPERCASE alphanum/dash groups ending in digits.
 */
function extractTicketId(relPath: string): string | null {
  const basename = relPath.split('/').pop() ?? ''
  const match = basename.match(/^(T-(?:[A-Z0-9]+-)*\d+)(?=[-.]|$)/)
  return match?.[1] ?? null
}

/** Extension → TabType routing (mirrors ArtifactsPane.handleRowClick). */
function artifactTabType(ext: string): 'preview' | 'artifact-mermaid' | 'artifact-md' | 'artifact-json' {
  if (ext === '.html') return 'preview'
  if (ext === '.mmd' || ext === '.mermaid') return 'artifact-mermaid'
  if (ext === '.json') return 'artifact-json'
  return 'artifact-md'
}

/** Build the tabId used for an artifact (mirrors ArtifactsPane.handleRowClick). */
function artifactTabId(relPath: string): string {
  return `artifact:${relPath}`
}

export function useAutoSurfaceArtifacts({ projectDir, currentVersion, tickets }: Props): void {
  const openTab = useWorkspace((s) => s.openTab)
  const openTabBackground = useWorkspace((s) => s.openTabBackground)
  const isActiveTabDirty = useWorkspace((s) => s.isActiveTabDirty)
  const surfaced = useSurfacedArtifacts()

  // Use a ref so the event listener always sees fresh values without re-subscribing.
  const scanRef = useRef<() => Promise<void>>(async () => {})

  scanRef.current = async () => {
    try {
      const api = (window as any).api
      if (!api?.artifactsListScoped) return

      const entries: ArtifactEntry[] = await api.artifactsListScoped(projectDir, currentVersion)

      // Build gated-ticket-id set: requires_user_gate:true AND status==='user-verify'
      const gatedIds = new Set(
        tickets
          .filter((t) => t.requires_user_gate === true && t.status === 'user-verify')
          .map((t) => t.ticket_id),
      )

      const allRelPaths = entries.map((e) => e.relPath)

      // AC-5: first load → seed without opening anything
      if (surfaced.seedIfEmpty(projectDir, allRelPaths)) return

      // Find triggered artifacts: gated + not yet seen
      const triggered = entries.filter((e) => {
        const ticketId = extractTicketId(e.relPath)
        return (
          ticketId !== null &&
          gatedIds.has(ticketId) &&
          !surfaced.has(projectDir, e.relPath)
        )
      })

      if (triggered.length === 0) return

      // Mark ALL triggered as seen BEFORE opening (AC-4)
      surfaced.add(projectDir, triggered.map((e) => e.relPath))

      const dirty = isActiveTabDirty()

      // Open each triggered artifact
      triggered.forEach((entry, index) => {
        const tabId = artifactTabId(entry.relPath)
        const type = artifactTabType(entry.ext)
        const title = entry.relPath.split('/').pop() ?? entry.relPath
        const props: Record<string, unknown> = {
          relPath: entry.relPath,
          absPath: entry.absPath,
          projectDir,
          ...(type === 'preview' ? { path: entry.absPath } : {}),
        }

        // AC-5/AC-6: first entry activates (unless dirty); rest always background
        const isFirst = index === 0
        if (isFirst && !dirty) {
          openTab(tabId, type, props, title, { needsReview: true })
        } else {
          openTabBackground(tabId, type, props, title)
        }
      })
    } catch {
      // AC-9: silently no-op — never throw from auto-surface
    }
  }

  // Subscribe to artifacts:reload ONCE (stable ref avoids re-subscribe on every tick).
  useEffect(() => {
    const handler = () => { void scanRef.current() }
    window.addEventListener('artifacts:reload', handler)
    return () => window.removeEventListener('artifacts:reload', handler)
  }, [])

  // Run on mount and whenever projectDir or currentVersion changes.
  useEffect(() => {
    void scanRef.current()
  }, [projectDir, currentVersion])
}
