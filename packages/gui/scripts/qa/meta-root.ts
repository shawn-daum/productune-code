// T-900: where the META project (docs/ + .prdt/) is, for tests that read the
// real corpus. In a shared checkout generate.mjs's REPO_ROOT already is it; in a
// `prdt track` worktree (<meta>/tracks/T-NNN) REPO_ROOT resolves to
// <meta>/tracks, which has neither — the meta root is then its parent.
// Never throws: no meta root found → META_ROOT is null and META_SKIP_REASON
// says why and how to run the tests anyway.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { REPO_ROOT } from '@productune/viewer/generate.mjs'

const hasMeta = (root: string) => fs.existsSync(path.join(root, '.prdt/po-state.json'))

export const META_ROOT: string | null = [REPO_ROOT, path.dirname(REPO_ROOT)].find(hasMeta) ?? null

export const META_SKIP_REASON: string | null = META_ROOT
  ? null
  : `no meta project (.prdt/po-state.json) at ${REPO_ROOT} or its parent — run these tests from a checkout inside the meta project (code/ or tracks/T-NNN/)`

// T-1108: budget for a beforeAll that runs the real `generate()` over META_ROOT.
// A fixed 30 s literal here overrode the config's load-scaled hookTimeout, and
// three files doing this in parallel died at load 14–22 (alone: 12 s). Same
// scale the whole run pinned (scripts/vitest-timeouts.cjs, T-649) — 30 s base.
const timeouts = createRequire(import.meta.url)('../../../../scripts/vitest-timeouts.cjs') as {
  scale: () => { value: number }
}
export const META_GENERATE_TIMEOUT_MS = Math.round(30_000 * timeouts.scale().value)
