/**
 * T-1227 — the viewer's env screen follows the approved v1.14 screen set
 * (docs/productune/artifacts/v1.14/env-machine-placement/approved.png): its own
 * activity-bar store, sidebar = one group per product plus a machine-scope group,
 * ONE item per env file, body = the selected file only; machine scope with no
 * keys shows an empty item and the empty card. Runs the real generator of this
 * checkout on a fixture project. Env files hold placeholder values only.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeAll } from 'vitest'

const VIEWER_CLI = path.resolve(__dirname, '..', '..', '..', 'viewer', 'cli.mjs')
const HAS_DEPS = fs.existsSync(path.resolve(__dirname, '..', '..', '..', 'viewer', 'node_modules'))

function write(root: string, rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}

function render(machineEnv: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1227-'))
  const root = path.join(dir, 'proj')
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntfpm', code: { dir: 'code' }, products: [{ name: 'sidekick', code: { dir: 'archive-code' } }] }))
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'ship', version: 'v2.2', current_task: null, products: { sidekick: { stage: 'idle', version: 'v1.1' } } }))
  write(root, 'docs/prd/PRD.md', '# PRD\n\n## v2.2\n\ngoal\n')
  write(root, 'code/.gitkeep', '')
  write(root, 'archive-code/.env.local', 'PLACEHOLDER_ONE=placeholder\nPLACEHOLDER_TWO=\n')
  write(root, 'archive-code/.env.example', 'PLACEHOLDER_ONE=\nPLACEHOLDER_TWO=\n')
  const prdtHome = path.join(dir, 'prdt-home')
  if (machineEnv !== null) write(prdtHome, 'env/.env', machineEnv)
  else fs.mkdirSync(prdtHome, { recursive: true })
  const out = path.join(dir, 'viewer.html')
  execFileSync('node', [VIEWER_CLI, '--repo-root', root, '--out', out], { env: { ...process.env, HOME: path.join(dir, 'home'), PRDT_HOME: prdtHome }, stdio: 'pipe' })
  if (process.env.KEEP_HTML) fs.copyFileSync(out, process.env.KEEP_HTML + (machineEnv === null ? '.empty' : '') + '.html')
  return fs.readFileSync(out, 'utf8')
}

const section = (html: string, key: string) => {
  const m = new RegExp(`<section class="store-section[^"]*" data-store="${key}"[\\s\\S]*?</section>`).exec(html)
  return m ? m[0] : ''
}
const items = (sec: string) => [...sec.matchAll(/<button[^>]*data-group-select="([^"]*)"[^>]*><span>([^<]*)<\/span>(?:<span class="nav-item-count">([^<]*)<\/span>)?<\/button>/g)].map((m) => ({ key: m[1], label: m[2], count: m[3] }))
const heads = (sec: string) => [...sec.matchAll(/<div class="ls-h"><b>([^<]*)<\/b><span class="ls-st">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]])
const pane = (sec: string, key: string) => new RegExp(`<div class="view-pane[^"]*" data-group="${key.replace(/[.$]/g, '\\$&')}">([\\s\\S]*?)</div>\\n?(?=<div class="view-pane|</div>\\s*<div class="detail-panel)`).exec(sec)?.[1] ?? ''

describe.skipIf(!HAS_DEPS)('viewer env screen — sidebar per file (T-1227)', () => {
  let html: string
  let empty: string
  beforeAll(() => {
    html = render('PLACEHOLDER_ONE=placeholder\nPLACEHOLDER_TWO=\n')
    empty = render(null)
  }, 120000)

  test('env stays an activity-bar store; T-1397: home has a per-product env group (names + state only), no env block in progress', () => {
    expect(html).toMatch(/<button[^>]*class="activity-btn[^"]*"[^>]*data-store="env"/)
    const home = section(html, 'home')
    expect(items(home).filter((i) => i.label === 'env').length).toBe(2) // one per product
    expect(items(home).filter((i) => i.label === 'env').map((i) => pane(home, i.key)).join('')).toContain('env-card')
    expect(home).not.toContain('data-env-copy')
    expect(home).not.toContain('PLACEHOLDER_ONE=')
    expect(home).toContain('이 제품에는 env 파일이 없어요.')
    const progress = items(home).filter((i) => i.label === '진행 상황').map((i) => pane(home, i.key)).join('')
    expect(progress).not.toContain('env-card')
  })

  test('T-1395: the machine-scope card carries the three open controls, link names no path', () => {
    const sec = section(html, 'env')
    const machine = pane(sec, items(sec).pop()!.key)
    expect(machine).toContain('href="prdt://open-env?scope=machine"')
    expect(machine).toContain('data-env-copy=')
    expect(machine).not.toContain('placeholder')
  })

  test('sidebar = a group per product and the machine scope, one item per file', () => {
    const sec = section(html, 'env')
    expect(heads(sec)).toEqual([['ntfpm v2.2', 'ship'], ['sidekick', 'idle'], ['기기 범위', '~/.prdt/env']])
    expect(items(sec).map((i) => [i.label, i.count])).toEqual([
      ['env 파일 없음', undefined],
      ['.env.local', '2'],
      ['.env.example · 견본', '2'],
      ['.env', '2'],
    ])
  })

  test('body = the selected file only', () => {
    const sec = section(html, 'env')
    const keys = items(sec).map((i) => i.key)
    const local = pane(sec, keys[1])
    expect(local).toContain('<b>.env.local</b>')
    expect(local).not.toContain('<b>.env.example</b>')
    expect(local).not.toContain('<b>.env</b>')
    const machine = pane(sec, keys[3])
    expect(machine).toContain('<b>.env</b>')
    expect(machine).toContain('~/.prdt/env')
    expect(machine).not.toContain('.env.local')
  })

  test('machine scope with no keys: an empty item and the empty card', () => {
    const sec = section(empty, 'env')
    const last = items(sec).pop()!
    expect(last.label).toBe('키 없음')
    expect(last.count).toBeUndefined()
    expect(pane(sec, last.key)).toContain('기기 범위에 저장된 키가 없어요.')
  })
})
