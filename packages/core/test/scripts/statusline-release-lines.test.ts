/**
 * statusline-release-lines.test.ts — T-961 (release lines) + T-984 (layout).
 *
 * Drives the REAL `statusline-prdt.sh` end to end:
 *   - T-984 (user-confirmed 2026-10-06): `<label> <version> | branch: <b> |
 *     <stage> n/m | total tickets n/m | working …`; single-line: an empty dec/req pair
 *     is always its own last row, `dec 0 · req 0` when empty.
 *   - T-961: one row per release line (home first, then config `products`, T-1108 (old `lines` still read) in
 *     declaration order), one shared dec/req row; never more than 17 rows
 *     (the limit measured on the user's machine, T-961 log).
 *   - T-923: `<stage> n/m` counts this version's tickets of the stage (no `checks` record);
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
    expect(rows().at(-1)).toBe('decision 0 | request T-11 T-12')
  })
})

describe.skipIf(!READY)('statusline — T-961 req blocked rule spans lines', () => {
  test('a dep that is an open ticket in another line folder blocks the user task', () => {
    seed({ slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] }, { stage: 'build', version: 'v2.2', products: { 'ntf-archive': { stage: 'build', version: 'v1.2' } } })
    ticket('ntf-archive/v1.2', 'T-9102')
    ticket('v2.2', 'T-720', { assignee: 'user', deps: '[T-9102]' })
    ticket('v2.2', 'T-721', { assignee: 'user' })
    expect(rows().at(-1)).toBe('decision 0 | request T-721')
  })
})

describe.skipIf(!READY)('statusline — T-984 layout, single line', () => {
  test('dec and req both empty → line row + own last row `dec 0 · req 0`', () => {
    seed({ slug: 'productune' }, { stage: 'build', version: 'v1.13' })
    ticket('v1.13', 'T-1', { status: 'done' })
    ticket('v1.13', 'T-2')
    expect(rows()).toEqual(['productune v1.13 | stage: build 1/2 | total tickets 1/2 | working 0', 'decision 0 | request 0'])
  })

  test('either list has an entry → listed on the same last row', () => {
    seed({ slug: 'productune' }, { stage: 'define', version: 'v1.13' })
    ticket('v1.13', 'T-984', { type: 'decision', assignee: 'user' })
    ticket('v1.13', 'T-985', { assignee: 'user' })
    marker('T-985', 'qa')
    expect(rows()).toEqual([
      'productune v1.13 | stage: define 0/1 | total tickets 0/2 | working T-985(qa)',
      'decision T-984 | request T-985',
    ])
  })
})

describe.skipIf(!READY)('statusline — stage ticket count (T-923)', () => {
  const stageSeg = () => rows()[0].split(' | ')[1]

  test('no tickets → 0/0', () => {
    seed({ slug: 'p' }, { stage: 'ship', version: 'v1.0' })
    expect(stageSeg()).toBe('stage: ship 0/0')
  })

  test('counts only this version\'s tickets of the current stage (define = design · decision, ship = qa · ops, build = rest)', () => {
    const mix = () => {
      ticket('v1.0', 'T-1', { type: 'design', status: 'done' })
      ticket('v1.0', 'T-2', { type: 'decision' })
      ticket('v1.0', 'T-3', { type: 'impl', status: 'done' })
      ticket('v1.0', 'T-4', { type: 'impl' })
      ticket('v1.0', 'T-5', { type: 'refactor' })
      ticket('v1.0', 'T-6', { type: 'qa', status: 'done' })
      ticket('v1.0', 'T-7', { type: 'ops' })
      ticket('v1.0', 'T-8', { type: 'qa', status: 'deferred' }) // neither open nor done: not counted
      ticket('v0.9', 'T-9', { type: 'qa' }) // other version: not counted
    }
    seed({ slug: 'p' }, { stage: 'define', version: 'v1.0' }); mix()
    expect(stageSeg()).toBe('stage: define 1/2')
    seed({ slug: 'p' }, { stage: 'build', version: 'v1.0' })
    expect(stageSeg()).toBe('stage: build 1/3')
    seed({ slug: 'p' }, { stage: 'ship', version: 'v1.0' })
    expect(stageSeg()).toBe('stage: ship 1/2')
    expect(rows()[0]).toContain('| total tickets 3/7 |')
  })

  test('retro and idle have no stage tickets → 0/0; the version total still shows; a po-state `checks` is ignored', () => {
    ticket('v1.0', 'T-1', { status: 'done' })
    ticket('v1.0', 'T-2')
    seed({ slug: 'p' }, { stage: 'retro', version: 'v1.0', checks: { retro: ['a'] } })
    expect(rows()[0]).toBe('p v1.0 | stage: retro 0/0 | total tickets 1/2 | working 0')
    seed({ slug: 'p' }, { stage: 'idle', version: 'v1.0', checks: { idle: ['x'] } })
    expect(stageSeg()).toBe('stage: idle 0/0')
  })
})

describe.skipIf(!READY)('statusline — release lines (T-961)', () => {
  test('one row per line, home first, then one shared dec · req row; each line reads its own state and folder', () => {
    seed(
      { slug: 'ntf-pm', products: [{ name: 'ntf-archive' }] },
      {
        stage: 'define', version: 'v2.2',         products: { 'ntf-archive': { stage: 'build', version: 'v1.2' } },
      },
    )
    ticket('v2.2', 'T-760', { type: 'decision', assignee: 'user' })
    ticket('v2.2', 'T-761', { status: 'done' })
    ticket('ntf-archive/v1.2', 'T-764')
    ticket('ntf-archive/v1.2', 'T-767', { assignee: 'user' })
    ticket('ntf-archive/v1.1', 'T-700', { status: 'done' }) // older version: not counted
    marker('T-764')
    expect(rows()).toEqual([
      'ntf-pm v2.2 | stage: define 0/1 | total tickets 1/2 | working 0',
      'ntf-archive v1.2 | stage: build 0/2 | total tickets 0/2 | working T-764(developer)',
      'decision T-760 | request T-767',
    ])
  })

  test('multi-line keeps the shared dec · req row even when both are empty', () => {
    seed({ slug: 'shop', products: [{ name: 'android' }, { name: 'ios' }] },
      { stage: 'ship', version: 'v3.4', products: { android: { stage: 'build', version: 'v2.1' }, ios: { stage: 'define', version: 'v2.1' } } })
    expect(rows()).toEqual([
      'shop v3.4 | stage: ship 0/0 | working 0',
      'android v2.1 | stage: build 0/0 | working 0',
      'ios v2.1 | stage: define 0/0 | working 0',
      'decision 0 | request 0',
    ])
  })

  test('a declared line with no po-state entry still gets its row; an undeclared po-state line and illegal names get none', () => {
    // legacy `lines` keys (pre-v1.14): still read, T-1108
    seed({ slug: 'ntf-pm', lines: [{ name: 'ntf-archive' }, { name: 'v2-bad' }, { name: 'ntf-pm' }, { name: 'ntf-archive' }] },
      { stage: 'build', version: 'v2.2', lines: { ghost: { stage: 'ship', version: 'v9.9' } } })
    const r = rows()
    expect(r).toEqual(['ntf-pm v2.2 | stage: build 0/0 | working 0', 'ntf-archive | stage: ? 0/0 | working 0', 'decision 0 | request 0'])
    expect(r.join('\n')).not.toContain('ghost')
  })

  test('an added line reads its branch from its own `code.dir`, which may sit outside the project root', () => {
    const sib = tmp('prdt-t961-sib-')
    try {
      execFileSync('git', ['init', '-q', '-b', 'release', sib])
      execFileSync('git', ['-C', sib, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i'])
      seed({ slug: 'ntf-pm', products: [{ name: 'ntf-archive', code: { dir: path.relative(root, sib) } }] },
        { stage: 'build', version: 'v2.2', products: { 'ntf-archive': { stage: 'ship', version: 'v1.2' } } })
      expect(rows()[1]).toBe('ntf-archive v1.2 | stage: ship 0/0 | working 0 | branch: release')
    } finally {
      fs.rmSync(sib, { recursive: true, force: true })
    }
  })

  test('never more than 17 rows: past the limit the last line rows fold into `+N products`', () => {
    const names = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`)
    seed({ slug: 'big', products: names.map((name) => ({ name })) },
      { stage: 'build', version: 'v1.0', products: Object.fromEntries(names.map((n) => [n, { stage: 'build', version: 'v1.0' }])) })
    const r = rows()
    expect(r).toHaveLength(17)
    expect(r[0]).toBe('big v1.0 | stage: build 0/0 | working 0')
    expect(r[14]).toBe('line-14 v1.0 | stage: build 0/0 | working 0')
    expect(r[15]).toBe('+6 products')
    expect(r[16]).toBe('decision 0 | request 0')
  })

  test('a single-line project with `lines: []` renders exactly as one with no `lines` key', () => {
    seed({ slug: 'p' }, { stage: 'build', version: 'v1.0' })
    const before = rows()
    seed({ slug: 'p', lines: [] }, { stage: 'build', version: 'v1.0' })
    expect(rows()).toEqual(before)
    expect(before).toHaveLength(2)
  })
})
