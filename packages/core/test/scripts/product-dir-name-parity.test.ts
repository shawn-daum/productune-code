/**
 * T-1215 — the layout-reserved product folder names, one rule in every copy:
 * Python `product_dir_name` (prdt_lanes.py) · viewer `productDirName` · init-project.mjs
 * `productDirName` (the GUI heal path). Plus the added-product side: a reserved
 * `products[].name` is refused (warning · `tickets new --product`).
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const LANES = path.join(CORE_ROOT, 'scripts', 'prdt_lanes.py')
const VIEWER_MJS = path.resolve(CORE_ROOT, '..', 'viewer', 'lib', 'docs-layout.mjs')
const INIT_MJS = path.join(CORE_ROOT, 'scripts', 'lib', 'init-project.mjs')

const INPUTS = ['qa', 'QA', 'archive', 'prd', 'Tickets', 'wiki', 'features', 'artifacts', 'po', 'designer', 'developer',
  '', '!!!', 'v1', 'backlog', 'my-app', 'qa-product', 'Q A']

let tmp: string
let home: string
const env = () => ({ ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_LANG: 'en', NO_COLOR: '1' })
function prdt(cwd: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], { cwd, encoding: 'utf8', env: env(), timeout: subprocessTimeout('cli') })
  return { out: r.stdout + r.stderr, code: r.status }
}
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1215-'))
  home = path.join(tmp, 'home')
  fs.mkdirSync(home)
})
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('T-1215 reserved product folder names — copy parity', () => {
  test('Python · viewer · init-project.mjs agree on every input (reserved → <name>-product)', async () => {
    const py = spawnSync('python3', ['-I', '-c',
      'import sys,json,importlib.machinery as M,importlib.util as U\n' +
      'l=M.SourceFileLoader("m",sys.argv[1]);s=U.spec_from_loader("m",l);m=U.module_from_spec(s);l.exec_module(m)\n' +
      'print(json.dumps([m.product_dir_name(x) for x in json.loads(sys.argv[2])]))', LANES, JSON.stringify(INPUTS)],
    { encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(py.status).toBe(0)
    const want: string[] = JSON.parse(py.stdout)
    const viewer = await import(VIEWER_MJS)
    const init = await import(INIT_MJS)
    expect(INPUTS.map((x) => viewer.productDirName(x))).toEqual(want)
    expect(INPUTS.map((x) => init.productDirName(x))).toEqual(want)
    expect(want[INPUTS.indexOf('qa')]).toBe('qa-product')
    expect(want[INPUTS.indexOf('archive')]).toBe('archive-product')
    expect(want[INPUTS.indexOf('')]).toBe('product')
  })
})

describe('T-1215 reserved added product name', () => {
  function project(): string {
    const root = path.join(tmp, 'rp')
    fs.mkdirSync(root, { recursive: true })
    expect(prdt(root, ['init', '--json', '--slug', 'proj', '--yes']).code).toBe(0)
    const cfgPath = path.join(root, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.products = [{ name: 'qa' }]
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
    return root
  }
  test('tickets new --product qa is refused and writes nothing; doctor names it', () => {
    const root = project()
    const r = prdt(root, ['tickets', 'new', '--product', 'qa', '--type', 'impl', '--slug', 'x'])
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('--product qa is not a product declared')
    expect(fs.existsSync(path.join(root, 'docs', 'qa'))).toBe(false)
    const d = prdt(root, ['doctor'])
    expect(d.out).toMatch(/products: `qa` is a layout-reserved folder name/)
  }, 120_000)

  test('layout check on an old layout with added products no longer points at migrate', () => {
    const root = path.join(tmp, 'ol')
    fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
    expect(prdt(root, ['init', '--json', '--slug', 'proj', '--yes']).code).toBe(0)
    fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
    const cfgPath = path.join(root, '.prdt', 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.products = [{ name: 'mobile' }]
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
    const r = prdt(root, ['layout', 'check'])
    expect(r.out).toContain('docs 폴더가 예전 구조예요.')
    expect(r.out).not.toContain('layout migrate 로 옮길 목록을 확인하세요')
    expect(r.out).toContain('제품 여럿')
  }, 120_000)
})
