import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Local .html read/write IPC (v0.5 T-PATCH-032) ────────────────────────────
// Backs HtmlViewer: read a project-scoped .html / .htm file for Preview + the
// raw-source editor, and write the edited source back to disk. Modeled on the
// doctrine:readFile / doctrine:writeFile pair (electron/ipc/doctrine.ts):
//   - containment check (path must resolve inside projectDir) — traversal guard,
//   - .html / .htm extension whitelist (no arbitrary project file writes),
//   - mtime-conflict guard on write (reject stale overwrites, no silent clobber),
//   - atomic temp-file write (write .tmp, rename into place).
// Deliberately scoped to this viewer's use case — NOT a general project writer.

const HTML_EXTS = new Set(['.html', '.htm'])
const MAX_FILE_BYTES = 2_000_000 // 2 MB — mirrors search.ts read cap

/**
 * Guard a candidate path for the HTML viewer. Confirms:
 *   - projectDir + absPath both present,
 *   - the file extension is .html / .htm,
 *   - the resolved path is projectDir itself or strictly under it (no `..`).
 * Returns the resolved absolute path on success.
 */
function guardHtmlPath(
  projectDir: string | undefined,
  absPath: string,
): { ok: true; resolved: string } | { ok: false; error: string } {
  if (!projectDir) return { ok: false, error: 'projectDir is required' }
  if (!absPath) return { ok: false, error: 'path is required' }
  const ext = path.extname(absPath).toLowerCase()
  if (!HTML_EXTS.has(ext)) {
    return { ok: false, error: 'only .html / .htm files allowed' }
  }
  const root = path.resolve(projectDir)
  const resolved = path.resolve(absPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { ok: false, error: 'path traversal rejected' }
  }
  return { ok: true, resolved }
}

export function register(): void {
  // ── html:readFile ──────────────────────────────────────────────────────────
  // Returns the raw HTML source + mtime stamp (for the editor's conflict guard).
  ipcMain.handle(
    'html:readFile',
    (_event, projectDir: string, absPath: string) => {
      const guard = guardHtmlPath(projectDir, absPath)
      if (!guard.ok) return { ok: false, error: guard.error }
      try {
        if (!fs.existsSync(guard.resolved)) {
          return { ok: true, content: '', exists: false, mtimeMs: null }
        }
        const stat = fs.statSync(guard.resolved)
        if (stat.size > MAX_FILE_BYTES) return { ok: false, error: 'file too large' }
        const content = fs.readFileSync(guard.resolved, 'utf-8')
        return { ok: true, content, exists: true, mtimeMs: stat.mtimeMs }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    },
  )

  // ── html:writeFile ─────────────────────────────────────────────────────────
  // Conflict-aware, atomic write of the edited HTML source back to disk.
  ipcMain.handle(
    'html:writeFile',
    (_event, projectDir: string, absPath: string, content: string, expectedMtimeMs?: number | null) => {
      const guard = guardHtmlPath(projectDir, absPath)
      if (!guard.ok) return { ok: false, error: guard.error }
      const { resolved } = guard
      try {
        // Conflict check: reject when the on-disk mtime drifted from the stamp
        // captured at read time — surfaced, not silently overwritten.
        if (expectedMtimeMs != null && fs.existsSync(resolved)) {
          const currentMtimeMs = fs.statSync(resolved).mtimeMs
          if (currentMtimeMs !== expectedMtimeMs) {
            return { ok: false, error: 'conflict', conflict: true, currentMtimeMs }
          }
        }
        // Atomic write: write tmp, rename into place.
        const tmp = resolved + '.tmp'
        fs.writeFileSync(tmp, content, 'utf-8')
        fs.renameSync(tmp, resolved)
        const mtimeMs = fs.statSync(resolved).mtimeMs
        return { ok: true, mtimeMs }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'write failed' }
      }
    },
  )
}
