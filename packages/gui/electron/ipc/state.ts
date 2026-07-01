import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  appendPendingPromotion,
  listPendingPromotions,
  resolvePendingPromotion,
  autoDropStale,
  markSurfaced,
  listAllPromotions,
} from '@productune/core'
import type { PendingPromotion } from '@productune/core'
import { mechanicalWrite } from '../mechanical-write'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovePhaseArgs {
  projectDir: string
  fromPhase: number       // gate.from_phase (1..5)
  toPhase: number         // gate.to_phase (2..5)
  summary?: string        // gate.summary
  userApprovedAt: string  // ISO timestamp (client-generated)
}

// ── po-state watcher (T-PATCH-269 #15) ──────────────────────────────────────────
//
// GUI needs to react to po-state.json mutations in real time (version created,
// phase transition, PRD becoming ready) — the one-shot WorkspaceShell readPoState
// only ran on projectDir change, so mid-session lifecycle changes were invisible.
//
// po-state.json is rewritten on EVERY PO turn (recent_turns churn etc.), so a naive
// re-broadcast would cause a render storm. We re-read+parse on change, derive a
// small signal { version, phase, prdReady }, and ONLY push when that signal differs
// from the last pushed one. The full parsed state rides along in the payload so the
// renderer routes it through the SAME setPoState path as the one-shot read.
//
// We watch the .productune PARENT DIR (not po-state.json directly). A direct file
// watch goes stale after one atomic-rename write (write temp → rename over), which
// would force a re-arm on every event → an unbounded FSWatcher/fd leak across the
// session. The parent-dir watch is a durable handle that survives the atomic renames
// AND equally catches the non-atomic in-place writeFileSync paths (phase:approve),
// since they also write inside .productune. Debounced ~200ms to collapse the burst.
//
// T-PATCH-275 (#14 fix): we ALSO watch docs/prd/. ROOT CAUSE of the missed PRD
// auto-open: the PRD doc (docs/prd/PRD.md or versions/<v>.md) is written OUTSIDE
// .productune, in a SEPARATE step after the version is created in po-state. So the
// po-state write fired the watcher while PRD.md did not yet exist (prdReady=false →
// no auto-nav), and the later PRD.md creation was invisible to a .productune-only
// watch → prdReady never flipped true → the MainPanel never auto-opened the PRD.
// Watching docs/prd/ re-emits the signal when the PRD file lands, so prdReady flips
// true and the renderer's #14 auto-nav fires. Both watchers feed the same debounce +
// same signal-dedup, so this adds no render storm.
//
// IPC channel pushed to renderer: 'state:poStateChanged' (payload: PoStateChangePayload)

interface PoStateChangePayload {
  projectDir: string
  state: unknown          // parsed po-state (or null when missing) — same shape readPoState returns
  prdReady: boolean       // PRD doc exists for current_version (#14 auto-nav gate)
  prdPath: string | null  // ABSOLUTE path of the PRD doc that exists (the one #14 opens) — null when none
}

let poDirWatcher: fs.FSWatcher | null = null
let prdDirWatcher: fs.FSWatcher | null = null   // T-275 #14 fix: docs/prd/ watch
let poWatchedProjectDir: string | null = null
let poDebounceTimer: ReturnType<typeof setTimeout> | null = null
// Last pushed signal — guards against the render storm (no-op when unchanged).
let lastSignal: string | null = null

function poStatePath(projectDir: string): string {
  return path.join(projectDir, '.productune', 'po-state.json')
}

/** Read + parse po-state.json. null on missing/unreadable/corrupt (watcher path
 *  is best-effort — a transient mid-write parse failure must not push garbage). */
function readPoStateSafe(projectDir: string): any {
  try {
    return JSON.parse(fs.readFileSync(poStatePath(projectDir), 'utf-8'))
  } catch {
    return null
  }
}

/**
 * T-PATCH-269 FIX-2: the SINGLE shared PRD candidate set, in precedence order.
 * BOTH the main-process prdReady gate AND the path the renderer opens for #14
 * auto-nav resolve through THIS list, so the gate and the opened tab can never
 * disagree (the old divergence: gate checked versions/<v>.md but the opener fell
 * back to a non-existent PRD.md). Mirrors PrdSection: anchor → master → snapshot.
 */
