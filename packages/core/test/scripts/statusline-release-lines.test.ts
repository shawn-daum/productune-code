/**
 * statusline-release-lines.test.ts — T-961 (release lines) + T-984 (layout).
 *
 * Drives the REAL `statusline-prdt.sh` end to end:
 *   - T-984 (user-confirmed 2026-10-06): `<label> <version> | branch: <b> |
 *     <stage> n/m | ticket n/m | working …`; single-line: an empty dec/req pair
 *     is always its own last row, `dec — · req —` when empty.
 *   - T-961: one row per release line (home first, then config `lines` in
 *     declaration order), one shared dec/req row; never more than 17 rows
 *     (the limit measured on the user's machine, T-961 log).
 *   - T-954 = A: `<stage> n/m` from po-state `checks` / `lines.<line>.checks`;
 *     no record for the stage → the stage name alone.
 *
 * `PRDT_HOME` is always a scratch dir (never the real `~/.prdt`).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const STATUSLINE_SH = path.resolve(__dirname, '..', '..', 'scripts', 'statusline-prdt.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const READY = !!which('python3')

let root: string
let prdtHome: string

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

function seed(cfg: Record<string, unknown>, state: Record<string, unknown>): void {
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, current_task: null, ...state }))
}

/** `dir` is relative to docs/tickets (`v2.2`, `ntf-archive/v1.2`). */
function ticket(dir: string, id: string, fm: Record<string, string> = {}): void {
  const d = path.join(root, 'docs', 'tickets', dir)
  fs.mkdirSync(d, { recursive: true })
  const all = { id, type: 'impl', status: 'open', assignee: 'developer', ...fm }
  fs.writeFileSync(path.join(d, `${id}.md`),
    `---\n${Object.entries(all).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`)
}

function marker(ticketId: string, persona = 'developer'): void {
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const hex = crypto.createHash('sha256').update(`a-${ticketId}-${persona}`).digest('hex')
  fs.writeFileSync(path.join(dir, `${hex}.json`), JSON.stringify({
    agent_id: hex, persona, dispatch_id: 'd-x', ticket_id: ticketId, project_root: root,
    since: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }))
}

function rows(): string[] {
  return execFileSync('bash', [STATUSLINE_SH], {
    input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: prdtHome, PRDT_LANG: 'en' },
  }).replace(/\n$/, '').split('\n')
}

