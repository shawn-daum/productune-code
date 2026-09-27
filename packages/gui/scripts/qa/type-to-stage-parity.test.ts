// T-666 slice 2b acceptance line 1: "Stage progress is counted by
// statusline-prdt.sh's own TYPE_TO_STAGE mapping, not a second rule — a test
// fails if the two diverge." This parses statusline-prdt.sh's own Python
// dict LITERAL (never re-typing its values) and deep-equals it against
// viewer/lib/render.mjs's `TYPE_TO_STAGE` export — a hand edit to either
// side without the other fails here.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GUI_ROOT } from '../../viewer/generate.mjs'
import { TYPE_TO_STAGE } from '../../viewer/lib/render.mjs'

// T-718: statusline-prdt.sh lives at `packages/core/scripts/…` — a SIBLING of
// this package (`packages/gui`) under `packages/`, found relative to
// `GUI_ROOT` (never `REPO_ROOT + 'code/…'`, which assumed the checked-out
// repo root's own child directory was literally named "code" — true only by
// coincidence in the day-to-day checkout, and false the moment a fresh
// `git worktree add --detach <scratchpad>/x <sha>` names that checkout
// anything else, e.g. "x" — PO-observed failure, 2026-09-27).
const STATUSLINE_PATH = path.join(GUI_ROOT, '../core/scripts/statusline-prdt.sh')

/** Parses `TYPE_TO_STAGE = { "k": "v", ... }` out of the shell script's embedded Python — every quoted `"key": "value"` pair inside the dict's own braces, comments (which carry no quoted colon pairs) ignored by construction. */
function parseShellTypeToStage(source) {
  const blockMatch = /TYPE_TO_STAGE\s*=\s*\{([\s\S]*?)\n\}/.exec(source)
  expect(blockMatch, 'statusline-prdt.sh: TYPE_TO_STAGE dict literal not found — has its shape changed?').not.toBeNull()
  const body = blockMatch[1]
  const dict = {}
  for (const m of body.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) {
    dict[m[1]] = m[2]
  }
  return dict
}

describe('viewer TYPE_TO_STAGE parity with statusline-prdt.sh (T-666 slice 2b)', () => {
  it('render.mjs\'s TYPE_TO_STAGE is byte-for-byte the same mapping as statusline-prdt.sh\'s own dict', () => {
    expect(fs.existsSync(STATUSLINE_PATH), `${STATUSLINE_PATH} does not exist`).toBe(true)
    const source = fs.readFileSync(STATUSLINE_PATH, 'utf8')
    const shellDict = parseShellTypeToStage(source)
    expect(Object.keys(shellDict).length).toBeGreaterThan(0) // non-vacuous — the parser actually found pairs
    expect(TYPE_TO_STAGE).toEqual(shellDict)
  })

  // Non-vacuous control: the parser itself must be able to catch a real
  // divergence, or the assertion above could be passing only because
  // `parseShellTypeToStage` silently returns an empty/wrong object.
  it('checker fixture: a shell dict that diverges from a hand-built JS object is caught', () => {
    const fixtureSource = 'TYPE_TO_STAGE = {\n    "design": "define", "impl": "ship",\n}\n'
    const parsed = parseShellTypeToStage(fixtureSource)
    expect(parsed).toEqual({ design: 'define', impl: 'ship' })
    expect(parsed).not.toEqual(TYPE_TO_STAGE)
  })
})
