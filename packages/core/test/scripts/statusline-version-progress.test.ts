/**
 * statusline-version-progress.test.ts — T-755.
 *
 * The statusline's `<stage> N/M` count used to GUESS which stage a ticket
 * belonged to from its `type` (TYPE_TO_STAGE: design→define, impl/qa→build,
 * ops→ship; `decision` mapped nowhere and was never counted). The guess reads
 * wrong the moment a `design`-typed ticket is actually Build work — the exact
 * shape that triggered this ticket: after v1.11 Define finished, the
 * statusline showed `define 1/5` while 4 of those 5 `design` tickets were
 * really Build work, and the one open `decision` ticket never appeared in any
 * count. The user's call (verbatim "ㅇㅋ" to the PO's recommendation): drop
 * the per-type guess, show ONE version-wide done/total over every ticket in
 * the version dir, `decision` included.
 *
 * This drives the real script end-to-end over a version dir mixing all five
 * ticket types (design/impl/qa/ops/decision) — never re-implementing the
 * counting logic as an oracle — and checks the printed count is the
 * version-wide total, not a stage-matched subset.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const STATUSLINE_SH = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')
const VERSION = 'v9.8' // scratch-only version id, matches VERSION_RE

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let root: string

function makeProject(stage: string): string {
  const r = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t755-sl-')))
  fs.mkdirSync(path.join(r, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(r, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage, version: VERSION, current_task: null }),
  )
  return r
}

function writeTicket(id: string, type: string, status: 'open' | 'done' = 'open'): void {
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: ${type}\nstatus: ${status}\nassignee: developer\ncreated: 2026-01-01\n---\n\nbody\n`,
  )
}

function runStatusline(): string {
  return execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
  }).replace(/\n$/, '')
}

describe.skipIf(!PYTHON3)('the statusline shows version-wide progress, not a per-type stage guess (T-755)', () => {
  test('a version dir mixing all five ticket types counts as one version-wide total, decision included', () => {
    root = makeProject('define')
    // The exact T-755 repro ratio: 5 `design` tickets, only 1 actually done —
    // 4 of them are Build work in truth, but under the old TYPE_TO_STAGE guess
    // ALL 5 counted toward `define` regardless, showing `define 1/5` and
    // hiding every other ticket in the version. 17 tickets total, 4 done
    // overall — the exact numbers this ticket's own acceptance example uses.
    writeTicket('T-1', 'design', 'done')
    writeTicket('T-2', 'design', 'open')
    writeTicket('T-3', 'design', 'open')
    writeTicket('T-4', 'design', 'open')
    writeTicket('T-5', 'design', 'open')
    writeTicket('T-6', 'impl', 'done')
    writeTicket('T-7', 'impl', 'done')
    writeTicket('T-8', 'impl', 'open')
    writeTicket('T-9', 'impl', 'open')
    writeTicket('T-10', 'impl', 'open')
    writeTicket('T-11', 'impl', 'open')
    writeTicket('T-12', 'qa', 'done')
    writeTicket('T-13', 'qa', 'open')
    writeTicket('T-14', 'qa', 'open')
    writeTicket('T-15', 'ops', 'open')
    writeTicket('T-16', 'ops', 'open')
    writeTicket('T-17', 'decision', 'open')

    const out = runStatusline()

    // one version-wide count: 4 done of 17, decision ticket included in the total
    expect(out).toContain('define 4/17')
    // never a stage-matched subset count (the old `define 1/5` shape, or any
    // other N/5 the design-only bucket would have produced)
    expect(out).not.toMatch(/define \d+\/5(?!\d)/)
    expect(out).not.toMatch(/\bdefine \d+\/\d+ total \d+\/\d+/)
    // the open `decision` ticket surfaces (as "dec"), proving it was read
    // and counted, not skipped the way TYPE_TO_STAGE used to skip it
    expect(out).toContain('dec T-17')
  })

  test('a stage with zero type-matched tickets still shows the full version total, not zero', () => {
    // Every ticket here is `design` while the current stage is `ship` — under
    // the old TYPE_TO_STAGE map design→define, so `stotal` would be 0 and the
    // line would fall to the "elif vtotal" branch, printing the literal word
    // "total". The new count never buckets by type at all.
    root = makeProject('ship')
    writeTicket('T-20', 'design', 'done')
    writeTicket('T-21', 'design', 'open')
    writeTicket('T-22', 'design', 'open')

    const out = runStatusline()
    expect(out).toContain('ship 1/3')
    expect(out).not.toContain('total')
  })

  test('TYPE_TO_STAGE no longer exists as an executable mapping', () => {
    const src = fs.readFileSync(STATUSLINE_SH, 'utf8')
    // historical mentions are fine in comments/prose; the dict literal that
    // drove the per-type guess must be gone
    expect(src).not.toMatch(/TYPE_TO_STAGE\s*=\s*\{/)
    expect(src).not.toMatch(/TYPE_TO_STAGE\.get/)
  })
})
