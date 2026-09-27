/**
 * subprocess-timeout.ts — T-649. What a test passes as `timeout:` to
 * `execFileSync` / `spawnSync`.
 *
 * Before this file every launch carried its own literal (`timeout: 30000` ×32,
 * `20000` ×23, `60000` ×21, `10000` ×8 — PO count, 2026-09-17), and no flag
 * reached any of them. The numbers now come from ONE place,
 * `scripts/vitest-timeouts.cjs`, scaled by the run's load-derived (or
 * `PRDT_TEST_TIMEOUT_SCALE`-fixed) factor. This file is a typed doorway to
 * that module and nothing more — no second copy of a budget lives here.
 *
 * Tiers name what the child IS, not how long it is allowed to take:
 *   quick   hang guard (the assertion is `signal === null`)
 *   hook    one Claude Code hook script
 *   cli     one `prdt` command other than doctor
 *   doctor  `prdt doctor`
 */

import { createRequire } from 'node:module'

const cjs = createRequire(import.meta.url)
const timeouts = cjs('../../../../scripts/vitest-timeouts.cjs') as {
  TIERS: Readonly<Record<SubprocessTier, number>>
  subprocessMs(tier: SubprocessTier): number
  describe(): string
}

export type SubprocessTier = 'quick' | 'hook' | 'cli' | 'doctor'

/** Scaled budget in ms for `tier` — the value for `{ timeout: … }`. */
export function subprocessTimeout(tier: SubprocessTier): number {
  return timeouts.subprocessMs(tier)
}

/** The run's whole budget line, for a test that wants to print it. */
export function describeTimeouts(): string {
  return timeouts.describe()
}
