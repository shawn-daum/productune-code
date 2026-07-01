/**
 * docsWatch — fs.watch docs/ → IPC push (T-PATCH-280).
 *
 * Problem: an open main-pane markdown tab (PRD, doctrine doc, any docs/*.md)
 * loaded its content ONCE on mount (MarkdownViewer's `runLoad` runs in a
 * useEffect keyed on the load callback). When the file changed on disk — e.g.
 * the PO/designer authors the PRD AFTER the placeholder tab already auto-opened
 * — nothing re-read it, so the tab kept showing the stale placeholder until the
 * app was restarted (a remount). The renderer needs a "this doc file changed on
 * disk" push so the open tab can re-`load()` in place, without a remount.
 *
 * Pattern: mirrors ticketsWatch.ts (fs.watch + debounce + broadcast to all
 * windows), with two differences:
 *   1. it watches <projectDir>/docs (recursive) — covers docs/prd, docs/tickets,
 *      and any other docs/*.md surface a tab might show;
 *   2. the broadcast carries the ABSOLUTE path of the changed `.md` file so the
 *      renderer can match it against the specific tab's absPath (AC-2: only the
 *      tab viewing that file reloads, not every md tab). filename is null on some
 *      platforms — in that case we broadcast a null path and the renderer falls
 *      back to a conservative reload of the active doc tab.
 *
 * Deliberately SEPARATE from state.ts's docs/prd watcher: that one is signal-
 * deduped on {version,phase,prdReady} and only re-fires when the PRD first
 * becomes ready — it would NOT fire when an already-ready PRD's CONTENT changes
 * (placeholder → real draft on the same path), which is exactly AC-1's case.
 *
 * IPC channel pushed to renderer: 'docs:changed' (payload: { projectDir, absPath })
 */

import fs from 'fs'
import path from 'path'
import { ipcMain, BrowserWindow } from 'electron'

// ── Module state ───────────────────────────────────────────────────────────────

let watcher: fs.FSWatcher | null = null
let watchedProjectDir: string | null = null
// Debounce: an editor/atomic-rename write fires multiple fs events for one save,
// and a multi-step author pass touches the file repeatedly. 300 ms collapses the
// burst to a single reload (AC-2 "연속 write 1회 수렴") without perceptible lag.
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// The most-recent changed absolute path within the debounce window (best-effort —
// a burst touching multiple files coalesces to the last; renderer path-matches).
let lastChangedAbs: string | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function broadcast(projectDir: string, absPath: string | null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('docs:changed', { projectDir, absPath })
    }
  }
}

function onChange(projectDir: string, absPath: string | null): void {
  if (absPath) lastChangedAbs = absPath
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const changed = lastChangedAbs
    lastChangedAbs = null
    broadcast(projectDir, changed)
  }, 300)
}

function teardown(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  lastChangedAbs = null
  try { watcher?.close() } catch { /* ignore */ }
  watcher = null
  watchedProjectDir = null
}

/**
 * (Re)arm the recursive watch on <projectDir>/docs.
 *
 * fs.watch with `recursive: true` is supported on macOS and Windows (the only
 * packaged targets); the watch covers every subdir (prd/, tickets/<v>/, …) and
 * any new doc created later. We filter to `.md` so unrelated churn (swap files)
 * doesn't trigger a reload. Idempotent: re-arming the same projectDir is a no-op.
 */
function arm(projectDir: string): void {
  if (watchedProjectDir === projectDir && watcher) return // already watching
  teardown()

  const docsRoot = path.join(projectDir, 'docs')
  if (!fs.existsSync(docsRoot)) return // nothing to watch (degrade silently)

  watchedProjectDir = projectDir
  try {
    watcher = fs.watch(docsRoot, { persistent: false, recursive: true }, (_evt, filename) => {
      // filename is relative to docsRoot; null on some platforms (→ null absPath,
      // renderer reloads the active doc tab conservatively).
      if (filename == null) {
        onChange(projectDir, null)
        return
      }
      const name = filename.toString()
      if (/\.md$/i.test(name)) {
        onChange(projectDir, path.join(docsRoot, name))
      }
    })
    watcher.on('error', () => {
      // Re-arm after a short delay (e.g. dir transiently removed/recreated).
      const dir = watchedProjectDir
      teardown()
      if (dir) setTimeout(() => arm(dir), 5_000)
    })
  } catch {
    // fs.watch (or recursive mode) unavailable — degrade gracefully; doc tabs
    // still re-read on remount as before.
    teardown()
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function register(): void {
  // Renderer (which owns projectDir) requests a watch. Idempotent per dir.
  ipcMain.handle('docs:watch', (_event, projectDir: string): void => {
    if (typeof projectDir === 'string' && projectDir) arm(projectDir)
  })
}

export function stopDocsWatch(): void {
  teardown()
}
