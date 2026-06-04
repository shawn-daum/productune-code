/**
 * tabCloseGuard — T-PATCH-022 AC-4
 *
 * A tiny, framework-agnostic registry of per-tab "can I close?" guards. A tab
 * owner (e.g. the doctrine-file editor host) registers a guard keyed by its
 * tab id while it holds unsaved changes. The workspace store consults the
 * registry inside `closeTab`: if a guard is present and returns `false`, the
 * close is vetoed — the guard owner is expected to surface its own
 * unsaved-changes confirmation and re-issue the close after the user confirms.
 *
 * Intentionally NOT coupled to any IPC (worktree.* / doctrine.*) — it carries a
 * single predicate. This keeps the dirty-close confirmation generic and reusable
 * across tab types, per the ticket's "build a small generic variant" guidance.
 */

/** Returns true when the tab may close immediately, false to veto + handle it. */
export type TabCloseGuard = () => boolean

const guards = new Map<string, TabCloseGuard>()

/** Register (or replace) the close guard for a tab id. Returns an unregister fn. */
export function registerTabCloseGuard(tabId: string, guard: TabCloseGuard): () => void {
  guards.set(tabId, guard)
  return () => {
    if (guards.get(tabId) === guard) guards.delete(tabId)
  }
}

export function unregisterTabCloseGuard(tabId: string): void {
  guards.delete(tabId)
}

/**
 * Consult the guard for a tab id. Returns true when the tab may close (no guard,
 * or the guard allowed it). Returns false when a guard vetoed the close.
 */
export function canCloseTab(tabId: string): boolean {
  const g = guards.get(tabId)
  if (!g) return true
  try {
    return g()
  } catch {
    // A throwing guard must never trap the user — allow the close.
    return true
  }
}
