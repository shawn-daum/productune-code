/**
 * prdt-products-rename.test.ts — T-1108 (design ⑦): release `lines` → `products`.
 * Config `products` and po-state `products.<name>` are the keys; a pre-v1.14
 * `lines` is read AND migrated once; `--product` is the flag (`--line` kept as
 * an alias); a resource marker carries `product=` only for a non-first product.
 * Every run uses a scratch project and a scratch PRDT_HOME.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
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
function project(key: 'lines' | 'products', task: string | null): string {
  const root = tmp('prdt-products-')
  put(root, '.prdt/config.json', JSON.stringify({ slug: 'shop', surfaces: {}, [key]: [{ name: 'android' }] }, null, 2) + '\n')
  put(root, '.prdt/po-state.json', JSON.stringify({
    schema_version: 1, stage: 'build', version: 'v1.0',
    current_task: task ? { ticket_id: task, slug: 's', assignee: 'developer' } : null,
    [key]: { android: { stage: 'build', version: 'v2.1' } },
  }, null, 2) + '\n')
  const t = (dir: string, id: string) => put(root, `docs/tickets/${dir}/${id}.md`, ['---', `id: ${id}`, `slug: s-${id.toLowerCase()}`,
    'type: impl', 'status: open', 'assignee: developer', 'created: 2026-10-12', '---', '', '## problem', '', '- x', '', '## acceptance', '', '- x', ''].join('\n'))
  t('v1.0', 'T-001')
  t('android/v2.1', 'T-002')
  put(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0 — home\n\n- w\n\n## android v2.1 — app\n\n- l\n')
  return root
}

describe('T-1108 lines → products', () => {
  test('a legacy `lines` config + po-state is read as products and rewritten once', () => {
    const root = project('lines', 'T-002')
    const home = tmp('prdt-products-home-')
    const r = cli(root, home, ['schedule', '--product', 'android', '--json'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).version).toBe('android/v2.1')
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8'))
    const st = JSON.parse(fs.readFileSync(path.join(root, '.prdt/po-state.json'), 'utf8'))
    expect(cfg.products).toEqual([{ name: 'android' }])
    expect('lines' in cfg).toBe(false)
    expect(st.products.android.version).toBe('v2.1')
    expect('lines' in st).toBe(false)
    expect(Object.keys(cfg)).toEqual(['slug', 'surfaces', 'products'])
  }, T)

  test('a file that already has `products` is left alone', () => {
    const root = project('products', null)
    const before = fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')
    cli(root, tmp('prdt-products-home-'), ['schedule', '--json'])
    expect(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).toBe(before)
  }, T)

  test('doctor names the products check, not release lines', () => {
    const root = project('products', null)
    const r = cli(root, tmp('prdt-products-home-'), ['doctor'])
    expect(r.out + r.err).not.toMatch(/release lines/)
  }, T)

  test('--product is the flag; an unknown product names `products`', () => {
    const root = project('products', null)
    const r = cli(root, tmp('prdt-products-home-'), ['schedule', '--product', 'ios'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('--product ios is not a product declared in .prdt/config.json `products`')
  }, T)

  test('resource ls: product= only for a non-first product, after project=', () => {
    const home = tmp('prdt-products-home-')
    const a = project('products', 'T-002')
    expect(cli(a, home, ['resource', 'up', 'emu', '--dispatch', 'd-1']).code).toBe(0)
    const b = project('products', 'T-001')
    expect(cli(b, home, ['resource', 'up', 'emu', '--dispatch', 'd-2']).code).toBe(0)
    const out = cli(a, home, ['resource', 'ls']).out
    expect(out).toMatch(/dispatch=d-1 project=shop product=android since=/)
    expect(out).toMatch(/dispatch=d-2 project=shop since=/)
    expect(out).not.toContain('line=')
  }, T)

  test('a pre-v1.14 marker with `line` still reads as product', () => {
    const home = tmp('prdt-products-home-')
    put(home, 'run/resources/old/d-9.json', JSON.stringify({ resource: 'old', dispatch: 'd-9', project: 'shop', line: 'android', since: '2026-10-12T00:00Z' }))
    const r = cli(project('products', null), home, ['resource', 'ls'])
    expect(r.out).toContain('dispatch=d-9 project=shop product=android since=')
  }, T)
})
