/**
 * po-session-cycle.ts — PO session fresh-cycle decision (T-PATCH-040).
 *
 * Why: a PO claude session resumed over many turns (a) stops picking up doctrine
 * edits (the resumed session keeps its old system prompt — the "caveman" bug) and
 * (b) bloats context until compaction shaves spec tokens. The fix is to
 * periodically start a FRESH session (drop the resume id → next turn spawns
 * `claude --agent pdt-po`, re-reading doctrine + re-orienting from po-state).
 *
 * po-state is the work-state SoT, so the session is ephemeral — rotating it loses
 * no continuity. The chat.json messages are preserved (only the session id
 * rotates), so the visible conversation does not break.
 *
 * Hard constraint: NEVER cut mid-work. A threshold-driven cycle only fires at a
 * SAFE BOUNDARY — i.e. a ticket was closed or the phase changed since the current
 * session started. Phase change alone always cycles (it is itself a boundary).
 *
 * This module is pure decision/bookkeeping — it does NOT touch chat-store or the
 * runner; the caller (ipc/po.ts) applies the SID drop. Main-process only.
 */

import fs from 'fs'
import path from 'path'
import { initProject } from '@productune/core'
import { configPath, poStatePath } from './project-paths'

// ── Threshold ───────────────────────────────────────────────────────────────
//
// PO turn-count is the metric: deterministic and cheap (incremented at each
// turn's onDone). Kept well BELOW the claude compaction limit so compaction is
// only ever the last-resort safety net, never the primary context bound.
// Tunable; an optional context-size proxy (token/usage aggregation) is OOS.
export const PO_TURN_CYCLE_THRESHOLD = 20

// ── config guard (AC-7) ───────────────────────────────────────────────────────

/**
 * Best-effort: ensure .productune/config.json exists before PO session reads/writes
 * .productune/po-state.json. If config is absent, run initProject to write it.
 * Non-fatal — failure is logged to stderr but does not block the session.
 * This prevents "config-less .productune/" from being created by a PO session runner
 * that writes po-state.json before GUI has had a chance to open the project.
 */
function ensureConfig(projectDir: string): void {
  if (fs.existsSync(configPath(projectDir))) return
  try {
    const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project'
    initProject({ slug, projectDir })
  } catch (e) {
    process.stderr.write(`[po-session-cycle] config heal failed for ${projectDir}: ${e}\n`)
  }
}

// ── Per-project session tracking ──────────────────────────────────────────────

interface SessionTracker {
  /** PO turns completed in the CURRENT (post-cycle) session window. */
  turnCount: number
  /** po-state snapshot captured at session start — used to detect safe boundaries.
   *  Legacy: numeric current_phase. prdt (T-306): the flat `stage` string —
   *  a stage transition (define→build→ship→retro) is the same class of
   *  always-safe boundary as a legacy phase change. Compared for inequality only. */
  startPhase: number | string | null
  startTaskSlug: string | null
}

/** projectDir → tracker. Module-scope (single GUI process). */
const trackers = new Map<string, SessionTracker>()

// ── po-state read (minimal slice) ──────────────────────────────────────────────

interface PoStateSlice {
  /** Legacy numeric current_phase, or (T-306) the prdt flat `stage` string. */
  phase: number | string | null
  /** current_task.slug, or null when current_task is null/absent (ticket closed). */
  taskSlug: string | null
}

/**
 * Read the minimal po-state slice needed for boundary detection. Returns nulls
 * when po-state is absent/unparseable (echo-mode / fresh project) so the cycle
 * logic degrades to a safe no-cycle.
 */
function readPoStateSlice(projectDir: string): PoStateSlice {
  const statePath = poStatePath(projectDir)
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const obj = JSON.parse(raw) as Record<string, unknown>
    // Legacy: numeric current_phase. prdt (T-306): flat `stage` string — a
    // legacy po-state never carries `stage`, so the coalesce is prdt-only.
    const phase = typeof obj.current_phase === 'number' ? obj.current_phase
      : typeof obj.stage === 'string' ? obj.stage
      : null
    const ct = obj.current_task
    // Doctrine (state-hygiene): on ticket close PO nulls current_task. So a
    // non-null→null transition (or a slug change) signals a ticket boundary.
    const taskSlug =
      ct && typeof ct === 'object' && typeof (ct as Record<string, unknown>).slug === 'string'
        ? ((ct as Record<string, unknown>).slug as string)
        : null
    return { phase, taskSlug }
  } catch {
    return { phase: null, taskSlug: null }
  }
}

function ensureTracker(projectDir: string): SessionTracker {
  let t = trackers.get(projectDir)
  if (!t) {
    // AC-7: guarantee config.json exists before po-state access (best-effort, non-fatal).
    ensureConfig(projectDir)
    const slice = readPoStateSlice(projectDir)
    t = { turnCount: 0, startPhase: slice.phase, startTaskSlug: slice.taskSlug }
    trackers.set(projectDir, t)
  }
  return t
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface CycleDecision {
  cycle: boolean
  /** Diagnostic reason (for trace/announce). */
  reason: 'phase-change' | 'threshold+boundary' | null
}

/**
 * Evaluate whether THIS turn (about to start) should begin a fresh session.
 * Call at turn START (po:sendMessage), before spawning.
 *
 * Cycle when EITHER:
 *  - phase changed since session start (a phase boundary — always safe to cycle), OR
 *  - turnCount >= threshold AND a safe boundary was crossed since session start
 *    (the start-of-session ticket has since closed or changed).
 *
 * "Safe boundary crossed" = the current_task slug differs from the one captured
 * at session start. Per state-hygiene doctrine, closing a ticket nulls
 * current_task, and opening the next sets a new slug — either way the slug moves
 * off its session-start value. This guarantees we are NOT mid-work on the same
 * ticket we started the session on (AC1/AC2).
 */
export function evaluateCycle(projectDir: string): CycleDecision {
  const t = ensureTracker(projectDir)
  const now = readPoStateSlice(projectDir)

  // Phase change → always cycle (AC6). Compare only when both are known.
  if (t.startPhase !== null && now.phase !== null && now.phase !== t.startPhase) {
    return { cycle: true, reason: 'phase-change' }
  }

  // Threshold + safe boundary. Boundary = current_task moved off its
  // session-start slug (ticket closed → null, or a different ticket opened).
  if (t.turnCount >= PO_TURN_CYCLE_THRESHOLD) {
    const boundaryCrossed = now.taskSlug !== t.startTaskSlug
    if (boundaryCrossed) {
      return { cycle: true, reason: 'threshold+boundary' }
    }
  }

  return { cycle: false, reason: null }
}

/**
 * Reset the tracker to a fresh session window. Call right after applying a cycle
 * (SID dropped) AND on manual restart. Re-snapshots phase/task from current
 * po-state so the next window measures boundaries from here.
 */
export function resetSessionWindow(projectDir: string): void {
  const slice = readPoStateSlice(projectDir)
  trackers.set(projectDir, {
    turnCount: 0,
    startPhase: slice.phase,
    startTaskSlug: slice.taskSlug,
  })
}

/**
 * Record one completed PO turn. Call from the turn's onDone. Lazily snapshots
 * the session window on first turn for a project.
 */
export function recordTurnDone(projectDir: string): void {
  const t = ensureTracker(projectDir)
  t.turnCount += 1
}

/** Test/diagnostic hook — current turn count for a project (0 if untracked). */
export function getTurnCount(projectDir: string): number {
  return trackers.get(projectDir)?.turnCount ?? 0
}
