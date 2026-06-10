import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Clipboard image attachment IPC (v0.5 T-PATCH-098) ────────────────────────
// Backs the chat composer's clipboard-image paste: the renderer decodes the
// pasted image to bytes (Blob.arrayBuffer → Uint8Array) and hands them here to
// be persisted to disk. We return an absolute path so the existing "attachment =
// path" mechanism (paperclip → openFilePicker → attachedFiles → `## Attached
// files`) carries it to PO unchanged — no message/runner format change needed.
//
// §4.c QA-feedback: storage moved from the permanent
// <projectDir>/.productune/attachments/ to an OS-temp subtree
// (app.getPath('temp')/productune/pasted) + 2-layer cleanup so pasted images do
// NOT accumulate forever:
//   - containment guard rebased to the temp root (path-traversal defense),
//   - extension whitelist (image types only — no arbitrary file writes),
//   - 20MB cap,
//   - collision-free filename (pasted-<timestamp>-<rand>.<ext>),
//   - L1 startup purge of orphans older than 24h,
//   - L2 attachments:cleanup IPC unlinks consumed temp paths (post-PO-read).
// Renderer NEVER touches fs directly — all writes flow through this IPC.

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
const MAX_IMAGE_BYTES = 20_000_000 // 20 MB — generous cap for a clipboard screenshot
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — L1 startup-purge age threshold

/** The dedicated temp subtree for pasted clipboard images. App-namespaced so
 *  cleanup only ever scans THIS folder (never sibling temp files). */
function tempRoot(): string {
  return path.join(app.getPath('temp'), 'productune', 'pasted')
}

/** Normalize a requested extension to a safe, whitelisted image ext (default png). */
function safeExt(ext: string | undefined): string {
  const e = (ext ?? 'png').toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '')
  return IMAGE_EXTS.has(e) ? e : 'png'
}

/** True when `p` resolves strictly under the temp `productune/pasted` root.
 *  Used by both the write guard and the cleanup guard so paperclip-picked
 *  originals (which live outside the temp root) can NEVER be unlinked. */
function isUnderTempRoot(p: string): boolean {
  const root = path.resolve(tempRoot())
  const resolved = path.resolve(p)
  return resolved === root || resolved.startsWith(root + path.sep)
}

/** L1 — purge orphaned pasted images older than ORPHAN_MAX_AGE_MS. best-effort:
 *  any failure (missing folder, permission, in-use) is swallowed and must not
 *  block boot. Runs once at register() time. */
function purgeOrphans(): void {
  try {
    const root = tempRoot()
    let entries: string[]
    try {
      entries = fs.readdirSync(root)
    } catch {
      return // folder absent → noop
    }
    const now = Date.now()
    for (const name of entries) {
      const full = path.join(root, name)
      try {
        const st = fs.statSync(full)
        if (st.isFile() && now - st.mtimeMs > ORPHAN_MAX_AGE_MS) {
          fs.unlinkSync(full)
        }
      } catch {
        /* per-file failure — swallow, continue */
      }
    }
  } catch {
    /* never block boot */
  }
}

export function register(): void {
  // L1 startup purge — clear orphaned temp attachments left by abnormal exits /
  // unsent pastes. Safety net for "no infinite storage".
  purgeOrphans()

  // ── attachments:saveImage ────────────────────────────────────────────────
  // Args: { projectDir, bytes (number[]/Uint8Array — IPC-serialized ArrayBuffer
  //         view), ext }. Writes app.getPath('temp')/productune/pasted/
  //         pasted-<timestamp>-<rand>.<ext> and returns its absolute path.
  // projectDir is retained for API compatibility but the write target is the
  // OS-temp subtree (§4.c), not under projectDir.
  ipcMain.handle(
    'attachments:saveImage',
    (
      _event,
      args: { projectDir: string; bytes: number[] | Uint8Array; ext?: string },
    ): { ok: boolean; path?: string; error?: string } => {
      const { bytes, ext } = args ?? ({} as any)
      if (!bytes || (bytes as any).length === 0) return { ok: false, error: 'no image bytes' }

      const buf = Buffer.from(bytes as any)
      if (buf.length === 0) return { ok: false, error: 'empty image' }
      if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'image too large' }

      try {
        const root = path.resolve(tempRoot())
        fs.mkdirSync(root, { recursive: true })

        const stamp = Date.now()
        const rand = Math.random().toString(36).slice(2, 8)
        const filename = `pasted-${stamp}-${rand}.${safeExt(ext)}`
        const dest = path.join(root, filename)

        // Containment: the resolved dest must stay strictly under the temp root.
        if (!isUnderTempRoot(dest)) {
          return { ok: false, error: 'path traversal rejected' }
        }

        fs.writeFileSync(dest, buf)
        return { ok: true, path: dest }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'save failed' }
      }
    },
  )

  // ── attachments:cleanup (L2 post-consume delete) ─────────────────────────
  // Args: { paths: string[] }. Unlinks each path ONLY if it resolves under the
  // temp `productune/pasted` root (containment guard). Paperclip-picked
  // originals living elsewhere are NEVER touched. Failures are swallowed.
  // Renderer calls this from ChatPanel right AFTER poSendMessage resolves — so
  // PO has already read the path; we never delete before consumption.
  ipcMain.handle(
    'attachments:cleanup',
    (_event, args: { paths: string[] }): { ok: boolean; removed: number } => {
      const paths = args?.paths ?? []
      let removed = 0
      for (const p of paths) {
        if (!p || !isUnderTempRoot(p)) continue // non-temp (paperclip) path → skip
        try {
          fs.unlinkSync(p)
          removed++
        } catch {
          /* missing / in-use — swallow */
        }
      }
      return { ok: true, removed }
    },
  )
}
