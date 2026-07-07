/**
 * phase-mapping — unit cases for the prdt (v1) stage adapter (T-287, adapter A4).
 *
 * Covers the acceptance bullets directly:
 *   - a prdt po-state (flat `stage` string) resolves its OWN display def
 *     (name/color) via getActiveStageDef, distinct from the legacy PHASE_DEFS.
 *   - a legacy po-state (`current_phase` numeric) is never misclassified as
 *     prdt, and getActivePhaseIndex/getActivePhaseDef (legacy, untouched)
 *     keep behaving exactly as before.
 *   - no po-state / null / an unrecognized `stage` value never throws — always
 *     resolves to a safe default index (0).
 *
 * Follows the T-PATCH-137 / T-286 (src/lib/useTicketScan.test.ts) precedent:
 * framework-free case list + a single vitest driver.
 */

import {
  isPrdtPoState,
  getActiveStageIndex,
  getActiveStageDef,
  getActivePhaseIndex,
  getActivePhaseDef,
  bridgePrdtVersion,
  hasPrdtWorkTrace,
  STAGE_DEFS,
} from './phase-mapping'
import type { PoState } from './types'

// ── isPrdtPoState ─────────────────────────────────────────────────────────────

interface KindCase {
  readonly label: string
  readonly poState: PoState | null
  readonly expected: boolean
}

export const KIND_CASES: readonly KindCase[] = [
  {
    label: 'prdt 4-field shape (stage present) → true',
    poState: { schema_version: 1, stage: 'build', version: 'v1.1', current_task: { ticket_id: 'T-287', slug: 'x', assignee: 'developer' } },
    expected: true,
  },
  {
    label: 'legacy shape (current_phase present, no stage) → false',
    poState: { schema_version: 2, current_phase: 3 },
    expected: false,
  },
  { label: 'null poState → false', poState: null, expected: false },
  { label: 'empty object → false', poState: {}, expected: false },
]

// ── getActiveStageIndex / getActiveStageDef ──────────────────────────────────

interface StageCase {
  readonly label: string
  readonly poState: PoState | null
  readonly expectedIndex: number
  readonly expectedKey: string
}

export const STAGE_CASES: readonly StageCase[] = [
  { label: 'define', poState: { stage: 'define' }, expectedIndex: 0, expectedKey: 'define' },
  { label: 'build', poState: { stage: 'build' }, expectedIndex: 1, expectedKey: 'build' },
  { label: 'ship', poState: { stage: 'ship' }, expectedIndex: 2, expectedKey: 'ship' },
  { label: 'retro', poState: { stage: 'retro' }, expectedIndex: 3, expectedKey: 'retro' },
  // AC — never throws; unrecognized/missing value falls back to index 0.
  { label: 'unrecognized stage string → default 0', poState: { stage: 'bogus' as any }, expectedIndex: 0, expectedKey: 'define' },
  { label: 'null poState → default 0', poState: null, expectedIndex: 0, expectedKey: 'define' },
  { label: 'no stage field → default 0', poState: {}, expectedIndex: 0, expectedKey: 'define' },
]

// ── Legacy phase path — must be completely unaffected by the prdt addition ──

interface PhaseCase {
  readonly label: string
  readonly poState: PoState | null
  readonly expectedIndex: number
  readonly expectedKey: string
}

export const LEGACY_PHASE_CASES: readonly PhaseCase[] = [
  { label: 'current_phase 1 → PRD (index 0)', poState: { current_phase: 1 }, expectedIndex: 0, expectedKey: 'prd' },
  { label: 'current_phase 3 → Build (index 2)', poState: { current_phase: 3 }, expectedIndex: 2, expectedKey: 'build' },
  { label: 'current_phase 5 → Close (index 4)', poState: { current_phase: 5 }, expectedIndex: 4, expectedKey: 'close' },
  // prdt shape fed into the LEGACY path must not crash — falls back to default (PRD).
  { label: 'prdt shape (no current_phase) → default PRD, no crash', poState: { stage: 'ship' }, expectedIndex: 0, expectedKey: 'prd' },
  { label: 'null poState → default PRD', poState: null, expectedIndex: 0, expectedKey: 'prd' },
]

// ── bridgePrdtVersion (T-306) — flat `version` → `current_version` bridge ─────

interface BridgeCase {
  readonly label: string
  readonly poState: PoState | null
  /** expected current_version on the RETURNED object */
  readonly expectedCv: string | undefined
  /** true → the exact same reference must come back (legacy/null untouched) */
  readonly expectSameRef: boolean
}

const LEGACY_STATE: PoState = { schema_version: 2, current_phase: 3, current_version: 'v0.6', versions: [{ id: 'v0.6' }] }
const PRDT_STATE: PoState = { schema_version: 1, stage: 'build', version: 'v1.1', current_task: { ticket_id: 'T-306', slug: 'x', assignee: 'developer' } }

export const BRIDGE_CASES: readonly BridgeCase[] = [
  { label: 'prdt flat version mirrored into current_version (copy, not mutation)', poState: PRDT_STATE, expectedCv: 'v1.1', expectSameRef: false },
  { label: 'legacy state returned as-is (same reference, cv untouched)', poState: LEGACY_STATE, expectedCv: 'v0.6', expectSameRef: true },
  { label: 'null passes through', poState: null, expectedCv: undefined, expectSameRef: true },
  { label: 'prdt without version field → no bridge (same reference)', poState: { stage: 'define' }, expectedCv: undefined, expectSameRef: true },
  // Defensive: a (hypothetical) prdt state already carrying current_version is never overwritten.
  { label: 'prdt with existing current_version untouched', poState: { stage: 'build', version: 'v1.1', current_version: 'keep' }, expectedCv: 'keep', expectSameRef: true },
]

