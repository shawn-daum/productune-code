/**
 * projectEnv IPC — build-target project .env* viewer/editor (T-PATCH-076 rev).
 *
 * Channels:
 *   projectEnv:read  (projectDir) → { files: FileGroup[] }
 *   projectEnv:write (projectDir, filename, entries, originalRaw) → { ok, error? }
 *
 * Enumerates ALL .env* files in projectDir (glob pattern).
 * Write targets a named file; filename validated against /^\.env[a-zA-Z0-9._-]*$/.
 *
 * SECURITY:
 *   - Values are NEVER logged; only e.message is surfaced on error.
 *   - Written files get mode 0o600 (writeFileSync + chmodSync pair).
 *   - filename parameter validated before path.join (no traversal).
 */

import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnvEntry {
  key: string
  value: string
}

export interface FileGroup {
  filename: string
  entries: EnvEntry[]
  raw: string
}

interface ReadResult {
  files: FileGroup[]
}

interface WriteResult {
  ok: boolean
  error?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Valid .env* filename: starts with ".env", followed by optional [a-zA-Z0-9._-] chars. */
const ENV_FILENAME_RE = /^\.env[a-zA-Z0-9._-]*$/

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enumerate .env* files in a directory.
 * Returns filenames sorted: .env first, then alphabetically.
 * Only files (not symlinks) matching ENV_FILENAME_RE are included.
 */
function listEnvFiles(dir: string): string[] {
  try {
    const dirEntries = fs.readdirSync(dir, { withFileTypes: true })
    const names = dirEntries
      .filter((e) => e.isFile() && ENV_FILENAME_RE.test(e.name))
      .map((e) => e.name)
    names.sort((a, b) => {
      if (a === '.env') return -1
      if (b === '.env') return 1
      return a.localeCompare(b)
    })
    return names
  } catch {
    return []
  }
}

/**
 * Parse .env content into key-value entries.
 * Only collects KEY=value lines; skips comment (#) and blank lines.
 * Value is preserved as-is (no trimming, no quote stripping).
 * NEVER logs values.
 */
function parseEnv(raw: string): EnvEntry[] {
  const entries: EnvEntry[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    if (!key) continue
    // Value = everything after the first '=' (multi-'=' in value preserved)
    const value = trimmed.slice(eqIdx + 1)
    entries.push({ key, value })
  }
  return entries
}

/**
 * Re-serialize .env for round-trip:
 *   - Walk raw lines; replace value for keys still present (original position).
 *   - Drop lines whose key was removed by the user.
 *   - Append new keys (not found in raw) at end.
 *   - Preserve comment and blank lines verbatim.
 * Ensures a trailing newline.
 * NEVER logs values.
 */
function serializeEnv(raw: string, entries: EnvEntry[]): string {
  const entryMap = new Map<string, string>(entries.map((e) => [e.key, e.value]))
  const handled = new Set<string>()
  const outLines: string[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    // Preserve blank + comment lines verbatim
    if (!trimmed || trimmed.startsWith('#')) {
      outLines.push(line)
      continue
    }
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) {
      // Non-parseable line (e.g. malformed) — preserve
      outLines.push(line)
      continue
    }
    const key = trimmed.slice(0, eqIdx).trim()
    if (!key) {
      outLines.push(line)
      continue
    }
    if (entryMap.has(key)) {
      // Replace value; use key as given in entry (trim-normalized)
      outLines.push(`${key}=${entryMap.get(key)!}`)
      handled.add(key)
    }
    // Keys not in entryMap → dropped (removed by user)
  }

  // Append brand-new keys (not present in original raw)
  for (const { key, value } of entries) {
    if (!handled.has(key)) {
      outLines.push(`${key}=${value}`)
    }
  }

  let content = outLines.join('\n')
  // Ensure trailing newline
  if (content && !content.endsWith('\n')) content += '\n'
  return content
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  /**
   * projectEnv:read
   * Enumerates all .env* files in projectDir and returns parsed entries + raw text.
   * Files that cannot be read are skipped (logged by e.message only).
   * Returns { files: [] } when none found.
   * NEVER logs values.
   */
  ipcMain.handle('projectEnv:read', (_event, projectDir: string): ReadResult => {
    const filenames = listEnvFiles(projectDir)
    const files: FileGroup[] = []
    for (const filename of filenames) {
      try {
        const filePath = path.join(projectDir, filename)
        const raw = fs.readFileSync(filePath, 'utf-8')
        const entries = parseEnv(raw)
        // Do NOT log entries — they contain secret values
        files.push({ filename, entries, raw })
      } catch (e: any) {
        // Surface only structural error — skip unreadable files rather than aborting
        console.error(`[projectEnv:read] fs error for ${filename}:`, e?.message)
      }
    }
    return { files }
  })

  /**
   * projectEnv:write
   * Writes <projectDir>/<filename> with mode 0o600.
   * filename validated against ENV_FILENAME_RE to prevent path traversal.
   * Uses originalRaw for comment/blank-line round-trip preservation.
   * chmodSync after write enforces 0600 even on pre-existing wider-mode files.
   * NEVER logs values.
   */
  ipcMain.handle(
    'projectEnv:write',
    (
      _event,
      projectDir: string,
      filename: string,
      entries: EnvEntry[],
      originalRaw: string,
    ): WriteResult => {
      // Security: validate filename — no path separators, no traversal
      if (!ENV_FILENAME_RE.test(filename)) {
        return { ok: false, error: `Invalid filename: ${filename}` }
      }
      try {
        const filePath = path.join(projectDir, filename)
        const content = serializeEnv(originalRaw, entries)
        // 0o600 on write (correct mode on new file creation)
        fs.writeFileSync(filePath, content, { mode: 0o600 })
        // Enforce 0600 on pre-existing file that may have had wider mode
        fs.chmodSync(filePath, 0o600)
        return { ok: true }
      } catch (e: any) {
        // Only surface error message — no values ever exposed
        return { ok: false, error: e?.message ?? 'write failed' }
      }
    },
  )
}
