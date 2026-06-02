import fs from 'fs'
import path from 'path'
import os from 'os'
import type { PendingPromotion, PromotionScope, PromotionKind } from '@productune/core'

// ── Path helpers ────────────────────────────────────────────────────────────

/** Expand a leading `~` to the user's home directory. */
function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/**
 * Derive scope×kind from a legacy entry's target path when the canonical
 * `scope`/`kind` fields are absent. Mirrors the renderer fallback in
 * `PendingPromotionDrain.tsx` (tierLabel).
 *   - global  → path is under ~ / .productune; otherwise project.
 *   - bookshelf → path contains a `bookshelf/` segment; otherwise habit.
 */
function resolveScopeKind(promotion: PendingPromotion): { scope: PromotionScope; kind: PromotionKind } {
  if (promotion.scope && promotion.kind) {
    return { scope: promotion.scope, kind: promotion.kind }
  }
  const target = promotion.final_target ?? promotion.target ?? ''
  const scope: PromotionScope =
    target.startsWith('~') || target.includes('.productune') ? 'global' : 'project'
  const kind: PromotionKind = /(^|\/)bookshelf(\/|$)/.test(target) ? 'bookshelf' : 'habit'
  return { scope, kind }
}

/** Append `delta` to the resolved doctrine file, creating parent dirs as needed. */
function appendToTarget(target: string, delta: string): void {
  const resolved = expandHome(target)
  const dir = path.dirname(resolved)
  fs.mkdirSync(dir, { recursive: true })
  const line = delta.endsWith('\n') ? delta : delta + '\n'
  fs.appendFileSync(resolved, line, 'utf-8')
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MechanicalWriteResult {
  ok: boolean
  error?: string
}

/**
 * Execute the mechanical write for an approved/edited promotion.
 *
 * Dispatch is on `kind` against the already-resolved `target` path (the
 * candidate's `target` carries the FULL doctrine path, e.g.
 * `docs/<persona>/habit.md` or `~/.productune/<persona>/bookshelf/<file>.md`):
 *   - kind === 'bookshelf' → append `delta` to `target` (on-demand store).
 *   - kind === 'habit'     → append `delta` to `target` (human curation/merge
 *                            is a separate step; mechanical write just appends).
 * Legacy entries without `scope`/`kind` derive them from the `target` path.
 *
 * The abolished `wiki`/`work-note` tiers are no longer handled — there is no
 * `unknown tier` path for canonical entries.
 */
export async function mechanicalWrite(
  promotion: PendingPromotion,
  _opts?: { claudeSessionId?: string },
): Promise<MechanicalWriteResult> {
  const { kind } = resolveScopeKind(promotion)
  const target = promotion.target
  // Edited promotions carry the revised content in `final_target` (renderer
  // contract); fall back to the original delta otherwise.
  const effectiveDelta = promotion.final_target ?? promotion.delta

  try {
    if (kind === 'bookshelf' || kind === 'habit') {
      appendToTarget(target, effectiveDelta)
      return { ok: true }
    }
    // Unreachable for canonical scope×kind — kind is exhaustively 'habit' | 'bookshelf'.
    return { ok: false, error: `unknown kind: ${String(kind)}` }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