export function prdCandidatePaths(projectDir: string, state: any): string[] {
  const currentVersion: string | undefined = state?.current_version
  if (!currentVersion) return []
  const candidates: string[] = []
  const version = Array.isArray(state?.versions)
    ? state.versions.find((v: any) => v?.id === currentVersion)
    : undefined
  const anchor = typeof version?.prd_anchor === 'string' ? version.prd_anchor.trim() : ''
  if (anchor) {
    candidates.push(anchor.startsWith('/') ? anchor : path.join(projectDir, anchor.replace(/^\.?\//, '')))
  }
  candidates.push(path.join(projectDir, 'docs', 'prd', 'PRD.md'))
  candidates.push(path.join(projectDir, 'docs', 'prd', 'versions', `${currentVersion}.md`))
  return candidates
}

/** Resolve the FIRST existing PRD candidate, or null when none exist. The path the
 *  #14 auto-nav opens — guaranteed to point at a file that actually exists. */
function resolveExistingPrd(projectDir: string, state: any): string | null {
  for (const p of prdCandidatePaths(projectDir, state)) {
    try { if (fs.statSync(p).isFile()) return p } catch { /* next */ }
  }
  return null
}

function broadcastPoState(payload: PoStateChangePayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('state:poStateChanged', payload)
  }
}

function computeSignal(projectDir: string, state: any): { signal: string; prdPath: string | null } {
  const prdPath = resolveExistingPrd(projectDir, state)
  // Signal = the trio the GUI actually reacts to (#11 layout, #14 auto-nav). When
  // unchanged we skip the broadcast entirely — po-state is rewritten every PO turn.
  const signal = JSON.stringify({
    v: state?.current_version ?? null,
    p: state?.current_phase ?? null,
    r: prdPath !== null,
  })
  return { signal, prdPath }
}

/** T-275 #14 fix: arm the docs/prd/ recursive watch if present and not yet armed.
 *  Idempotent; safe to call lazily from the debounce (covers a docs/prd dir created
 *  AFTER the watcher was first armed on a fresh project). */
function armPrdDirWatch(projectDir: string): void {
  if (prdDirWatcher) return
  try {
    const prdDir = path.join(projectDir, 'docs', 'prd')
    if (!fs.existsSync(prdDir)) return
    prdDirWatcher = fs.watch(prdDir, { persistent: false, recursive: true }, () => {
      onPoStateChange(projectDir)
    })
    prdDirWatcher.on('error', () => {
      try { prdDirWatcher?.close() } catch { /* ignore */ }
      prdDirWatcher = null
    })
  } catch {
    prdDirWatcher = null
  }
}

function onPoStateChange(projectDir: string): void {
  if (poDebounceTimer) clearTimeout(poDebounceTimer)
  poDebounceTimer = setTimeout(() => {
    poDebounceTimer = null
    // Lazily arm the PRD-dir watch in case docs/prd was created after arm time.
    armPrdDirWatch(projectDir)
    const state = readPoStateSafe(projectDir)
    const { signal, prdPath } = computeSignal(projectDir, state)
    if (signal === lastSignal) return
    lastSignal = signal
    broadcastPoState({ projectDir, state, prdReady: prdPath !== null, prdPath })
  }, 200)
}

function teardownPoWatch(): void {
  if (poDebounceTimer) { clearTimeout(poDebounceTimer); poDebounceTimer = null }
  try { poDirWatcher?.close() } catch { /* ignore */ }
  try { prdDirWatcher?.close() } catch { /* ignore */ }
  poDirWatcher = null
  prdDirWatcher = null
  poWatchedProjectDir = null
  lastSignal = null
}

/** Arm a SINGLE durable watch on <projectDir>/.productune. Idempotent per projectDir. */
function armPoWatch(projectDir: string): void {
  if (poWatchedProjectDir === projectDir && poDirWatcher) return
  teardownPoWatch()

  const dir = path.join(projectDir, '.productune')
  if (!fs.existsSync(dir)) return  // nothing to watch yet — degrade silently

  poWatchedProjectDir = projectDir
  // Seed lastSignal from current on-disk state so the first real change pushes
  // (and an immediate spurious event right after arm doesn't double-push the seed).
  lastSignal = computeSignal(projectDir, readPoStateSafe(projectDir)).signal
  try {
    // Parent-dir watch — survives atomic-rename writes that swap po-state.json's inode.
    poDirWatcher = fs.watch(dir, { persistent: false }, (_evt, filename) => {
      if (filename == null || /^po-state\.json/i.test(filename.toString())) {
        onPoStateChange(projectDir)
      }
    })
    poDirWatcher.on('error', () => {
      const pd = poWatchedProjectDir
      teardownPoWatch()
      if (pd) setTimeout(() => armPoWatch(pd), 5_000)
    })
  } catch {
    teardownPoWatch()
  }

  // T-PATCH-275 (#14 fix): also watch docs/prd/ so a PRD doc written AFTER the version
  // (a separate step, outside .productune) re-emits the signal → prdReady flips true →
  // the renderer auto-opens the PRD. Lazily re-armed from the debounce if docs/prd is
  // created later (fresh project). A PRD write that doesn't change {v,p,r} is deduped
  // away by computeSignal, so no extra renders.
  armPrdDirWatch(projectDir)
}

/** Stop the po-state watcher (called on app quit, mirrors stopTicketsWatch). */
export function stopPoStateWatch(): void {
  teardownPoWatch()
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // T-PATCH-269 #15: renderer (owns projectDir) arms the watch. Idempotent per dir.
  ipcMain.handle('state:watchPoState', (_event, projectDir: string): void => {
    if (typeof projectDir === 'string' && projectDir) armPoWatch(projectDir)
  })
  ipcMain.handle('state:unwatchPoState', (): void => {
    teardownPoWatch()
  })

  // T-PATCH-167: distinguish parse-failure from missing/new.
  //  - file missing (ENOENT)  → null  (genuine empty/new → renderer keeps "대기 중" placeholder)
  //  - read/parse failure      → { ok:false, error:'parse' } (renderer shows explicit error)
  //  - success                 → parsed po-state object
  ipcMain.handle('state:readPoState', async (_event, projectDir: string) => {
    const statePath = path.join(projectDir, '.productune', 'po-state.json')
    let raw: string
    try {
      raw = fs.readFileSync(statePath, 'utf-8')
    } catch (e: any) {
      // ENOENT (or any read error) ⇒ treat as "no po-state yet" → null.
      if (e?.code === 'ENOENT') return null
      return { ok: false, error: 'parse' as const, detail: e?.message ?? 'read error' }
    }
    try {
      return JSON.parse(raw)
    } catch (e: any) {
      // File exists but is corrupt/unparseable — surface as explicit error,
      // NOT null (which would masquerade as a fresh project).
      return { ok: false, error: 'parse' as const, detail: e?.message ?? 'JSON parse error' }
    }
  })

  // ── Phase approve IPC (T-P4-115) ──────────────────────────────────────────────
  // Direct mechanical write to po-state.json on user [승인 →] click.
  // Updates current_phase, appends phase_history entry, clears pending_gate.
  ipcMain.handle('phase:approve', (_event, args: ApprovePhaseArgs): { ok: boolean; error?: string } => {
    const statePath = path.join(args.projectDir, '.productune', 'po-state.json')
    try {
      const raw = fs.readFileSync(statePath, 'utf-8')
      const state = JSON.parse(raw)

      state.current_phase = args.toPhase

      if (!Array.isArray(state.phase_history)) state.phase_history = []
      state.phase_history.push({
        phase: args.toPhase,
        started_at: args.userApprovedAt,
        summary: args.summary ?? '',
        user_approved_at: args.userApprovedAt,
      })

      state.pending_gate = null

      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'unknown error' }
    }
  })

  ipcMain.handle('state:appendPendingPromotion', (
    _event,
    projectDir: string,
    candidate: Omit<PendingPromotion, 'id' | 'status'>,
  ): PendingPromotion => {
    return appendPendingPromotion(projectDir, candidate)
  })

  ipcMain.handle('state:listPendingPromotions', (
    _event,
    projectDir: string,
  ): PendingPromotion[] => {
    return listPendingPromotions(projectDir)
  })

  ipcMain.handle('state:resolvePendingPromotion', (
    _event,
    projectDir: string,
    id: string,
    status: 'approved' | 'dropped' | 'edited',
    finalTarget?: string,
  ): PendingPromotion | null => {
    return resolvePendingPromotion(projectDir, id, status, finalTarget)
  })

  ipcMain.handle('state:autoDropStale', (
    _event,
    projectDir: string,
  ): number => {
    return autoDropStale(projectDir)
  })

  ipcMain.handle('state:markSurfaced', (
    _event,
    projectDir: string,
    id: string,
  ): void => {
    markSurfaced(projectDir, id)
  })

  ipcMain.handle('state:listAllPromotions', (
    _event,
    projectDir: string,
  ): PendingPromotion[] => {
    return listAllPromotions(projectDir)
  })

  ipcMain.handle(
    'state:mechanicalWrite',
    async (
      _event,
      promotion: PendingPromotion,
      claudeSessionId?: string,
    ) => {
      return mechanicalWrite(promotion, { claudeSessionId })
    },
  )

  // ── Deploy modal trigger (T-P4-022 — PO fires state:openDeployModal) ──────────
  // PO (or any main-process code) calls this IPC to open the DeployConfirmModal
  // in the renderer. Renderer listens via preload `onDeployModal`.
  ipcMain.handle(
    'state:openDeployModal',
    (
      event,
      payload: {
        tickets: Array<{ id: string; title: string }>
        gitRef: string
        project: string
        projectDir?: string
        owner?: string
        repo?: string
        branchName?: string
        ticketId?: string
        ticketTitle?: string
        ticketAcceptance?: string
        vercelProject?: string
      },
    ): void => {
      event.sender.send('deploy:openModal', payload)
    },
  )
}
