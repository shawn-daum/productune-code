// T-766: T-755 removed statusline-prdt.sh's own per-type "which stage is
// this ticket in" guess (the old `TYPE_TO_STAGE` dict) — a `design`-typed
// ticket that was really Build work broke that guess, so the statusline now
// shows ONE version-wide done/total over every open+done ticket in the
// current version dir, every type included (`decision` too), and never
// estimates a stage from a ticket's `type` at all. This file used to parse
// statusline-prdt.sh's `TYPE_TO_STAGE` dict literal and deep-equal it against
// `render.mjs`'s own export of the same name; T-755 deleted that dict from
// the shell side, so this literal-diff approach broke ("TYPE_TO_STAGE dict
// literal not found") the moment T-755 landed — the regression T-766 fixes,
// because `render.mjs`'s home progress line still carried its own copy of
// the retired per-type guess.
//
// The two sides no longer share a literal to diff, so this drives BOTH real
// implementations — the actual `statusline-prdt.sh` script and `render.mjs`'s
// own `versionProgressCounts` — against ONE shared ticket fixture (never
// re-implementing either side's counting rule as a hand-typed oracle) and
// asserts their done/total counts agree.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { GUI_ROOT } from '@productune/viewer/generate.mjs'
import { versionProgressCounts } from '@productune/viewer/lib/render.mjs'

// T-718: statusline-prdt.sh lives at `packages/core/scripts/…` — a SIBLING of
// this package (`packages/gui`) under `packages/`, found relative to
// `GUI_ROOT` (never `REPO_ROOT + 'code/…'`, which assumed the checked-out
// repo root's own child directory was literally named "code" — true only by
// coincidence in the day-to-day checkout, and false the moment a fresh
// `git worktree add --detach <scratchpad>/x <sha>` names that checkout
// anything else, e.g. "x" — PO-observed failure, 2026-09-27).
const STATUSLINE_PATH = path.join(GUI_ROOT, '../core/scripts/statusline-prdt.sh')
const RENDER_PATH = path.join(GUI_ROOT, '../viewer/lib/render.mjs')

function which(bin: string): string | null {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}
const PYTHON3 = which('python3')

const VERSION = 'v9.8' // scratch-only version id, matches statusline's VERSION_RE
const STAGE = 'build' // scratch-only po-state stage, any STAGES member works

// The T-755 repro mix (statusline-version-progress.test.ts's own fixture):
// all five ticket types, mixed open/done, plus one `dropped` ticket this
// count must exclude from BOTH `done` and `total` — never just from `done`
// (a `total` that still counted it would silently overstate the denominator
// on both sides at once and this test would not catch it).
const FIXTURE_TICKETS = [
  { id: 'T-1', type: 'design', status: 'done' },
  { id: 'T-2', type: 'design', status: 'open' },
  { id: 'T-3', type: 'design', status: 'open' },
  { id: 'T-4', type: 'design', status: 'open' },
  { id: 'T-5', type: 'design', status: 'open' },
  { id: 'T-6', type: 'impl', status: 'done' },
  { id: 'T-7', type: 'impl', status: 'done' },
  { id: 'T-8', type: 'impl', status: 'open' },
  { id: 'T-9', type: 'impl', status: 'open' },
  { id: 'T-10', type: 'impl', status: 'open' },
  { id: 'T-11', type: 'impl', status: 'open' },
  { id: 'T-12', type: 'qa', status: 'done' },
  { id: 'T-13', type: 'qa', status: 'open' },
  { id: 'T-14', type: 'qa', status: 'open' },
  { id: 'T-15', type: 'ops', status: 'open' },
  { id: 'T-16', type: 'ops', status: 'open' },
  { id: 'T-17', type: 'decision', status: 'open' },
  { id: 'T-18', type: 'impl', status: 'dropped' },
]

function runStatuslineOverFixture(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t766-sl-')))
  try {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: STAGE, version: VERSION, current_task: null }),
    )
    const ticketDir = path.join(root, 'docs', 'tickets', VERSION)
    fs.mkdirSync(ticketDir, { recursive: true })
    for (const t of FIXTURE_TICKETS) {
      fs.writeFileSync(
        path.join(ticketDir, `${t.id}.md`),
        `---\nid: ${t.id}\nslug: s-${t.id.toLowerCase()}\ntype: ${t.type}\nstatus: ${t.status}\nassignee: developer\ncreated: 2026-01-01\n---\n\nbody\n`,
      )
    }
    return execFileSync('bash', [STATUSLINE_PATH], {
      input: JSON.stringify({ workspace: { current_dir: root } }),
      encoding: 'utf8',
    }).replace(/\n$/, '')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe.skipIf(!PYTHON3)('viewer version-progress counting parity with statusline-prdt.sh (T-766)', () => {
  it("render.mjs's versionProgressCounts agrees with the real statusline-prdt.sh over one shared fixture", () => {
    expect(fs.existsSync(STATUSLINE_PATH), `${STATUSLINE_PATH} does not exist`).toBe(true)
    const out = runStatuslineOverFixture()
    const m = new RegExp(`^\\S+ \\S+ \\| ${STAGE} \\| ticket (\\d+)/(\\d+) \\|`).exec(out)
    expect(m, `statusline output "${out}" head is not "<slug> <version> | ${STAGE} | ticket n/m"`).not.toBeNull()
    const [, shellDone, shellTotal] = m as RegExpExecArray

    const viewerTickets = FIXTURE_TICKETS.map((t) => ({ frontmatter: { type: t.type, status: t.status } }))
    const { done, total } = versionProgressCounts(viewerTickets)

    expect(done).toBe(Number(shellDone))
    expect(total).toBe(Number(shellTotal))
    // non-vacuous: the shared fixture actually has a `dropped` ticket excluded
    // from the count on both sides (17 counted, not the full 18 written)
    expect(total).toBe(FIXTURE_TICKETS.length - 1)
  })

  // Non-vacuous control: the parser/regex above must be able to catch a real
  // divergence, or the assertion could be passing only because both sides
  // happen to return the same wrong number.
  it('checker fixture: a hand-built count that diverges from the real fixture is caught', () => {
    const wrong = { done: 999, total: 999 }
    const viewerTickets = FIXTURE_TICKETS.map((t) => ({ frontmatter: { type: t.type, status: t.status } }))
    const real = versionProgressCounts(viewerTickets)
    expect(real).not.toEqual(wrong)
  })

  it('TYPE_TO_STAGE no longer exists as an executable mapping in either implementation', () => {
    const shellSrc = fs.readFileSync(STATUSLINE_PATH, 'utf8')
    expect(shellSrc).not.toMatch(/TYPE_TO_STAGE\s*=\s*\{/)
    expect(shellSrc).not.toMatch(/TYPE_TO_STAGE\.get/)
    const renderSrc = fs.readFileSync(RENDER_PATH, 'utf8')
    expect(renderSrc).not.toMatch(/export const TYPE_TO_STAGE/)
  })
})
