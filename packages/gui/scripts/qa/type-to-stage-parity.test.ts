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
import { stageOfTicketType, stageSegments } from '@productune/viewer/lib/home-graph.mjs'
import { collectStageHistory } from '@productune/viewer/lib/collect.mjs'

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

function runStatuslineOverFixture(stage: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t766-sl-')))
  try {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage, version: VERSION, current_task: null }),
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
      env: { ...process.env, PRDT_LANG: 'en' }, // T-1015: labels follow cli.lang; this parser reads the English form
    }).replace(/\n$/, '')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe.skipIf(!PYTHON3)('viewer version-progress counting parity with statusline-prdt.sh (T-766)', () => {
  it("render.mjs's versionProgressCounts agrees with the real statusline-prdt.sh over one shared fixture", () => {
    expect(fs.existsSync(STATUSLINE_PATH), `${STATUSLINE_PATH} does not exist`).toBe(true)
    const out = runStatuslineOverFixture('build')
    // T-1330: the product row no longer carries `working`; with no branch segment
    // the row ends right after `total tickets n/m` (newline or end of output)
    const m = /^\S+ \S+ \| stage: build \d+\/\d+ \| total tickets (\d+)\/(\d+)(?: \||$)/m.exec(out)
    expect(m, `statusline output "${out}" head is not "<slug> <version> | stage: build n/m | total tickets n/m"`).not.toBeNull()
    const [, shellDone, shellTotal] = m as RegExpExecArray

    const viewerTickets = FIXTURE_TICKETS.map((t) => ({ frontmatter: { type: t.type, status: t.status } }))
    const { done, total } = versionProgressCounts(viewerTickets)

    expect(done).toBe(Number(shellDone))
    expect(total).toBe(Number(shellTotal))
    // non-vacuous: the shared fixture actually has a `dropped` ticket excluded
    // from the count on both sides (17 counted, not the full 18 written)
    expect(total).toBe(FIXTURE_TICKETS.length - 1)
  })

  // T-923: `stage: <stage> n/m` follows the viewer's stageOfTicketType rule.
  it.each(['define', 'build', 'ship', 'retro', 'idle'])('stage segment n/m for %s agrees with the viewer type rule', (stage) => {
    const out = runStatuslineOverFixture(stage)
    const m = new RegExp(`\\| stage: ${stage} (\\d+)/(\\d+) \\|`).exec(out)
    expect(m, `statusline output "${out}" has no "stage: ${stage} n/m"`).not.toBeNull()
    const counted = FIXTURE_TICKETS.filter((t) => t.status === 'open' || t.status === 'done')
    const inStage = stage === 'retro' || stage === 'idle' ? [] : counted.filter((t) => stageOfTicketType(t.type) === stage)
    expect(Number((m as RegExpExecArray)[1])).toBe(inStage.filter((t) => t.status === 'done').length)
    expect(Number((m as RegExpExecArray)[2])).toBe(inStage.length)
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

// T-1384 (T-1385 = A): a ticket counts in the stage it was created in — its own `stage:`,
// else po-state's stage on its `created` day (the meta repo's po-state history), else the
// type rule. Both real implementations over one fixture with a real meta repo.
const SCRIPTS_DIR = path.join(GUI_ROOT, '../core/scripts')
const CREATED_FIXTURE = [
  { id: 'T-1', type: 'decision', status: 'done', created: '2026-01-05' }, // before any record → type → define
  { id: 'T-2', type: 'decision', status: 'open', created: '2026-01-15' }, // define
  { id: 'T-3', type: 'decision', status: 'done', created: '2026-01-20' }, // build-entry day → build
  { id: 'T-4', type: 'design', status: 'open', created: '2026-01-25' }, // build
  { id: 'T-5', type: 'impl', status: 'open', created: '2026-01-12' }, // created in define, type build → build (T-1386 = B)
  { id: 'T-6', type: 'qa', status: 'open', created: '2026-01-21' }, // build
  { id: 'T-7', type: 'impl', status: 'done', created: '2026-01-25', stage: 'ship' }, // own key
  { id: 'T-8', type: 'ops', status: 'open', created: '2026-01-02' }, // before any record → type → ship
  { id: 'T-10', type: 'ops', status: 'open', created: '2026-01-11' }, // created in define, type ship → ship (B)
  { id: 'T-9', type: 'decision', status: 'dropped', created: '2026-01-25' },
]
const CREATED_EXPECT: Record<string, [number, number]> = { define: [1, 2], build: [1, 4], ship: [1, 3], retro: [0, 0] }

function git(root: string, args: string[], env: Record<string, string> = {}, input?: string) {
  return execFileSync('git', ['--git-dir', path.join(root, '.prdt', 'meta.git'), '--work-tree', root, ...args], {
    cwd: root, encoding: 'utf8', input, env: { PATH: process.env.PATH || '', HOME: root, GIT_CONFIG_NOSYSTEM: '1', ...env },
  })
}

function createdFixture(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1384-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  execFileSync('git', ['init', '-q', '--bare', path.join(root, '.prdt', 'meta.git')], { env: { PATH: process.env.PATH || '', HOME: root } })
  const snap = (stage: string, day: string) => {
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage, version: VERSION, current_task: null }))
    git(root, ['add', '.prdt/po-state.json'])
    const when = `${day}T12:00:00`
    git(root, ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', stage], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when })
  }
  snap('retro', '2026-01-01')
  // the previous version's snapshot above names no v9.8 — the walk stops there
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'retro', version: 'v9.7', current_task: null }))
  git(root, ['add', '.prdt/po-state.json'])
  git(root, ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'prev'], { GIT_AUTHOR_DATE: '2026-01-03T12:00:00', GIT_COMMITTER_DATE: '2026-01-03T12:00:00' })
  snap('define', '2026-01-10')
  snap('build', '2026-01-20')
  const ticketDir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(ticketDir, { recursive: true })
  for (const t of CREATED_FIXTURE) {
    fs.writeFileSync(path.join(ticketDir, `${t.id}.md`),
      `---\nid: ${t.id}\nslug: s-${t.id.toLowerCase()}\ntype: ${t.type}\n${t.stage ? `stage: ${t.stage}\n` : ''}status: ${t.status}\nassignee: developer\ncreated: ${t.created}\n---\n\nbody\n`)
  }
  return root
}

