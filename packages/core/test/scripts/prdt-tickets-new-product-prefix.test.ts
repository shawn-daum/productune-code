/**
 * prdt-tickets-new-product-prefix.test.ts — T-1298 (format T-1314 = 1).
 * In a project with more than one product, `prdt tickets new --product <p>`
 * numbers per product as `T-<PREFIX>-<n>`: PREFIX = the product name minus the
 * project-common leading part, vowels dropped, 3 letters, fixed once recorded in
 * `.prdt/config.json ticket_prefixes`, checked against every prefix recorded on
 * this machine (+1 consonant on a collision). Plain `T-NNN` keeps its own global
 * counter, and `tickets fmt --check` passes both forms side by side.
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
  const root = path.join(tmp('prdt-t1298-'), 'proj')
  put(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', surfaces: {}, products: [{ name: 'ntf-archive' }] }, null, 2) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', current_task: null, version: 'v1.0' }) + '\n')
  put(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0 — home\n\n#### web — web\n\n- w\n')
  return { root, home: tmp('prdt-t1298-home-') }
}
function ids(root: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name))
      else if (/^T-.*\.md$/.test(e.name)) out.push(e.name.slice(0, -3))
    }
  }
  walk(path.join(root, 'docs'))
  return out.sort()
}
const prefixes = (root: string) => JSON.parse(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).ticket_prefixes
const mk = (slug: string, product?: string) =>
  ['tickets', 'new', '--type', 'impl', '--slug', slug, ...(product ? ['--product', product] : [])]

describe('tickets new --product numbers per product (T-1298)', () => {
  test('each product gets its own T-<PREFIX>-<n>; plain T-NNN keeps the global counter', () => {
    const { root, home } = project()
    for (const [slug, prod] of [['a1', 'ntf-archive'], ['a2', 'ntf-archive'], ['p1', 'ntf-pm'], ['g1', undefined]] as const) {
      const r = cli(root, home, mk(slug, prod))
      expect(r.code, r.err).toBe(0)
    }
    expect(ids(root)).toEqual(['T-001', 'T-PM-001', 'T-RCH-001', 'T-RCH-002'])
    expect(prefixes(root)).toEqual({ 'ntf-archive': 'RCH', 'ntf-pm': 'PM' })
  }, T)

  test('a recorded prefix is fixed: it wins over the derivation', () => {
    const { root, home } = project()
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8'))
    put(root, '.prdt/config.json', JSON.stringify({ ...cfg, ticket_prefixes: { 'ntf-archive': 'NRC' } }, null, 2))
    expect(cli(root, home, mk('a1', 'ntf-archive')).code).toBe(0)
    expect(ids(root)).toEqual(['T-NRC-001'])
  }, T)

  test('a prefix another project on this machine holds is skipped: one more consonant', () => {
    const { root, home } = project()
    const other = path.join(tmp('prdt-t1298-other-'), 'other')
    put(other, '.prdt/config.json', JSON.stringify({ slug: 'other', ticket_prefixes: { other: 'RCH' } }))
    put(home, 'run/open-roots', `${other}\n`)
    expect(cli(root, home, mk('a1', 'ntf-archive')).code).toBe(0)
    expect(ids(root)).toEqual(['T-RCHV-001'])
    expect(prefixes(root)).toEqual({ 'ntf-archive': 'RCHV' })
  }, T)

  test('--dry-run consumes no id and records no prefix', () => {
    const { root, home } = project()
    const r = cli(root, home, [...mk('a1', 'ntf-archive'), '--dry-run'])
    expect(r.code, r.err).toBe(0)
    expect(r.out).toContain('T-RCH-001.md')
    expect(ids(root)).toEqual([])
    expect(prefixes(root)).toBeUndefined()
  }, T)

  test('tickets fmt --check passes old T-NNN and new T-<PREFIX>-<n> together', () => {
    const { root, home } = project()
    for (const [slug, prod] of [['g1', undefined], ['a1', 'ntf-archive'], ['p1', 'ntf-pm']] as const) {
      expect(cli(root, home, mk(slug, prod)).code).toBe(0)
    }
    const r = cli(root, home, ['tickets', 'fmt', 'T-001', 'T-RCH-001', 'T-PM-001', '--check'])
    expect(r.code, r.out + r.err).toBe(0)
  }, T)
})
