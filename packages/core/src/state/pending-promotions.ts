import fs from 'fs'
import path from 'path'

// ── Schema ────────────────────────────────────────────────────────────────────

export type PromotionTier = 'project' | 'wiki' | 'work-note'
export type PromotionStatus = 'pending' | 'approved' | 'dropped' | 'edited'

export interface PendingPromotion {
  id: string
  persona: string
  turn_id: string
  tier: PromotionTier
  target: string
  delta: string
  rationale: string
  status: PromotionStatus
  surfaced_at?: string
  decided_at?: string
  final_target?: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function statePath(projectDir: string): string {
  return path.join(projectDir, '.productune', 'po-state.json')
}

function readState(statePath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeStateAtomic(filePath: string, state: Record<string, unknown>): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, filePath)
}

function getPromotions(state: Record<string, unknown>): PendingPromotion[] {
  const raw = state['pending_promotions']
  if (!Array.isArray(raw)) return []
  return raw as PendingPromotion[]
}

/** Generate `promo-<YYYYMMDD>-<NNN>` id, unique within existing list. */
function generateId(existing: PendingPromotion[]): string {
  const date = new Date()
  const ymd =
    String(date.getFullYear()) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const prefix = `promo-${ymd}-`
  const used = new Set(
    existing.filter((p) => p.id.startsWith(prefix)).map((p) => p.id),
  )
  let seq = 1
  while (used.has(`${prefix}${String(seq).padStart(3, '0')}`)) seq++
  return `${prefix}${String(seq).padStart(3, '0')}`
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a promotion candidate into pending_promotions[].
 * Called when PO cannot surface inline (background sub-agent result).
 */
export function appendPendingPromotion(
  projectDir: string,
  candidate: Omit<PendingPromotion, 'id' | 'status'>,
): PendingPromotion {
  const sp = statePath(projectDir)
  const state = readState(sp)
  const promotions = getPromotions(state)
  const id = generateId(promotions)
  const entry: PendingPromotion = {
    ...candidate,
    id,
    status: 'pending',
  }
  state['pending_promotions'] = [...promotions, entry]
  writeStateAtomic(sp, state)
  return entry
}

/**
 * List pending (unresolved) promotions for the project.
 */
export function listPendingPromotions(projectDir: string): PendingPromotion[] {
  const sp = statePath(projectDir)
  const state = readState(sp)
  return getPromotions(state).filter((p) => p.status === 'pending')
}

/**
 * Resolve a promotion: approved | dropped | edited.
 * Sets decided_at; for edited, populates final_target.
 */
export function resolvePendingPromotion(
  projectDir: string,
  id: string,
  status: 'approved' | 'dropped' | 'edited',
  finalTarget?: string,
): PendingPromotion | null {
  const sp = statePath(projectDir)
  const state = readState(sp)
  const promotions = getPromotions(state)
  const idx = promotions.findIndex((p) => p.id === id)
  if (idx < 0) return null

  const updated: PendingPromotion = {
    ...promotions[idx],
    status,
    decided_at: new Date().toISOString(),
  }
  if (status === 'edited' && finalTarget !== undefined) {
    updated.final_target = finalTarget
  }
  promotions[idx] = updated
  state['pending_promotions'] = promotions
  writeStateAtomic(sp, state)
  return updated
}

/**
 * Auto-drop entries with surfaced_at older than 7 days.
 * Called at turn-start sweep.
 * Returns the count of entries dropped.
 */
export function autoDropStale(projectDir: string): number {
  const sp = statePath(projectDir)
  const state = readState(sp)
  const promotions = getPromotions(state)
  const now = Date.now()
  let dropped = 0
  const updated = promotions.map((p) => {
    if (p.status !== 'pending') return p
    if (!p.surfaced_at) return p
    const age = now - new Date(p.surfaced_at).getTime()
    if (age > STALE_MS) {
      dropped++
      return { ...p, status: 'dropped' as PromotionStatus, decided_at: new Date().toISOString() }
    }
    return p
  })
  if (dropped > 0) {
    state['pending_promotions'] = updated
    writeStateAtomic(sp, state)
  }
  return dropped
}

/**
 * Mark an entry's surfaced_at to now (first surface).
 * Used by the drain UI when it first shows an entry.
 */
export function markSurfaced(projectDir: string, id: string): void {
  const sp = statePath(projectDir)
  const state = readState(sp)
  const promotions = getPromotions(state)
  const idx = promotions.findIndex((p) => p.id === id && !p.surfaced_at)
  if (idx < 0) return
  promotions[idx] = { ...promotions[idx], surfaced_at: new Date().toISOString() }
  state['pending_promotions'] = promotions
  writeStateAtomic(sp, state)
}

/**
 * Read all promotions (all statuses) for retrospective / archive use.
 */
export function listAllPromotions(projectDir: string): PendingPromotion[] {
  const sp = statePath(projectDir)
  const state = readState(sp)
  return getPromotions(state)
}