describe.skipIf(!PYTHON3)('stage counts by the created stage — statusline and viewer agree (T-1384)', () => {
  it.each(['define', 'build', 'ship', 'retro'])('stage %s', (stage) => {
    const root = createdFixture()
    try {
      const st = JSON.parse(fs.readFileSync(path.join(root, '.prdt', 'po-state.json'), 'utf8'))
      fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ ...st, stage }))
      const out = execFileSync('bash', [STATUSLINE_PATH], {
        input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
        env: { ...process.env, HOME: root, PRDT_HOME: path.join(root, 'ph'), PRDT_LANG: 'en' },
      })
      const m = new RegExp(`\\| stage: ${stage} (\\d+)/(\\d+) \\|`).exec(out)
      expect(m, out).not.toBeNull()
      const history = collectStageHistory(root, null, { scriptsDir: SCRIPTS_DIR })
      expect(history).toEqual([['2026-01-10', 'define'], ['2026-01-20', 'build']])
      const tickets = CREATED_FIXTURE.map((t) => ({ frontmatter: { id: t.id, type: t.type, status: t.status, created: t.created, ...(t.stage ? { stage: t.stage } : {}) } }))
      const seg = stageSegments(tickets, history).find((x) => x.stage === stage)!
      const viewer = [seg.tickets.filter((t) => t.done).length, seg.tickets.length]
      expect(viewer).toEqual(CREATED_EXPECT[stage])
      expect([Number(m![1]), Number(m![2])]).toEqual(viewer)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('prdt tickets new writes the product stage only into the open version', () => {
    const root = createdFixture()
    try {
      const env = { ...process.env, HOME: root, PRDT_HOME: path.join(root, 'ph') }
      const prdt = path.join(SCRIPTS_DIR, 'prdt')
      execFileSync('python3', [prdt, 'tickets', 'new', '--type', 'decision', '--slug', 'in-build'], { cwd: root, env, encoding: 'utf8' })
      execFileSync('python3', [prdt, 'tickets', 'new', '--type', 'impl', '--slug', 'later', '--backlog'], { cwd: root, env, encoding: 'utf8' })
      const cur = fs.readdirSync(path.join(root, 'docs', 'tickets', VERSION)).map((f) => fs.readFileSync(path.join(root, 'docs', 'tickets', VERSION, f), 'utf8')).find((t) => /slug: in-build/.test(t))!
      expect(cur).toMatch(/^type: decision\nstage: build\nstatus: open$/m)
      const bl = fs.readdirSync(path.join(root, 'docs', 'tickets', 'backlog')).map((f) => fs.readFileSync(path.join(root, 'docs', 'tickets', 'backlog', f), 'utf8'))[0]
      expect(bl).not.toMatch(/^stage:/m)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
