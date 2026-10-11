/**
 * prdt-prd-item-coverage.test.ts — T-992: `prdt tickets new` hints the open
 * section's item keys when a version-folder ticket is created without
 * `--prd-item`, and `prdt doctor` reports per open version the share of tickets
 * without prd_item (decision tickets excluded) plus any feature key holding
 * more than half. Both advisory; a multi-line project uses `<line>/v<N>.<m>#<key>`.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const T = 120_000

function put(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

function ticket(root: string, dir: string, id: string, o: { type?: string; feature?: string; item?: string } = {}) {
  put(root, `docs/tickets/${dir}/${id}.md`, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`,
    `type: ${o.type ?? 'impl'}`, 'status: open', 'assignee: developer',
    ...(o.feature ? [`feature: ${o.feature}`] : []), ...(o.item ? [`prd_item: ${o.item}`] : []),
    'created: 2026-10-06', '---', '', '## problem', '', '- x', ''].join('\n'))
}

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-item-cov-')))
  put(root, '.prdt/config.json', JSON.stringify({ slug: 'shop', surfaces: {},
    lines: [{ name: 'android', code: { dir: '../android' } }] }))
  put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0',
    lines: { android: { stage: 'build', version: 'v2.1' } }, current_task: null }))
  put(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0 — home\n\n### What\n\n#### web — web\n\n- w\n\n#### api — api\n\n- a\n' +
    '\n## android v2.1 — app\n\n### What\n\n#### login — login\n\n- l\n')
  // home v1.0: 4 counted tickets (1 with item), 3 on feature `infra`; plus a decision (excluded)
  ticket(root, 'v1.0', 'T-001', { item: 'v1.0#web', feature: 'infra' })
  ticket(root, 'v1.0', 'T-002', { feature: 'infra' })
  ticket(root, 'v1.0', 'T-003', { feature: 'infra' })
  ticket(root, 'v1.0', 'T-004', { feature: 'other' })
  ticket(root, 'v1.0', 'T-005', { type: 'decision' })
  // android v2.1: fully covered, no feature skew
  ticket(root, 'android/v2.1', 'T-006', { item: 'android/v2.1#login' })
  return root
}

function run(root: string, args: string[]) {
  const home = path.join(root, '.home')
  fs.mkdirSync(home, { recursive: true })
  return spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: T,
    env: { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline') },
  })
}

describe('tickets new hint (T-992)', () => {
  test('home line: hints item keys, still creates the ticket', () => {
    const root = project()
    const r = run(root, ['tickets', 'new', '--type', 'impl', '--slug', 'fresh'])
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('v1.0#web')
    expect(r.stderr).toContain('v1.0#api')
    expect(r.stderr.trim().split('\n')).toHaveLength(1)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.0/T-007.md'))).toBe(true)
  })
  test('added line: keys carry the <line>/ prefix', () => {
    const root = project()
    const r = run(root, ['tickets', 'new', '--type', 'impl', '--slug', 'fresh', '--line', 'android'])
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('android/v2.1#login')
    expect(fs.existsSync(path.join(root, 'docs/tickets/android/v2.1/T-007.md'))).toBe(true)
  })
  test('no hint with --prd-item, for decision tickets, or in backlog', () => {
    const root = project()
    expect(run(root, ['tickets', 'new', '--type', 'impl', '--slug', 'a', '--prd-item', 'v1.0#web']).stderr).not.toContain('hint')
    expect(run(root, ['tickets', 'new', '--type', 'decision', '--slug', 'b']).stderr).not.toContain('hint')
    put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', current_task: null }))
    expect(run(root, ['tickets', 'new', '--type', 'impl', '--slug', 'c']).stderr).not.toContain('hint')
  })
})

describe('doctor prd_item coverage (T-992)', () => {
  test('one advisory line per open version; decision excluded; feature skew named', () => {
    const root = project()
    const r = run(root, ['doctor'])
    const lines = r.stdout.split('\n').filter(l => l.includes('prd_item coverage'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('prd_item coverage v1.0: 3/4 tickets without prd_item (75%)')
    expect(lines[0]).toContain("feature 'infra' holds 3/4")
    expect(lines[0]).not.toMatch(/^⚠ [a-z ]+:.*prd_item coverage/)
  })
  test('multi-line: an uncovered added line gets its own <line>/<version> line', () => {
    const root = project()
    ticket(root, 'android/v2.1', 'T-008')
    const lines = run(root, ['doctor']).stdout.split('\n').filter(l => l.includes('prd_item coverage'))
    expect(lines.some(l => l.includes('prd_item coverage android/v2.1: 1/2 tickets without prd_item (50%)'))).toBe(true)
    expect(lines).toHaveLength(2)
  })
})