// ── hasPrdtWorkTrace — regression guard (first-po-request-screen-missing-after-create) ──
//
// `prdt init` stamps `version` unconditionally at creation (before any PO turn),
// so a brand-new prdt project must NOT be flagged as "has work" merely because
// `version` is non-empty — that bug made EntryGate skip FreshComposer (the
// "first request" 1-input screen) for every freshly created project.

interface WorkTraceCase {
  readonly label: string
  readonly poState: PoState | null
  readonly expected: boolean
}

export const WORK_TRACE_CASES: readonly WorkTraceCase[] = [
  {
    label: 'brand-new prdt state (default stage=define, version stamped, no current_task) → NOT a work trace',
    poState: { schema_version: 1, stage: 'define', version: 'v0.1' },
    expected: false,
  },
  {
    label: 'brand-new prdt state with a v1 version stamped → still NOT a work trace',
    poState: { schema_version: 1, stage: 'define', version: 'v1' },
    expected: false,
  },
  {
    label: 'stage advanced past define → work trace',
    poState: { schema_version: 1, stage: 'build', version: 'v0.1' },
    expected: true,
  },
  {
    label: 'current_task assigned → work trace',
    poState: { schema_version: 1, stage: 'define', version: 'v0.1', current_task: { ticket_id: 'T-1', slug: 'x', assignee: 'developer' } },
    expected: true,
  },
  {
    label: 'legacy shape (no stage) → never a prdt work trace',
    poState: { schema_version: 2, current_phase: 3, current_version: 'v0.6' },
    expected: false,
  },
  { label: 'null poState → false', poState: null, expected: false },
  { label: 'empty object → false', poState: {}, expected: false },
]

export function runPhaseMappingCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  let total = 0

  for (const c of KIND_CASES) {
    total += 1
    const actual = isPrdtPoState(c.poState)
    if (actual !== c.expected) failures.push(`isPrdtPoState[${c.label}]: expected ${c.expected}, got ${actual}`)
  }

  for (const c of STAGE_CASES) {
    total += 1
    const idx = getActiveStageIndex(c.poState)
    const def = getActiveStageDef(c.poState)
    if (idx !== c.expectedIndex || def.key !== c.expectedKey) {
      failures.push(`stage[${c.label}]: expected index ${c.expectedIndex}/key ${c.expectedKey}, got index ${idx}/key ${def.key}`)
    }
  }

  for (const c of LEGACY_PHASE_CASES) {
    total += 1
    const idx = getActivePhaseIndex(c.poState)
    const def = getActivePhaseDef(c.poState)
    if (idx !== c.expectedIndex || def.key !== c.expectedKey) {
      failures.push(`phase[${c.label}]: expected index ${c.expectedIndex}/key ${c.expectedKey}, got index ${idx}/key ${def.key}`)
    }
  }

  for (const c of BRIDGE_CASES) {
    total += 1
    const before = c.poState ? JSON.stringify(c.poState) : null
    const out = bridgePrdtVersion(c.poState)
    const cv = out?.current_version
    const sameRef = out === c.poState
    // Input must NEVER be mutated (bridge is copy-on-write).
    const inputIntact = c.poState ? JSON.stringify(c.poState) === before : true
    if (cv !== c.expectedCv || sameRef !== c.expectSameRef || !inputIntact) {
      failures.push(
        `bridge[${c.label}]: expected cv=${c.expectedCv}/sameRef=${c.expectSameRef}/inputIntact, ` +
        `got cv=${cv}/sameRef=${sameRef}/inputIntact=${inputIntact}`,
      )
    }
  }

  for (const c of WORK_TRACE_CASES) {
    total += 1
    const actual = hasPrdtWorkTrace(c.poState)
    if (actual !== c.expected) failures.push(`hasPrdtWorkTrace[${c.label}]: expected ${c.expected}, got ${actual}`)
  }

  // STAGE_DEFS carries exactly the 4 prdt stages, each with a name + color
  // ("its own display definition" — the ticket's core acceptance bullet).
  total += 1
  const stageKeys = STAGE_DEFS.map((d) => d.key)
  const hasAllFour = ['define', 'build', 'ship', 'retro'].every((k) => stageKeys.includes(k as any))
  const allHaveColor = STAGE_DEFS.every((d) => typeof d.color === 'string' && d.color.length > 0)
  if (!hasAllFour || !allHaveColor) {
    failures.push(`STAGE_DEFS: expected 4 stages each with a color, got ${JSON.stringify(STAGE_DEFS)}`)
  }

  return { passed: total - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('phase-mapping: prdt stage + legacy phase cases all pass', () => {
  const { passed, failures } = runPhaseMappingCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  const totalCases = KIND_CASES.length + STAGE_CASES.length + LEGACY_PHASE_CASES.length + BRIDGE_CASES.length + WORK_TRACE_CASES.length + 1
  expect(passed).toBe(totalCases)
})