beforeEach(() => {
  root = tmp('prdt-t961-sl-')
  prdtHome = tmp('prdt-t961-sl-home-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(prdtHome, { recursive: true, force: true })
})

describe.skipIf(!READY)('statusline — T-961 req hides blocked user tasks', () => {
  test('req lists a user ticket only when none of its deps is open', () => {
    seed({ slug: 'productune' }, { stage: 'build', version: 'v1.13' })
    ticket('v1.13', 'T-1')
    ticket('v1.13', 'T-2', { status: 'done' })
    ticket('v1.13', 'T-10', { assignee: 'user', deps: '[T-1]' })
    ticket('v1.13', 'T-11', { assignee: 'user', deps: '[T-2]' })
    ticket('v1.13', 'T-12', { assignee: 'user' })
    expect(rows().at(-1)).toBe('decision — | request T-11 T-12')
  })
})

describe.skipIf(!READY)('statusline — T-961 req blocked rule spans lines', () => {
  test('a dep that is an open ticket in another line folder blocks the user task', () => {
    seed({ slug: 'ntf-pm', lines: [{ name: 'ntf-archive' }] }, { stage: 'build', version: 'v2.2', lines: { 'ntf-archive': { stage: 'build', version: 'v1.2' } } })
    ticket('ntf-archive/v1.2', 'T-9102')
    ticket('v2.2', 'T-720', { assignee: 'user', deps: '[T-9102]' })
    ticket('v2.2', 'T-721', { assignee: 'user' })
    expect(rows().at(-1)).toBe('decision — | request T-721')
  })
})

describe.skipIf(!READY)('statusline — T-984 layout, single line', () => {
  test('dec and req both empty → line row + own last row `dec — · req —`', () => {
    seed({ slug: 'productune' }, { stage: 'build', version: 'v1.13', checks: { build: ['split', 'main-path', 'qa'] } })
    ticket('v1.13', 'T-1', { status: 'done' })
    ticket('v1.13', 'T-2')
    expect(rows()).toEqual(['productune v1.13 | stage: build 3/5 | ticket 1/2 | working —', 'decision — | request —'])
  })

  test('either list has an entry → listed on the same last row', () => {
    seed({ slug: 'productune' }, { stage: 'define', version: 'v1.13' })
    ticket('v1.13', 'T-984', { type: 'decision', assignee: 'user' })
    ticket('v1.13', 'T-985', { assignee: 'user' })
    marker('T-985', 'qa')
    expect(rows()).toEqual([
      'productune v1.13 | stage: define | ticket 0/2 | working T-985(qa)',
      'decision T-984 | request T-985',
    ])
  })
})

describe.skipIf(!READY)('statusline — stage checklist count (T-954 = A)', () => {
  const stageSeg = () => rows()[0].split(' | ')[1]

  test('absent `checks` → stage name alone', () => {
    seed({ slug: 'p' }, { stage: 'ship', version: 'v1.0' })
    expect(stageSeg()).toBe('stage: ship')
  })

  test('`checks` without an entry for the current stage → stage name alone', () => {
    seed({ slug: 'p' }, { stage: 'ship', version: 'v1.0', checks: { build: ['a'] } })
    expect(stageSeg()).toBe('stage: ship')
  })

  test('distinct items count; duplicates and non-strings ignored; capped at the stage total', () => {
    seed({ slug: 'p' }, { stage: 'ship', version: 'v1.0', checks: { ship: ['review', 'review', 3, 'tests'] } })
    expect(stageSeg()).toBe('stage: ship 2/9')
    seed({ slug: 'p' }, { stage: 'define', version: 'v1.0', checks: { define: ['a', 'b', 'c', 'd', 'e', 'f'] } })
    expect(stageSeg()).toBe('stage: define 5/5')
    seed({ slug: 'p' }, { stage: 'retro', version: 'v1.0', checks: { retro: [] } })
    expect(stageSeg()).toBe('stage: retro 0/8')
  })

  test('idle has no checklist', () => {
    seed({ slug: 'p' }, { stage: 'idle', version: 'v1.0', checks: { idle: ['x'] } })
    expect(stageSeg()).toBe('stage: idle')
  })
})

describe.skipIf(!READY)('statusline — release lines (T-961)', () => {
  test('one row per line, home first, then one shared dec · req row; each line reads its own state and folder', () => {
    seed(
      { slug: 'ntf-pm', lines: [{ name: 'ntf-archive' }] },
      {
        stage: 'define', version: 'v2.2', checks: { define: ['a', 'b'] },
        lines: { 'ntf-archive': { stage: 'build', version: 'v1.2', checks: { build: ['x'] } } },
      },
    )
    ticket('v2.2', 'T-760', { type: 'decision', assignee: 'user' })
    ticket('v2.2', 'T-761', { status: 'done' })
    ticket('ntf-archive/v1.2', 'T-764')
    ticket('ntf-archive/v1.2', 'T-767', { assignee: 'user' })
    ticket('ntf-archive/v1.1', 'T-700', { status: 'done' }) // older version: not counted
    marker('T-764')
    expect(rows()).toEqual([
      'ntf-pm v2.2 | stage: define 2/5 | ticket 1/2 | working —',
      'ntf-archive v1.2 | stage: build 1/5 | ticket 0/2 | working T-764(developer)',
      'decision T-760 | request T-767',
    ])
  })

  test('multi-line keeps the shared dec · req row even when both are empty', () => {
    seed({ slug: 'shop', lines: [{ name: 'android' }, { name: 'ios' }] },
      { stage: 'ship', version: 'v3.4', lines: { android: { stage: 'build', version: 'v2.1' }, ios: { stage: 'define', version: 'v2.1' } } })
    expect(rows()).toEqual([
      'shop v3.4 | stage: ship | working —',
      'android v2.1 | stage: build | working —',
      'ios v2.1 | stage: define | working —',
      'decision — | request —',
    ])
  })

  test('a declared line with no po-state entry still gets its row; an undeclared po-state line and illegal names get none', () => {
    seed({ slug: 'ntf-pm', lines: [{ name: 'ntf-archive' }, { name: 'v2-bad' }, { name: 'ntf-pm' }, { name: 'ntf-archive' }] },
      { stage: 'build', version: 'v2.2', lines: { ghost: { stage: 'ship', version: 'v9.9' } } })
    const r = rows()
    expect(r).toEqual(['ntf-pm v2.2 | stage: build | working —', 'ntf-archive | ? | working —', 'decision — | request —'])
    expect(r.join('\n')).not.toContain('ghost')
  })

  test('an added line reads its branch from its own `code.dir`, which may sit outside the project root', () => {
    const sib = tmp('prdt-t961-sib-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'release', sib])
      execFileSync('git', ['-C', sib, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i'])
      seed({ slug: 'ntf-pm', lines: [{ name: 'ntf-archive', code: { dir: path.relative(root, sib) } }] },
        { stage: 'build', version: 'v2.2', lines: { 'ntf-archive': { stage: 'ship', version: 'v1.2' } } })
      expect(rows()[1]).toBe('ntf-archive v1.2 | stage: ship | working — | branch: release')
    } finally {
      fs.rmSync(sib, { recursive: true, force: true })
    }
  })

  test('never more than 17 rows: past the limit the last line rows fold into `+N lines`', () => {
    const names = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`)
    seed({ slug: 'big', lines: names.map((name) => ({ name })) },
      { stage: 'build', version: 'v1.0', lines: Object.fromEntries(names.map((n) => [n, { stage: 'build', version: 'v1.0' }])) })
    const r = rows()
    expect(r).toHaveLength(17)
    expect(r[0]).toBe('big v1.0 | stage: build | working —')
    expect(r[14]).toBe('line-14 v1.0 | stage: build | working —')
    expect(r[15]).toBe('+6 lines')
    expect(r[16]).toBe('decision — | request —')
  })

  test('a single-line project with `lines: []` renders exactly as one with no `lines` key', () => {
    seed({ slug: 'p' }, { stage: 'build', version: 'v1.0' })
    const before = rows()
    seed({ slug: 'p', lines: [] }, { stage: 'build', version: 'v1.0' })
    expect(rows()).toEqual(before)
    expect(before).toHaveLength(2)
  })
})
