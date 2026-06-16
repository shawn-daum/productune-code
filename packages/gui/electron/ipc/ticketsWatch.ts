/**
 * ticketsWatch — fs.watch docs/tickets/<version>/*.md → IPC push (T-PATCH-172).
 *
 * Problem: TicketDashboardView (via useTicketScan) only re-scanned on mount /
 * tab-focus. When a ticket's frontmatter `status:` is edited on disk (PO
 * mechanical write), the board did not move the card until the user switched
 * tabs. The renderer side was ALREADY wired to react to a `tickets:changed`
 * push (preload `onTicketsChanged` + useTicketScan effect, 500ms debounce) —
 * but nothing in the main process ever emitted that event. This module is the
 * missing watcher.
 *
 * Pattern: mirrors usageWatch.ts (fs.watch + debounce + broadcast to all
 * windows). Difference: the path is project-scoped, so the renderer (which
 * owns projectDir) starts the watch via the `tickets:watch` IPC. The handler
 * is idempotent per projectDir — every consumer of useTicketScan calls it with
 * the same dir, so re-arming on an already-watched dir is a no-op.
 *
 * IPC channel pushed to renderer: 'tickets:changed' (payload: projectDir)
 */

import fs from 'fs'
import path from 'path'
import { ipcMain, BrowserWindow } from 'electron'

// ── Module state ───────────────────────────────────────────────────────────────

let watcher: fs.FSWatcher | null = null
let watchedDir: string | null = null
let watchedProjectDir: string | null = null
// Debounce: a single sed/write touches frontmatter then the file is closed,
// and atomic rename-based writes fire multiple events. 300 ms collapses a PO
// mechanical write burst without a perceptible lag on the board.
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function broadcast(projectDir: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('tickets:changed', projectDir)
    }
  }
}

function onChange(projectDir: string): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    broadcast(projectDir)
  }, 300)
}

function teardown(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  watcher?.close()
  watcher = null
  watchedDir = null
  watchedProjectDir = null
}

/**
 * (Re)arm the recursive watch on <projectDir>/docs/tickets.
 *
 * fs.watch with `recursive: true` is supported on macOS and Windows (the only
 * packaged targets); the watch covers every <version>/ subdir and any new
 * version dir created later. We filter to `.md` files so unrelated churn
 * (e.g. editor swap files) does not trigger a re-scan.
 *
 * Idempotent: if already watching the same projectDir, no-op.
 */
function arm(projectDir: string): void {
  if (watchedProjectDir === projectDir && watcher) return // already watching
  teardown()

  const ticketsRoot = path.join(projectDir, 'docs', 'tickets')
  if (!fs.existsSync(ticketsRoot)) return // nothing to watch (degrade silently)

  watchedProjectDir = projectDir
  watchedDir = ticketsRoot
  try {
    watcher = fs.watch(ticketsRoot, { persistent: false, recursive: true }, (_evt, filename) => {
      // filename is the path relative to ticketsRoot; null on some platforms.
      if (filename == null || /\.md$/i.test(filename.toString())) {
        onChange(projectDir)
      }
    })
    watcher.on('error', () => {
      // Re-arm after a short delay (e.g. dir transiently removed/recreated).
      const dir = watchedProjectDir
      teardown()
      if (dir) setTimeout(() => arm(dir), 5_000)
    })
  } catch {
    // fs.watch (or recursive mode) unavailable — feature degrades gracefully;
    // the board still refreshes on mount / tab-focus as before.
    teardown()
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function register(): void {
  // Renderer (which owns projectDir) requests a watch. Idempotent per dir.
  ipcMain.handle('tickets:watch', (_event, projectDir: string): void => {
    if (typeof projectDir === 'string' && projectDir) arm(projectDir)
  })
}

export function stopTicketsWatch(): void {
  teardown()
}
