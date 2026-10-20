/**
 * prdt-tickets-new-placement.test.ts — T-1084: `prdt tickets new` honors
 * --version / --backlog placement and --dry-run (writes nothing, consumes no id).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const PRDT_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
const T = 120_000

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}
function put(root: string, rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}
function cli(root: string, home: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' },
  })
  return { out: r.stdout, err: r.stderr, code: r.status }
}
function project() {
  const root = path.join(tmp('prdt-t1084-'), 'proj')
  put(root, '.prdt/config.json', JSON.stringify({ slug: 'home', surfaces: {}, lines: [{ name: 'arc' }] }, null, 2) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', current_task: null, version: 'v1.0' }) + '\n')
  put(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0 — home\n\n#### web — web\n\n- w\n')
  return { root, home: tmp('prdt-t1084-home-') }
}
const base = ['tickets', 'new', '--type', 'impl', '--slug', 'probe']

describe('tickets new placement (T-1084)', () => {
  test('--version vX.Y lands in that (new) version folder, not the open one', () => {
    const { root, home } = project()
    const r = cli(root, home, [...base, '--version', 'v1.5'])
    expect(r.code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.5/T-001.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.0'))).toBe(false)
  }, T)

  test('--backlog lands in docs/tickets/backlog/', () => {
    const { root, home } = project()
    expect(cli(root, home, [...base, '--backlog']).code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/backlog/T-001.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.0'))).toBe(false)
  }, T)

  test('line-prefixed --version follows the release-line rule; conflicting --product errors', () => {
    const { root, home } = project()
    expect(cli(root, home, [...base, '--version', 'arc/v2']).code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/arc/v2/T-001.md'))).toBe(true)
    const bad = cli(root, home, [...base, '--product', 'arc', '--version', 'other/v2'])
    expect(bad.code).not.toBe(0)
  }, T)

  test('malformed --version and --backlog + --version are refused, nothing written', () => {
    const { root, home } = project()
    const a = cli(root, home, [...base, '--version', '../../x'])
    expect(a.code).not.toBe(0)
    expect(a.err).toContain('not a version id')
    const b = cli(root, home, [...base, '--backlog', '--version', 'v1.1'])
    expect(b.code).not.toBe(0)
    expect(b.err).toContain('mutually exclusive')
    expect(fs.existsSync(path.join(root, 'docs/tickets'))).toBe(false)
  }, T)

  test('--dry-run writes nothing, prints path + frontmatter, and the next real run gets the same id', () => {
    const { root, home } = project()
    const d = cli(root, home, [...base, '--version', 'v1.5', '--dry-run'])
    expect(d.code).toBe(0)
    expect(d.out).toContain('docs/tickets/v1.5/T-001.md')
    expect(d.out).toContain('id: T-001')
    expect(d.out).toContain('slug: probe')
    expect(fs.existsSync(path.join(root, 'docs/tickets'))).toBe(false)
    const real = cli(root, home, [...base])
    expect(real.code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/tickets/v1.0/T-001.md'))).toBe(true)
  }, T)
})
