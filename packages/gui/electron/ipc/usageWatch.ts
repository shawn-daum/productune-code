/**
 * usageWatch — fs.watch ~/.productune/usage-state.json → IPC push (T-025).
 *
 * The statusLine hook script writes rate_limits data to this file on each
 * statusline refresh. Only available for claude.ai / firstParty subscribers.
 * When the file is absent or malformed, no event is emitted (no crash).
 *
 * LEGACY-ONLY (adapter A7, T-290): this global (home-dir, not per-project)
 * rate-limit side-effect file is a legacy-statusline artifact — v1's
 * statusline is display-only (docs/prdt-v1-design.md §10), so it never exists
 * for prdt projects and this module is intentionally left untouched for them.
 * The renderer (`src/components/workspace/chat/UsageBar.tsx`) branches on
 * `isPrdtPoState` and, for prdt projects, sources its near-live metric (cost,
 * not rate-limit %) from `<projectDir>/.prdt/turns.jsonl` via the existing
 * `cost:aggregate`/`cost:watch` IPC in `./costArchive.ts` instead of this file.
 *
 * IPC channel pushed to renderer: 'productune:usage-update'
 * Payload: UsagePayload — see type below.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { BrowserWindow } from 'electron'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsageAxis {
  used_percentage: number
  /** ISO timestamp string or unix epoch seconds */
  resets_at?: string | number
}

export interface UsagePayload {
  five_hour?: UsageAxis
  seven_day?: UsageAxis
}

// ── Module state ───────────────────────────────────────────────────────────────

const USAGE_FILE = path.join(os.homedir(), '.productune', 'usage-state.json')
let watcher: fs.FSWatcher | null = null
// Debounce: rapid rename-based atomic writes can fire two events in quick
// succession. 200 ms is enough to collapse them without noticeable lag.
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

function readPayload(): UsagePayload | null {
  try {
    const raw = fs.readFileSync(USAGE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const out: UsagePayload = {}
    for (const key of ['five_hour', 'seven_day'] as const) {
      const axis = parsed[key]
      if (
        axis &&
        typeof axis === 'object' &&
        typeof axis.used_percentage === 'number'
      ) {
        out[key] = {
          used_percentage: axis.used_percentage,
          ...(axis.resets_at != null ? { resets_at: axis.resets_at } : {}),
        }
      }
    }
    // Return null when neither axis is present (non-subscriber file fragment).
    if (!out.five_hour && !out.seven_day) return null
    return out
  } catch {
    return null
  }
}

function broadcast(payload: UsagePayload): void {
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('productune:usage-update', payload)
    }
  }
}

function onFileChange(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const payload = readPayload()
    if (payload) broadcast(payload)
  }, 200)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start watching usage-state.json.
 * Called once from main.ts after the app is ready.
 *
 * Uses fs.watch (inode-level); falls back gracefully if the file does not yet
 * exist — the watch is set up on the parent directory so it catches creation.
 */
export function startUsageWatch(): void {
  if (watcher) return // already watching

  const dir = path.dirname(USAGE_FILE)

  // Ensure the ~/.productune directory exists so we can watch it.
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // Best-effort; if we can't create it we still try to watch.
  }

  // Watch the parent directory: this catches both modifications and creation
  // of usage-state.json (e.g. first time the statusline script writes it).
  try {
    watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
      if (filename === 'usage-state.json') {
        onFileChange()
      }
    })
    watcher.on('error', () => {
      // Silently close and re-arm after a short delay.
      watcher?.close()
      watcher = null
      setTimeout(startUsageWatch, 5_000)
    })
  } catch {
    // fs.watch unavailable — no-op, feature degrades gracefully.
  }

  // Emit current state on startup if the file already exists.
  const initial = readPayload()
  if (initial) broadcast(initial)
}

/**
 * Read the current usage-state.json without broadcasting.
 * Used by main.ts to push the initial payload to each new window on
 * did-finish-load, covering the case where startUsageWatch() ran before any
 * BrowserWindow was created (T-025 fix-round-1).
 */
export function readInitialPayload(): UsagePayload | null {
  return readPayload()
}

export function stopUsageWatch(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  watcher?.close()
  watcher = null
}
